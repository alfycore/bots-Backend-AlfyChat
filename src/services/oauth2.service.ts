// ==========================================
// ALFYCHAT - SERVICE OAUTH2
// Authorization code flow pour les bots
// ==========================================

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../index';
import { botsService } from './bots.service';
import {
  PublicApp, OAuth2AuthorizeDTO, OAuth2TokenExchangeDTO, OAuth2Scope,
} from '../types';

export class OAuth2Service {
  private get db() {
    return getDatabase();
  }

  // ==========================================
  // APP PUBLIQUE (pour la page authorize)
  // ==========================================

  async getPublicApp(clientId: string): Promise<PublicApp | null> {
    const [rows] = await this.db.execute(
      `SELECT id, name, description, avatar_url, is_verified, redirect_uris FROM bots WHERE id = ?`,
      [clientId]
    );
    const bots = rows as any[];
    if (bots.length === 0) return null;

    const row = bots[0];
    let redirectUris: string[] = [];
    try { redirectUris = row.redirect_uris ? JSON.parse(row.redirect_uris) : []; } catch { redirectUris = []; }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      avatarUrl: row.avatar_url,
      isVerified: !!row.is_verified,
      redirectUris,
    };
  }

  // ==========================================
  // CONFIG OAUTH2 (pour le owner)
  // ==========================================

  async getOAuth2Config(botId: string, ownerId: string): Promise<{
    clientId: string;
    clientSecretMasked: string;
    redirectUris: string[];
  } | null> {
    let row: any;
    try {
      const [rows] = await this.db.execute(
        `SELECT id, owner_id, client_secret, redirect_uris FROM bots WHERE id = ?`,
        [botId]
      );
      const bots = rows as any[];
      if (bots.length === 0 || bots[0].owner_id !== ownerId) return null;
      row = bots[0];
    } catch {
      // Fallback si redirect_uris ou client_secret n'existe pas encore (migration en attente)
      const [rows] = await this.db.execute(
        `SELECT id, owner_id FROM bots WHERE id = ?`,
        [botId]
      );
      const bots = rows as any[];
      if (bots.length === 0 || bots[0].owner_id !== ownerId) return null;
      row = bots[0];
    }

    let redirectUris: string[] = [];
    try { redirectUris = row.redirect_uris ? JSON.parse(row.redirect_uris) : []; } catch { redirectUris = []; }

    const secret: string = row.client_secret || '';
    const clientSecretMasked = secret.length >= 4
      ? '••••••••••••••••••••••••••••' + secret.slice(-4)
      : '••••';

    return { clientId: botId, clientSecretMasked, redirectUris };
  }

  async regenerateClientSecret(botId: string, ownerId: string): Promise<string | null> {
    const [rows] = await this.db.execute(
      `SELECT id, owner_id FROM bots WHERE id = ?`,
      [botId]
    );
    const bots = rows as any[];
    if (bots.length === 0 || bots[0].owner_id !== ownerId) return null;

    const newSecret = botsService.generateClientSecret();
    await this.db.execute(
      `UPDATE bots SET client_secret = ?, updated_at = ? WHERE id = ?`,
      [newSecret, new Date(), botId]
    );
    return newSecret;
  }

  async updateRedirectUris(botId: string, ownerId: string, uris: string[]): Promise<string[] | null> {
    const [rows] = await this.db.execute(
      `SELECT id, owner_id FROM bots WHERE id = ?`,
      [botId]
    );
    const bots = rows as any[];
    if (bots.length === 0 || bots[0].owner_id !== ownerId) return null;

    if (uris.length > 5) return null;
    for (const uri of uris) {
      if (!uri.startsWith('https://') && !uri.startsWith('http://localhost')) return null;
      if (uri.length > 500) return null;
    }

    const validUris = uris.filter(u => u.trim().length > 0);
    try {
      await this.db.execute(
        `UPDATE bots SET redirect_uris = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(validUris), new Date(), botId]
      );
    } catch (e: any) {
      // La colonne redirect_uris n'existe pas encore (migration non appliquée)
      throw new Error(`Colonne redirect_uris manquante — redémarrez le service bots. (${e?.message})`);
    }
    return validUris;
  }

  // ==========================================
  // FLOW AUTHORIZATION CODE
  // ==========================================

  async generateCode(data: OAuth2AuthorizeDTO): Promise<string | null> {
    // Valider le client_id et la redirect_uri
    const app = await this.getPublicApp(data.clientId);
    if (!app) return null;

    if (!app.redirectUris.includes(data.redirectUri)) return null;

    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await this.db.execute(
      `INSERT INTO oauth2_codes (code, bot_id, user_id, server_id, scopes, redirect_uri, permissions, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        code, data.clientId, data.userId, data.serverId || null,
        JSON.stringify(data.scopes), data.redirectUri, data.permissions,
        expiresAt, new Date(),
      ]
    );

    // Ajouter le bot au serveur si scope 'bot' présent
    if (data.scopes.includes('bot') && data.serverId) {
      await botsService.addToServer({
        botId: data.clientId,
        serverId: data.serverId,
        permissions: data.permissions,
      });
    }

    return code;
  }

  async exchangeCode(data: OAuth2TokenExchangeDTO): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    scope: string;
  } | null> {
    // Récupérer le code non utilisé et non expiré
    const [codeRows] = await this.db.execute(
      `SELECT * FROM oauth2_codes WHERE code = ? AND used = 0 AND expires_at > NOW()`,
      [data.code]
    );
    const codes = codeRows as any[];
    if (codes.length === 0) return null;

    const codeRow = codes[0];

    // Vérifier client_id et redirect_uri
    if (codeRow.bot_id !== data.clientId) return null;
    if (codeRow.redirect_uri !== data.redirectUri) return null;

    // Vérifier le client_secret (timing-safe)
    const [botRows] = await this.db.execute(
      `SELECT client_secret FROM bots WHERE id = ?`,
      [data.clientId]
    );
    const botArr = botRows as any[];
    if (botArr.length === 0) return null;

    const storedSecret: string = botArr[0].client_secret || '';
    if (storedSecret.length !== data.clientSecret.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(storedSecret), Buffer.from(data.clientSecret))) return null;

    // Invalider le code
    await this.db.execute(`UPDATE oauth2_codes SET used = 1 WHERE code = ?`, [data.code]);

    // Générer l'access token
    const accessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 jours

    let scopes: OAuth2Scope[] = [];
    try { scopes = JSON.parse(codeRow.scopes); } catch { scopes = []; }

    await this.db.execute(
      `INSERT INTO oauth2_tokens (access_token, bot_id, user_id, server_id, scopes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [accessToken, data.clientId, codeRow.user_id, codeRow.server_id || null, JSON.stringify(scopes), expiresAt, new Date()]
    );

    return {
      accessToken,
      tokenType: 'Bot',
      expiresIn: 30 * 24 * 60 * 60,
      scope: scopes.join(' '),
    };
  }

  // ==========================================
  // VALIDATION TOKEN (pour endpoints identify/guilds)
  // ==========================================

  async validateToken(accessToken: string): Promise<{
    botId: string;
    userId: string;
    serverId?: string;
    scopes: OAuth2Scope[];
  } | null> {
    const [rows] = await this.db.execute(
      `SELECT * FROM oauth2_tokens WHERE access_token = ? AND expires_at > NOW()`,
      [accessToken]
    );
    const tokens = rows as any[];
    if (tokens.length === 0) return null;

    const row = tokens[0];
    let scopes: OAuth2Scope[] = [];
    try { scopes = JSON.parse(row.scopes); } catch { scopes = []; }

    return {
      botId: row.bot_id,
      userId: row.user_id,
      serverId: row.server_id || undefined,
      scopes,
    };
  }
}

export const oauth2Service = new OAuth2Service();
