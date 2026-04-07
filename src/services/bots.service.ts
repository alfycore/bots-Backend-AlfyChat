// ==========================================
// ALFYCHAT - BOTS SERVICE
// ==========================================

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDatabase, getRedis } from '../index';
import { Bot, BotCommand, CreateBotDTO, CreateCommandDTO, AddBotToServerDTO, BotStatus } from '../types';

export class BotsService {
  private get db() {
    return getDatabase();
  }
  
  private get redis() {
    return getRedis();
  }

  // Générer un token sécurisé pour le bot
  private generateBotToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // ==========================================
  // GESTION DES BOTS
  // ==========================================

  async create(data: CreateBotDTO): Promise<Bot> {
    const id = uuidv4();
    const token = this.generateBotToken();
    const now = new Date();
    
    await this.db.execute(
      `INSERT INTO bots (id, owner_id, name, description, token, prefix, status, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'offline', 0, ?, ?)`,
      [id, data.ownerId, data.name, data.description || null, token, data.prefix || '!', now, now]
    );
    
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

  async getById(id: string, includeToken: boolean = false): Promise<Bot | null> {
    const [rows] = await this.db.execute(
      `SELECT * FROM bots WHERE id = ?`,
      [id]
    );
    
    const bots = rows as any[];
    if (bots.length === 0) return null;
    
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
      status: bot.status as BotStatus,
      isPublic: !!bot.is_public,
      servers,
      commands,
      createdAt: new Date(bot.created_at),
      updatedAt: new Date(bot.updated_at)
    };
  }

