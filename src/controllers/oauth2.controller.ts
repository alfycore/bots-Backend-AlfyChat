// ==========================================
// ALFYCHAT - CONTROLLER OAUTH2
// ==========================================

import { Request, Response } from 'express';
import { oauth2Service } from '../services/oauth2.service';

export class OAuth2Controller {

  // GET /oauth2/applications/:clientId — infos publiques pour la page authorize
  async getApplication(req: Request, res: Response): Promise<void> {
    try {
      const app = await oauth2Service.getPublicApp(req.params.clientId);
      if (!app) {
        res.status(404).json({ error: 'Application introuvable' });
        return;
      }
      res.json({ app });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  // POST /oauth2/authorize — l'utilisateur approuve, génère un code et ajoute le bot au serveur
  async authorize(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { clientId, serverId, redirectUri, scopes, permissions, state } = req.body;

      if (!clientId || !redirectUri || !scopes || !Array.isArray(scopes)) {
        res.status(400).json({ error: 'Paramètres manquants' });
        return;
      }

      // Valider les scopes
      const validScopes = ['bot', 'identify', 'guilds'];
      const invalidScope = scopes.find((s: string) => !validScopes.includes(s));
      if (invalidScope) {
        res.status(400).json({ error: `Scope invalide: ${invalidScope}` });
        return;
      }

      const code = await oauth2Service.generateCode({
        clientId,
        userId,
        serverId: serverId || undefined,
        redirectUri,
        scopes,
        permissions: parseInt(permissions) || 0,
      });

      if (!code) {
        res.status(400).json({ error: 'Autorisation refusée ou redirect_uri invalide' });
        return;
      }

      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set('code', code);
      if (state) callbackUrl.searchParams.set('state', state);
      if (serverId) callbackUrl.searchParams.set('guild_id', serverId);

      res.json({ code, redirectUri: callbackUrl.toString() });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  // POST /oauth2/token — échange le code contre un access_token
  async exchangeToken(req: Request, res: Response): Promise<void> {
    try {
      const { code, client_id, client_secret, redirect_uri, grant_type } = req.body;

      if (grant_type !== 'authorization_code') {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
      }
      if (!code || !client_id || !client_secret || !redirect_uri) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const result = await oauth2Service.exchangeCode({
        code,
        clientId: client_id,
        clientSecret: client_secret,
        redirectUri: redirect_uri,
        grantType: 'authorization_code',
      });

      if (!result) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }

      res.json({
        access_token: result.accessToken,
        token_type: result.tokenType,
        expires_in: result.expiresIn,
        scope: result.scope,
      });
    } catch (err) {
      res.status(500).json({ error: 'server_error' });
    }
  }

  // GET /bots/:id/oauth2 — config OAuth2 masquée (owner seulement)
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = (req as any).userId;
      const config = await oauth2Service.getOAuth2Config(req.params.id, ownerId);
      if (!config) {
        res.status(404).json({ error: 'Bot introuvable ou accès refusé' });
        return;
      }
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  // POST /bots/:id/oauth2/regenerate-secret — régénère le client_secret
  async regenerateSecret(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = (req as any).userId;
      const newSecret = await oauth2Service.regenerateClientSecret(req.params.id, ownerId);
      if (!newSecret) {
        res.status(404).json({ error: 'Bot introuvable ou accès refusé' });
        return;
      }
      res.json({ clientSecret: newSecret });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  // PATCH /bots/:id/oauth2/redirect-uris — met à jour les URIs de redirection
  async updateRedirectUris(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = (req as any).userId;
      const { redirectUris } = req.body;

      if (!Array.isArray(redirectUris)) {
        res.status(400).json({ error: 'redirectUris doit être un tableau' });
        return;
      }

      const result = await oauth2Service.updateRedirectUris(req.params.id, ownerId, redirectUris);
      if (result === null) {
        res.status(400).json({ error: 'Bot introuvable, accès refusé, ou URIs invalides (max 5, https:// ou http://localhost)' });
        return;
      }
      res.json({ redirectUris: result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erreur serveur' });
    }
  }
}

export const oauth2Controller = new OAuth2Controller();
