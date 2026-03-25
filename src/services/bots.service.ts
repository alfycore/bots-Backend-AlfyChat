// ==========================================
// ALFYCHAT - BOTS SERVICE (v2)
// Gestion complète des bots, commandes,
// serveurs et certifications
// ==========================================

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDatabase, getRedis } from '../index';
import {
  Bot, BotCommand, CreateBotDTO, UpdateBotDTO,
  CreateCommandDTO, AddBotToServerDTO, BotStatus,
  CertificationStatus, CertificationRequestDTO, CertificationReviewDTO,
} from '../types';

export class BotsService {
  private get db() {
    return getDatabase();
  }

  private get redis() {
    return getRedis();
  }

  private generateBotToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // ==========================================
  // MAPPERS
  // ==========================================

  private mapBot(row: any, servers: string[], commands: BotCommand[], includeToken = false): Bot {
    let tags: string[] = [];
    try {
      tags = row.tags ? JSON.parse(row.tags) : [];
    } catch { tags = []; }

    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      avatarUrl: row.avatar_url,
      token: includeToken ? row.token : '[HIDDEN]',
      prefix: row.prefix,
      status: row.status as BotStatus,
      isPublic: !!row.is_public,
      isVerified: !!row.is_verified,
      certificationStatus: (row.certification_status || 'none') as CertificationStatus,
      certificationNote: row.certification_note,
      inviteCount: row.invite_count || 0,
      serverCount: servers.length,
      tags,
      websiteUrl: row.website_url,
      supportServerUrl: row.support_server_url,
      privacyPolicyUrl: row.privacy_policy_url,
      servers,
      commands,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ==========================================
  // GESTION DES BOTS
  // ==========================================

  async create(data: CreateBotDTO): Promise<Bot> {
    const id = uuidv4();
    const token = this.generateBotToken();
    const now = new Date();

    await this.db.execute(
      `INSERT INTO bots (id, owner_id, name, description, token, prefix, status, is_public, is_verified,
        certification_status, invite_count, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'offline', 0, 0, 'none', 0, '[]', ?, ?)`,
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
      isVerified: false,
      certificationStatus: 'none',
      inviteCount: 0,
      serverCount: 0,
      tags: [],
      servers: [],
      commands: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async getById(id: string, includeToken = false): Promise<Bot | null> {
    const [rows] = await this.db.execute(`SELECT * FROM bots WHERE id = ?`, [id]);
    const bots = rows as any[];
    if (bots.length === 0) return null;

    const servers = await this.getBotServers(id);
    const commands = await this.getCommands(id);
    return this.mapBot(bots[0], servers, commands, includeToken);
  }

  async getByOwner(ownerId: string): Promise<Bot[]> {
    const [rows] = await this.db.execute(
      `SELECT * FROM bots WHERE owner_id = ? ORDER BY created_at DESC`,
      [ownerId]
    );
    const result: Bot[] = [];
    for (const bot of rows as any[]) {
      const servers = await this.getBotServers(bot.id);
      const commands = await this.getCommands(bot.id);
      result.push(this.mapBot(bot, servers, commands));
    }
    return result;
  }

  async getPublicBots(search?: string, tag?: string): Promise<Bot[]> {
    let query = `SELECT * FROM bots WHERE is_public = 1 AND status != 'maintenance'`;
    const params: any[] = [];

    if (search) {
      query += ` AND (name LIKE ? OR description LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }
    if (tag) {
      query += ` AND tags LIKE ?`;
      params.push(`%"${tag}"%`);
    }

    query += ` ORDER BY invite_count DESC, name ASC`;
    const [rows] = await this.db.execute(query, params);

    const result: Bot[] = [];
    for (const bot of rows as any[]) {
      const servers = await this.getBotServers(bot.id);
      const commands = await this.getCommands(bot.id);
      result.push(this.mapBot(bot, servers, commands));
    }
    return result;
  }

  async update(id: string, ownerId: string, updates: UpdateBotDTO): Promise<Bot | null> {
    const bot = await this.getById(id);
    if (!bot || bot.ownerId !== ownerId) return null;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      avatarUrl: 'avatar_url',
      prefix: 'prefix',
      isPublic: 'is_public',
      websiteUrl: 'website_url',
      supportServerUrl: 'support_server_url',
      privacyPolicyUrl: 'privacy_policy_url',
    };

    const setClause: string[] = [];
    const values: any[] = [];

    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if ((updates as any)[jsKey] !== undefined) {
        setClause.push(`${dbKey} = ?`);
        values.push((updates as any)[jsKey]);
      }
    }

    if (updates.tags !== undefined) {
      setClause.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }

    if (setClause.length === 0) return bot;

    setClause.push('updated_at = ?');
    values.push(new Date());
    values.push(id);

    await this.db.execute(`UPDATE bots SET ${setClause.join(', ')} WHERE id = ?`, values);

    return this.getById(id);
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    const bot = await this.getById(id);
    if (!bot || bot.ownerId !== ownerId) return false;

    await this.db.execute(`DELETE FROM bot_servers WHERE bot_id = ?`, [id]);
    await this.db.execute(`DELETE FROM bot_commands WHERE bot_id = ?`, [id]);
    await this.db.execute(`DELETE FROM bot_certifications WHERE bot_id = ?`, [id]);
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
      permissions: row.permissions,
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
      permissions: data.permissions || 0,
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

    values.push(id, botId);
    await this.db.execute(`UPDATE bot_commands SET ${setClause.join(', ')} WHERE id = ? AND bot_id = ?`, values);

    const [rows] = await this.db.execute(`SELECT * FROM bot_commands WHERE id = ?`, [id]);
    const cmds = rows as any[];
    if (cmds.length === 0) return null;
    const cmd = cmds[0];
    return {
      id: cmd.id, botId: cmd.bot_id, name: cmd.name,
      description: cmd.description, usage: cmd.usage,
      isEnabled: !!cmd.is_enabled, cooldown: cmd.cooldown, permissions: cmd.permissions,
    };
  }

  async deleteCommand(id: string, botId: string): Promise<boolean> {
    const [result] = await this.db.execute(`DELETE FROM bot_commands WHERE id = ? AND bot_id = ?`, [id, botId]);
    return (result as any).affectedRows > 0;
  }

  // ==========================================
  // GESTION DES SERVEURS
  // ==========================================

  async getBotServers(botId: string): Promise<string[]> {
    const [rows] = await this.db.execute(`SELECT server_id FROM bot_servers WHERE bot_id = ?`, [botId]);
    return (rows as any[]).map(row => row.server_id);
  }

  async addToServer(data: AddBotToServerDTO): Promise<boolean> {
    const bot = await this.getById(data.botId);
    if (!bot) return false;

    const [existing] = await this.db.execute(
      `SELECT * FROM bot_servers WHERE bot_id = ? AND server_id = ?`,
      [data.botId, data.serverId]
    );
    if ((existing as any[]).length > 0) return false;

    await this.db.execute(
      `INSERT INTO bot_servers (bot_id, server_id, permissions, added_at) VALUES (?, ?, ?, ?)`,
      [data.botId, data.serverId, data.permissions, new Date()]
    );

    // Incrementer invite_count
    await this.db.execute(`UPDATE bots SET invite_count = invite_count + 1 WHERE id = ?`, [data.botId]);

    await this.redis.publish('bot:joined', JSON.stringify({ botId: data.botId, serverId: data.serverId }));
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
      `SELECT b.* FROM bots b INNER JOIN bot_servers bs ON b.id = bs.bot_id WHERE bs.server_id = ?`,
      [serverId]
    );
    const result: Bot[] = [];
    for (const bot of rows as any[]) {
      const servers = await this.getBotServers(bot.id);
      const commands = await this.getCommands(bot.id);
      result.push(this.mapBot(bot, servers, commands));
    }
    return result;
  }

  // ==========================================
  // CERTIFICATION
  // ==========================================

  async requestCertification(data: CertificationRequestDTO, ownerId: string): Promise<{ id: string } | null> {
    const bot = await this.getById(data.botId);
    if (!bot || bot.ownerId !== ownerId) return null;
    if (bot.certificationStatus === 'pending' || bot.certificationStatus === 'approved') return null;

    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO bot_certifications (id, bot_id, owner_id, reason, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, data.botId, ownerId, data.reason, new Date()]
    );
    await this.db.execute(
      `UPDATE bots SET certification_status = 'pending', updated_at = ? WHERE id = ?`,
      [new Date(), data.botId]
    );

    return { id };
  }

  async getPendingCertifications(): Promise<any[]> {
    const [rows] = await this.db.execute(
      `SELECT c.*, b.name as bot_name, b.description as bot_description, b.invite_count, b.avatar_url as bot_avatar
       FROM bot_certifications c
       INNER JOIN bots b ON c.bot_id = b.id
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`
    );
    return rows as any[];
  }

  async reviewCertification(data: CertificationReviewDTO, reviewerId: string): Promise<boolean> {
    const [rows] = await this.db.execute(`SELECT * FROM bot_certifications WHERE id = ?`, [data.requestId]);
    const reqs = rows as any[];
    if (reqs.length === 0) return false;
    const req = reqs[0];

    await this.db.execute(
      `UPDATE bot_certifications SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ? WHERE id = ?`,
      [data.status, reviewerId, data.note || null, new Date(), data.requestId]
    );

    const isApproved = data.status === 'approved';
    await this.db.execute(
      `UPDATE bots SET certification_status = ?, is_verified = ?, certification_note = ?, updated_at = ? WHERE id = ?`,
      [data.status, isApproved ? 1 : 0, data.note || null, new Date(), req.bot_id]
    );

    return true;
  }

  // ==========================================
  // AUTHENTIFICATION BOT
  // ==========================================

  async authenticateBot(token: string): Promise<Bot | null> {
    const [rows] = await this.db.execute(`SELECT * FROM bots WHERE token = ?`, [token]);
    const bots = rows as any[];
    if (bots.length === 0) return null;
    return this.getById(bots[0].id, true);
  }
}

export const botsService = new BotsService();
