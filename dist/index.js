"use strict";
// ==========================================
// ALFYCHAT - SERVICE BOTS
// Gestion des bots et de leurs permissions
// ==========================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.app = void 0;
exports.getDatabase = getDatabase;
exports.getRedis = getRedis;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const promise_1 = __importDefault(require("mysql2/promise"));
const redis_1 = require("redis");
const winston_1 = __importDefault(require("winston"));
const routes_1 = require("./routes");
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use(express_1.default.json());
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.simple()),
    transports: [new winston_1.default.transports.Console()],
});
exports.logger = logger;
// ==========================================
// DATABASE & REDIS
// ==========================================
let pool;
let redisClient;
function getDatabase() {
    return pool;
}
function getRedis() {
    return redisClient;
}
// ==========================================
// DÉMARRAGE DU SERVICE
// ==========================================
async function startService() {
    try {
        // Connexion MySQL
        pool = promise_1.default.createPool({
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
        redisClient = (0, redis_1.createClient)({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });
        redisClient.on('error', (err) => logger.error('Redis Client Error', err));
        await redisClient.connect();
        logger.info('Connexion Redis établie');
        // Routes
        app.use('/bots', routes_1.botsRouter);
        // Health check
        app.get('/health', (req, res) => {
            res.json({ status: 'ok', service: 'bots' });
        });
        const PORT = process.env.PORT || 3006;
        app.listen(PORT, () => {
            logger.info(`Service Bots démarré sur le port ${PORT}`);
        });
    }
    catch (error) {
        logger.error('Erreur de démarrage:', error);
        process.exit(1);
    }
}
startService();
//# sourceMappingURL=index.js.map