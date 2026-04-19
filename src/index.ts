// ==========================================
// ALFYCHAT - SERVICE BOTS
// Gestion des bots et de leurs permissions
// ==========================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mysql, { Pool } from 'mysql2/promise';
import { createClient, RedisClientType } from 'redis';
import winston from 'winston';
import { botsRouter } from './routes';
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
      queueLimit: 0
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

    // Connexion Redis — supporte REDIS_URL ou REDIS_HOST/REDIS_PORT/REDIS_PASSWORD
    function buildRedisUrl(): string {
      if (process.env.REDIS_URL) return process.env.REDIS_URL;
      const host = process.env.REDIS_HOST;
      const port = process.env.REDIS_PORT || '6379';
      const password = process.env.REDIS_PASSWORD;
      if (!host) return 'redis://localhost:6379';
      if (password) return `redis://${encodeURIComponent(password)}@${host}:${port}`;
      return `redis://${host}:${port}`;
    }

    async function connectRedisWithRetry(retries = 5, baseDelay = 1000) {
      const url = buildRedisUrl();
      for (let attempt = 1; attempt <= retries; attempt++) {
        let client;
        try {
          client = createClient({ url });
          client.on('error', (err: Error) => logger.error('Redis Client Error', err));
          await client.connect();
          logger.info(`Connexion Redis établie (host=${process.env.REDIS_HOST || 'from REDIS_URL'} port=${process.env.REDIS_PORT || 'unknown'})`);
          return client;
        } catch (err: any) {
          logger.warn(`Échec connexion Redis (tentative ${attempt}/${retries}): ${err && err.message ? err.message : err}`);
          try { if (client) await client.quit(); } catch (_) { /* ignore */ }
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, baseDelay * attempt));
            continue;
          }
          throw err;
        }
      }
    }

    redisClient = await connectRedisWithRetry();

    // Routes
    app.use('/bots', botsRouter);

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

startService();

export { app, logger };