  async getByOwner(ownerId: string): Promise<Bot[]> {
    const [rows] = await this.db.execute(
      `SELECT * FROM bots WHERE owner_id = ? ORDER BY created_at DESC`,
      [ownerId]
    );
    
    const bots = rows as any[];
    const result: Bot[] = [];
    
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
        status: bot.status as BotStatus,
        isPublic: !!bot.is_public,
        servers,
        commands,
        createdAt: new Date(bot.created_at),
        updatedAt: new Date(bot.updated_at)
      });
    }
    
    return result;
  }

  async getPublicBots(): Promise<Bot[]> {
    const [rows] = await this.db.execute(
      `SELECT * FROM bots WHERE is_public = 1 AND status != 'maintenance' ORDER BY name ASC`
    );
    
    const bots = rows as any[];
    const result: Bot[] = [];
    
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
        status: bot.status as BotStatus,
        isPublic: true,
        servers,
        commands,
        createdAt: new Date(bot.created_at),
        updatedAt: new Date(bot.updated_at)
      });
    }
    
    return result;
  }

  async update(id: string, ownerId: string, updates: Partial<Bot>): Promise<Bot | null> {
    const bot = await this.getById(id);
    if (!bot || bot.ownerId !== ownerId) return null;
    
    const allowedUpdates = ['name', 'description', 'avatarUrl', 'prefix', 'isPublic'];
    const setClause: string[] = [];
    const values: any[] = [];
    
    for (const key of allowedUpdates) {
      if (updates[key as keyof Bot] !== undefined) {
        const dbKey = key === 'avatarUrl' ? 'avatar_url' : 
                      key === 'isPublic' ? 'is_public' : key;
        setClause.push(`${dbKey} = ?`);
        values.push(updates[key as keyof Bot]);
      }
    }
    
    if (setClause.length === 0) return bot;
    
    setClause.push('updated_at = ?');
    values.push(new Date());
    values.push(id);
    
    await this.db.execute(
      `UPDATE bots SET ${setClause.join(', ')} WHERE id = ?`,
      values
    );
    
    return this.getById(id);
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    const bot = await this.getById(id);
    if (!bot || bot.ownerId !== ownerId) return false;
    
    // Supprimer les relations
    await this.db.execute(`DELETE FROM bot_servers WHERE bot_id = ?`, [id]);
    await this.db.execute(`DELETE FROM bot_commands WHERE bot_id = ?`, [id]);
    await this.db.execute(`DELETE FROM bots WHERE id = ?`, [id]);
    
    return true;
  }

  async regenerateToken(id: string, ownerId: string): Promise<string | null> {
    const bot = await this.getById(id);
    if (!bot || bot.ownerId !== ownerId) return null;
    
    const newToken = this.generateBotToken();
    
    await this.db.execute(
      `UPDATE bots SET token = ?, updated_at = ? WHERE id = ?`,
      [newToken, new Date(), id]
    );
    
    return newToken;
  }

  async updateStatus(id: string, status: BotStatus): Promise<boolean> {
    await this.db.execute(
      `UPDATE bots SET status = ?, updated_at = ? WHERE id = ?`,
      [status, new Date(), id]
    );
    
    // Mettre à jour le cache Redis
    await this.redis.set(`bot:${id}:status`, status);
    await this.redis.publish('bot:status', JSON.stringify({ botId: id, status }));
    
    return true;
  }

  // ==========================================
  // GESTION DES COMMANDES
  // ==========================================

  async getCommands(botId: string): Promise<BotCommand[]> {
    const [rows] = await this.db.execute(
      `SELECT * FROM bot_commands WHERE bot_id = ? ORDER BY name ASC`,
      [botId]
    );
    
    return (rows as any[]).map(row => ({
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

  async createCommand(data: CreateCommandDTO): Promise<BotCommand> {
    const id = uuidv4();
    
    await this.db.execute(
      `INSERT INTO bot_commands (id, bot_id, name, description, usage, cooldown, permissions, is_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, data.botId, data.name, data.description, data.usage || '', data.cooldown || 0, data.permissions || 0]
    );
    
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

  async updateCommand(id: string, botId: string, updates: Partial<BotCommand>): Promise<BotCommand | null> {
    const allowedUpdates = ['name', 'description', 'usage', 'isEnabled', 'cooldown', 'permissions'];
    const setClause: string[] = [];
    const values: any[] = [];
    
    for (const key of allowedUpdates) {
      if (updates[key as keyof BotCommand] !== undefined) {
        const dbKey = key === 'isEnabled' ? 'is_enabled' : key;
        setClause.push(`${dbKey} = ?`);
        values.push(updates[key as keyof BotCommand]);
      }
    }
    
    if (setClause.length === 0) return null;
    
    values.push(id);
    values.push(botId);
    
    await this.db.execute(
      `UPDATE bot_commands SET ${setClause.join(', ')} WHERE id = ? AND bot_id = ?`,
      values
    );
    
    const [rows] = await this.db.execute(
      `SELECT * FROM bot_commands WHERE id = ?`,
      [id]
    );
    
    const commands = rows as any[];
    if (commands.length === 0) return null;
    
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

  async deleteCommand(id: string, botId: string): Promise<boolean> {
    const [result] = await this.db.execute(
      `DELETE FROM bot_commands WHERE id = ? AND bot_id = ?`,
      [id, botId]
    );
    
    return (result as any).affectedRows > 0;
  }

  // ==========================================
  // GESTION DES SERVEURS
  // ==========================================

  async getBotServers(botId: string): Promise<string[]> {
    const [rows] = await this.db.execute(
      `SELECT server_id FROM bot_servers WHERE bot_id = ?`,
      [botId]
    );
    
    return (rows as any[]).map(row => row.server_id);
  }

  async addToServer(data: AddBotToServerDTO): Promise<boolean> {
    const bot = await this.getById(data.botId);
    if (!bot) return false;
    
    // Vérifier si déjà ajouté
    const [existing] = await this.db.execute(
      `SELECT * FROM bot_servers WHERE bot_id = ? AND server_id = ?`,
      [data.botId, data.serverId]
    );
    
    if ((existing as any[]).length > 0) return false;
    
    await this.db.execute(
      `INSERT INTO bot_servers (bot_id, server_id, permissions, added_at)
       VALUES (?, ?, ?, ?)`,
      [data.botId, data.serverId, data.permissions, new Date()]
    );
    
    // Notifier via Redis
    await this.redis.publish('bot:joined', JSON.stringify({
      botId: data.botId,
      serverId: data.serverId
    }));
    
    return true;
  }

  async removeFromServer(botId: string, serverId: string): Promise<boolean> {
    const [result] = await this.db.execute(
      `DELETE FROM bot_servers WHERE bot_id = ? AND server_id = ?`,
      [botId, serverId]
    );
    
    if ((result as any).affectedRows > 0) {
      await this.redis.publish('bot:left', JSON.stringify({ botId, serverId }));
      return true;
    }
    
    return false;
  }

  async getBotsInServer(serverId: string): Promise<Bot[]> {
    const [rows] = await this.db.execute(
      `SELECT b.* FROM bots b
       INNER JOIN bot_servers bs ON b.id = bs.bot_id
       WHERE bs.server_id = ?`,
      [serverId]
    );
    
    const bots = rows as any[];
    const result: Bot[] = [];
    
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
        status: bot.status as BotStatus,
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

  async authenticateBot(token: string): Promise<Bot | null> {
    const [rows] = await this.db.execute(
      `SELECT * FROM bots WHERE token = ?`,
      [token]
    );
    
    const bots = rows as any[];
    if (bots.length === 0) return null;
    
    const bot = bots[0];
    return this.getById(bot.id, true);
  }
}

export const botsService = new BotsService();
