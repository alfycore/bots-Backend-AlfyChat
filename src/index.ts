// ==========================================
// ALFYCHAT - SERVICE BOTS
// Gestion des bots et de leurs permissions
// ==========================================

import 'dotenv/config';
import path from 'path';
import { registerGlobalErrorHandlers } from './utils/error-reporter';
registerGlobalErrorHandlers();
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mysql, { Pool } from 'mysql2/promise';
import { createClient, RedisClientType } from 'redis';
import winston from 'winston';
import { botsRouter, oauth2Router } from './routes';
import { startServiceRegistration, serviceMetricsMiddleware, collectServiceMetrics } from './utils/service-client';

const _allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:4000')
  .split(',').map((o) => o.trim());

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
    if (_allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origine non autorisée — ${origin}`));
  },
  credentials: true,
}));
app.use(helmet());
app.use(express.json());
app.use(serviceMetricsMiddleware);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.simple()),
  transports: [new winston.transports.Console()],
});

// ==========================================
// DATABASE & REDIS
// ==========================================

let pool: Pool;
let redisClient: RedisClientType;

export function getDatabase() {
  return pool;
}

export function getRedis() {
  return redisClient;
}

// ==========================================
// DÉMARRAGE DU SERVICE
// ==========================================

async function startService() {
  try {
    // Connexion MySQL
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'alfychat',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 10000,
      idleTimeout: 60000
    });

    // Test de connexion
    await pool.execute('SELECT 1');
    logger.info('Connexion MySQL établie');

    // Créer les tables si elles n'existent pas
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS bots (
        id VARCHAR(36) PRIMARY KEY,
        owner_id VARCHAR(36) NOT NULL,
        name VARCHAR(32) NOT NULL,
        description VARCHAR(500),
        token VARCHAR(64) NOT NULL,
        prefix VARCHAR(5) DEFAULT '!',
        status ENUM('online','offline','maintenance') DEFAULT 'offline',
        is_public TINYINT(1) DEFAULT 0,
        is_verified TINYINT(1) DEFAULT 0,
        certification_status ENUM('none','pending','approved','rejected') DEFAULT 'none',
        certification_note VARCHAR(500),
        invite_count INT DEFAULT 0,
        tags JSON,
        avatar_url VARCHAR(500),
        website_url VARCHAR(500),
        support_server_url VARCHAR(500),
        privacy_policy_url VARCHAR(500),
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS bot_commands (
        id VARCHAR(36) PRIMARY KEY,
        bot_id VARCHAR(36) NOT NULL,
        name VARCHAR(32) NOT NULL,
        description VARCHAR(200) NOT NULL,
        \`usage\` VARCHAR(200),
        cooldown INT DEFAULT 0,
        permissions INT DEFAULT 0,
        is_enabled TINYINT(1) DEFAULT 1,
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS bot_servers (
        bot_id VARCHAR(36) NOT NULL,
        server_id VARCHAR(36) NOT NULL,
        permissions INT DEFAULT 0,
        added_at DATETIME NOT NULL,
        PRIMARY KEY (bot_id, server_id),
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS bot_certifications (
        id VARCHAR(36) PRIMARY KEY,
        bot_id VARCHAR(36) NOT NULL,
        owner_id VARCHAR(36) NOT NULL,
        reason TEXT NOT NULL,
        status ENUM('pending','approved','rejected') DEFAULT 'pending',
        reviewer_id VARCHAR(36),
        review_note VARCHAR(500),
        created_at DATETIME NOT NULL,
        reviewed_at DATETIME,
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )
    `);
    logger.info('Tables vérifiées/créées');

    // Migrations OAuth2 (idempotentes)
    // Note : pas de clause AFTER pour éviter les échecs si la colonne de référence n'existe pas encore
    try {
      await pool.execute(`ALTER TABLE bots ADD COLUMN client_secret VARCHAR(64)`);
      logger.info('Migration: colonne client_secret ajoutée');
    } catch (e: any) {
      if (!String(e?.message).toLowerCase().includes('duplicate')) {
        logger.warn(`Migration client_secret: ${e?.message}`);
      }
    }
    try {
      await pool.execute(`ALTER TABLE bots ADD COLUMN redirect_uris JSON`);
      logger.info('Migration: colonne redirect_uris ajoutée');
    } catch (e: any) {
      if (!String(e?.message).toLowerCase().includes('duplicate')) {
        logger.warn(`Migration redirect_uris: ${e?.message}`);
      }
    }

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS oauth2_codes (
        code VARCHAR(64) PRIMARY KEY,
        bot_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        server_id VARCHAR(36),
        scopes JSON NOT NULL,
        redirect_uri VARCHAR(500) NOT NULL,
        permissions INT DEFAULT 0,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS oauth2_tokens (
        access_token VARCHAR(64) PRIMARY KEY,
        bot_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        server_id VARCHAR(36),
        scopes JSON NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )
    `);

    // Backfill client_secret pour les bots existants
    const [botsNeedingSecret] = await pool.execute(`SELECT id FROM bots WHERE client_secret IS NULL`);
    const crypto = await import('crypto');
    for (const row of (botsNeedingSecret as any[])) {
      const secret = crypto.default.randomBytes(32).toString('hex');
      await pool.execute(`UPDATE bots SET client_secret = ? WHERE id = ?`, [secret, row.id]);
    }
    if ((botsNeedingSecret as any[]).length > 0) {
      logger.info(`Backfill client_secret: ${(botsNeedingSecret as any[]).length} bot(s) mis à jour`);
    }
    logger.info('Migrations OAuth2 appliquées');

    // Connexion Redis — optionnelle, le service continue sans Redis si AUTH échoue
    try {
      const host = process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.REDIS_PORT || '6379');
      const password = process.env.REDIS_PASSWORD;
      const clientConfig: any = {
        socket: {
          host,
          port,
          // Ne jamais réessayer : si la connexion échoue, on continue sans Redis
          reconnectStrategy: () => false,
          connectTimeout: 5000,
        },
      };
      if (process.env.REDIS_URL) {
        delete clientConfig.socket;
        clientConfig.url = process.env.REDIS_URL;
      } else if (password) {
        clientConfig.password = password;
      }

      const client = createClient(clientConfig);
      // Absorber les erreurs de client sans polluer les logs (AUTH peut échouer)
      client.on('error', () => {});
      await client.connect();
      // Vérifier que l'auth fonctionne vraiment avec un PING
      await client.ping();
      redisClient = client as RedisClientType;
      logger.info(`Connexion Redis établie (host=${host} port=${port})`);
    } catch (redisErr: any) {
      logger.warn(`Redis indisponible (${redisErr?.message || redisErr}) — le service continue sans Redis`);
    }

    // Routes
    app.use('/bots', botsRouter);
    app.use('/oauth2', oauth2Router);

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'bots' });
    });

    app.get('/metrics', (req, res) => {
      res.json({
        service: 'bots',
        serviceId: process.env.SERVICE_ID || 'bots-default',
        location: (process.env.SERVICE_LOCATION || 'EU').toUpperCase(),
        ...collectServiceMetrics(),
        uptime: process.uptime(),
      });
    });

    const PORT = process.env.PORT || 3006;
    app.listen(PORT, () => {
      logger.info(`Service Bots démarré sur le port ${PORT}`);
      startServiceRegistration('bots');
    });

  } catch (error) {
    logger.error('Erreur de démarrage:', error);
    process.exit(1);
  }
}

// -- HTML error pages (browser content-negotiation) --------------------------
app.get('/', (req, res, next) => {
  if (req.accepts(['html', 'json']) === 'html')
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  next();
});
app.use((req, res) => {
  if (req.accepts(['html', 'json']) === 'html')
    return res.status(404).sendFile(path.join(__dirname, '../public/errors/404.html'));
  res.status(404).json({ error: 'Route not found', path: req.path });
});
app.use((err: any, req: any, res: any, _next: any) => {
  if (req.accepts(['html', 'json']) === 'html')
    return res.status(500).sendFile(path.join(__dirname, '../public/errors/500.html'));
  res.status(500).json({ error: 'Internal server error' });
});

startService();

export { app, logger };
