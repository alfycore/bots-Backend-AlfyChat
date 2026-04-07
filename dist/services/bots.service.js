"use strict";
// ==========================================
// ALFYCHAT - BOTS SERVICE
// ==========================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.botsService = exports.BotsService = void 0;
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const index_1 = require("../index");
class BotsService {
    get db() {
        return (0, index_1.getDatabase)();
    }
    get redis() {
        return (0, index_1.getRedis)();
    }
    // Générer un token sécurisé pour le bot
    generateBotToken() {
        return crypto_1.default.randomBytes(32).toString('hex');
    }
    // ==========================================
    // GESTION DES BOTS
    // ==========================================
    async create(data) {
        const id = (0, uuid_1.v4)();
        const token = this.generateBotToken();
        const now = new Date();
        await this.db.execute(`INSERT INTO bots (id, owner_id, name, description, token, prefix, status, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'offline', 0, ?, ?)`, [id, data.ownerId, data.name, data.description || null, token, data.prefix || '!', now, now]);
        return {
            id,
            ownerId: data.ownerId,
            name: data.name,
            description: data.description,
            token,
            prefix: data.prefix || '!',
            status: 'offline',
            isPublic: false,
            servers: [],
            commands: [],
            createdAt: now,
            updatedAt: now
        };
    }
    async getById(id, includeToken = false) {
        const [rows] = await this.db.execute(`SELECT * FROM bots WHERE id = ?`, [id]);
        const bots = rows;
        if (bots.length === 0)
            return null;
        const bot = bots[0];
        const servers = await this.getBotServers(id);
        const commands = await this.getCommands(id);
        return {
            id: bot.id,
            ownerId: bot.owner_id,
            name: bot.name,
            description: bot.description,
            avatarUrl: bot.avatar_url,
            token: includeToken ? bot.token : '[HIDDEN]',
            prefix: bot.prefix,
            status: bot.status,
            isPublic: !!bot.is_public,
            servers,
            commands,
            createdAt: new Date(bot.created_at),
            updatedAt: new Date(bot.updated_at)
        };
    }
    async getByOwner(ownerId) {
        const [rows] = await this.db.execute(`SELECT * FROM bots WHERE owner_id = ? ORDER BY created_at DESC`, [ownerId]);
        const bots = rows;
        const result = [];
        for (const bot of bots) {
            const servers = await this.getBotServers(bot.id);
            const commands = await this.getCommands(bot.id);
            result.push({
                id: bot.id,
                ownerId: bot.owner_id,
                name: bot.name,
                description: bot.description,
                avatarUrl: bot.avatar_url,
                token: '[HIDDEN]',
                prefix: bot.prefix,
                status: bot.status,
                isPublic: !!bot.is_public,
                servers,
                commands,
                createdAt: new Date(bot.created_at),
                updatedAt: new Date(bot.updated_at)
            });
        }
        return result;
    }
    async getPublicBots() {
        const [rows] = await this.db.execute(`SELECT * FROM bots WHERE is_public = 1 AND status != 'maintenance' ORDER BY name ASC`);
        const bots = rows;
        const result = [];
        for (const bot of bots) {
            const servers = await this.getBotServers(bot.id);
            const commands = await this.getCommands(bot.id);
            result.push({
                id: bot.id,
                ownerId: bot.owner_id,
                name: bot.name,
                description: bot.description,
                avatarUrl: bot.avatar_url,
                token: '[HIDDEN]',
                prefix: bot.prefix,
                status: bot.status,
                isPublic: true,
                servers,
                commands,
                createdAt: new Date(bot.created_at),
                updatedAt: new Date(bot.updated_at)
            });
        }
        return result;
    }
    async update(id, ownerId, updates) {
        const bot = await this.getById(id);
        if (!bot || bot.ownerId !== ownerId)
            return null;
        const allowedUpdates = ['name', 'description', 'avatarUrl', 'prefix', 'isPublic'];
        const setClause = [];
        const values = [];
        for (const key of allowedUpdates) {
            if (updates[key] !== undefined) {
                const dbKey = key === 'avatarUrl' ? 'avatar_url' :
                    key === 'isPublic' ? 'is_public' : key;
                setClause.push(`${dbKey} = ?`);
                values.push(updates[key]);
            }
        }
        if (setClause.length === 0)
            return bot;
        setClause.push('updated_at = ?');
        values.push(new Date());
        values.push(id);
        await this.db.execute(`UPDATE bots SET ${setClause.join(', ')} WHERE id = ?`, values);
        return this.getById(id);
    }
    async delete(id, ownerId) {
        const bot = await this.getById(id);
        if (!bot || bot.ownerId !== ownerId)
            return false;
        // Supprimer les relations
        await this.db.execute(`DELETE FROM bot_servers WHERE bot_id = ?`, [id]);
        await this.db.execute(`DELETE FROM bot_commands WHERE bot_id = ?`, [id]);
        await this.db.execute(`DELETE FROM bots WHERE id = ?`, [id]);
        return true;
    }
    async regenerateToken(id, ownerId) {
        const bot = await this.getById(id);
        if (!bot || bot.ownerId !== ownerId)
            return null;
        const newToken = this.generateBotToken();
        await this.db.execute(`UPDATE bots SET token = ?, updated_at = ? WHERE id = ?`, [newToken, new Date(), id]);
        return newToken;
    }
    async updateStatus(id, status) {
        await this.db.execute(`UPDATE bots SET status = ?, updated_at = ? WHERE id = ?`, [status, new Date(), id]);
        // Mettre à jour le cache Redis
        await this.redis.set(`bot:${id}:status`, status);
        await this.redis.publish('bot:status', JSON.stringify({ botId: id, status }));
        return true;
    }
    // ==========================================
    // GESTION DES COMMANDES
    // ==========================================
    async getCommands(botId) {
        const [rows] = await this.db.execute(`SELECT * FROM bot_commands WHERE bot_id = ? ORDER BY name ASC`, [botId]);
        return rows.map(row => ({
            id: row.id,
            botId: row.bot_id,
            name: row.name,
            description: row.description,
            usage: row.usage,
            isEnabled: !!row.is_enabled,
            cooldown: row.cooldown,
            permissions: row.permissions
        }));
    }
    async createCommand(data) {
        const id = (0, uuid_1.v4)();
        await this.db.execute(`INSERT INTO bot_commands (id, bot_id, name, description, usage, cooldown, permissions, is_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`, [id, data.botId, data.name, data.description, data.usage || '', data.cooldown || 0, data.permissions || 0]);
        return {
            id,
            botId: data.botId,
            name: data.name,
            description: data.description,
            usage: data.usage || '',
            isEnabled: true,
            cooldown: data.cooldown || 0,
            permissions: data.permissions || 0
        };
    }
    async updateCommand(id, botId, updates) {
        const allowedUpdates = ['name', 'description', 'usage', 'isEnabled', 'cooldown', 'permissions'];
        const setClause = [];
        const values = [];
        for (const key of allowedUpdates) {
            if (updates[key] !== undefined) {
                const dbKey = key === 'isEnabled' ? 'is_enabled' : key;
                setClause.push(`${dbKey} = ?`);
                values.push(updates[key]);
            }
        }
        if (setClause.length === 0)
            return null;
        values.push(id);
        values.push(botId);
        await this.db.execute(`UPDATE bot_commands SET ${setClause.join(', ')} WHERE id = ? AND bot_id = ?`, values);
        const [rows] = await this.db.execute(`SELECT * FROM bot_commands WHERE id = ?`, [id]);
        const commands = rows;
        if (commands.length === 0)
            return null;
        const cmd = commands[0];
        return {
            id: cmd.id,
            botId: cmd.bot_id,
            name: cmd.name,
            description: cmd.description,
            usage: cmd.usage,
            isEnabled: !!cmd.is_enabled,
            cooldown: cmd.cooldown,
            permissions: cmd.permissions
        };
    }
    async deleteCommand(id, botId) {
        const [result] = await this.db.execute(`DELETE FROM bot_commands WHERE id = ? AND bot_id = ?`, [id, botId]);
        return result.affectedRows > 0;
    }
    // ==========================================
    // GESTION DES SERVEURS
    // ==========================================
    async getBotServers(botId) {
        const [rows] = await this.db.execute(`SELECT server_id FROM bot_servers WHERE bot_id = ?`, [botId]);
        return rows.map(row => row.server_id);
    }
    async addToServer(data) {
        const bot = await this.getById(data.botId);
        if (!bot)
            return false;
        // Vérifier si déjà ajouté
        const [existing] = await this.db.execute(`SELECT * FROM bot_servers WHERE bot_id = ? AND server_id = ?`, [data.botId, data.serverId]);
        if (existing.length > 0)
            return false;
        await this.db.execute(`INSERT INTO bot_servers (bot_id, server_id, permissions, added_at)
       VALUES (?, ?, ?, ?)`, [data.botId, data.serverId, data.permissions, new Date()]);
        // Notifier via Redis
        await this.redis.publish('bot:joined', JSON.stringify({
            botId: data.botId,
            serverId: data.serverId
        }));
        return true;
    }
    async removeFromServer(botId, serverId) {
        const [result] = await this.db.execute(`DELETE FROM bot_servers WHERE bot_id = ? AND server_id = ?`, [botId, serverId]);
        if (result.affectedRows > 0) {
            await this.redis.publish('bot:left', JSON.stringify({ botId, serverId }));
            return true;
        }
        return false;
    }
    async getBotsInServer(serverId) {
        const [rows] = await this.db.execute(`SELECT b.* FROM bots b
       INNER JOIN bot_servers bs ON b.id = bs.bot_id
       WHERE bs.server_id = ?`, [serverId]);
        const bots = rows;
        const result = [];
        for (const bot of bots) {
            const servers = await this.getBotServers(bot.id);
            const commands = await this.getCommands(bot.id);
            result.push({
                id: bot.id,
                ownerId: bot.owner_id,
                name: bot.name,
                description: bot.description,
                avatarUrl: bot.avatar_url,
                token: '[HIDDEN]',
                prefix: bot.prefix,
                status: bot.status,
                isPublic: !!bot.is_public,
                servers,
                commands,
                createdAt: new Date(bot.created_at),
                updatedAt: new Date(bot.updated_at)
            });
        }
        return result;
    }
    // ==========================================
    // AUTHENTIFICATION BOT
    // ==========================================
    async authenticateBot(token) {
        const [rows] = await this.db.execute(`SELECT * FROM bots WHERE token = ?`, [token]);
        const bots = rows;
        if (bots.length === 0)
            return null;
        const bot = bots[0];
        return this.getById(bot.id, true);
    }
}
exports.BotsService = BotsService;
exports.botsService = new BotsService();
//# sourceMappingURL=bots.service.js.map