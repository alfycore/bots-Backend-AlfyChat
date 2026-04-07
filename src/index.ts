// ==========================================
// ALFYCHAT - SERVICE BOTS
// Gestion des bots et de leurs permissions
// ==========================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mysql, { Pool } from 'mysql2/promise';
import { createClient, RedisClientType } from 'redis';
import winston from 'winston';
import { botsRouter } from './routes';

dotenv.config();

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

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

    // Connexion Redis
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    redisClient.on('error', (err: Error) => logger.error('Redis Client Error', err));
    await redisClient.connect();
    logger.info('Connexion Redis établie');

    // Routes
    app.use('/bots', botsRouter);

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'bots' });
    });

    const PORT = process.env.PORT || 3006;
    app.listen(PORT, () => {
      logger.info(`Service Bots démarré sur le port ${PORT}`);
    });

  } catch (error) {
    logger.error('Erreur de démarrage:', error);
    process.exit(1);
  }
}

startService();

export { app, logger };
