// ==========================================
// ALFYCHAT - BOTS CONTROLLER (v2)
// ==========================================

import { Response } from 'express';
import { botsService } from '../services';
import { AuthRequest, CreateBotDTO, CreateCommandDTO, AddBotToServerDTO, BotStatus } from '../types';

export class BotsController {
  // ==========================================
  // GESTION DES BOTS
  // ==========================================

  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: 'Non authentifié' });
      const { name, description, prefix } = req.body;

      const data: CreateBotDTO = { ownerId: userId, name, description, prefix };
      const bot = await botsService.create(data);
      res.status(201).json({ success: true, bot });
    } catch (error) {
      console.error('Create bot error:', error);
      res.status(500).json({ error: 'Erreur lors de la création du bot' });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId || req.headers['x-user-id'] as string;

      const bot = await botsService.getById(id, false);
      if (!bot) return res.status(404).json({ error: 'Bot non trouvé' });

      if (bot.ownerId === userId) {
        const fullBot = await botsService.getById(id, true);
        return res.json({ bot: fullBot });
      }
      res.json({ bot });
    } catch (error) {
      console.error('Get bot error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération du bot' });
    }
  }

  async getMyBots(req: AuthRequest, res: Response) {
    try {
      const userId = req.userId || req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'Non authentifié' });
      const bots = await botsService.getByOwner(userId);
      res.json({ bots });
    } catch (error) {
      console.error('Get my bots error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des bots' });
    }
  }

  async getPublicBots(req: AuthRequest, res: Response) {
    try {
      const { search, tag } = req.query;
      const bots = await botsService.getPublicBots(
        search as string | undefined,
        tag as string | undefined
      );
      res.json({ bots });
    } catch (error) {
      console.error('Get public bots error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des bots publics' });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId || req.headers['x-user-id'] as string;
      const updates = req.body;

      const bot = await botsService.update(id, userId, updates);
      if (!bot) return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
      res.json({ bot });
    } catch (error) {
      console.error('Update bot error:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour du bot' });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId || req.headers['x-user-id'] as string;
      const deleted = await botsService.delete(id, userId);
      if (!deleted) return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete bot error:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression du bot' });
    }
  }

  async regenerateToken(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.body.ownerId || req.userId || req.headers['x-user-id'] as string;
      const newToken = await botsService.regenerateToken(id, userId);
      if (!newToken) return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
      res.json({ token: newToken });
    } catch (error) {
      console.error('Regenerate token error:', error);
      res.status(500).json({ error: 'Erreur lors de la régénération du token' });
    }
  }

  async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.body.ownerId || req.userId || req.headers['x-user-id'] as string;

      const bot = await botsService.getById(id);
      if (!bot || bot.ownerId !== userId) {
        return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
      }
      await botsService.updateStatus(id, status as BotStatus);
      res.json({ success: true, status });
    } catch (error) {
      console.error('Update status error:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour du statut' });
    }
  }

  // ==========================================
  // GESTION DES COMMANDES
  // ==========================================

  async getCommands(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const commands = await botsService.getCommands(id);
      res.json({ commands });
    } catch (error) {
      console.error('Get commands error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des commandes' });
    }
  }

  async createCommand(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.body.ownerId || req.userId || req.headers['x-user-id'] as string;
      const { name, description, usage, cooldown, permissions } = req.body;

      const bot = await botsService.getById(id);
      if (!bot || bot.ownerId !== userId) {
        return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
      }
      const data: CreateCommandDTO = { botId: id, name, description, usage, cooldown, permissions };
      const command = await botsService.createCommand(data);
      res.status(201).json({ command });
    } catch (error) {
      console.error('Create command error:', error);
      res.status(500).json({ error: 'Erreur lors de la création de la commande' });
    }
  }

  async updateCommand(req: AuthRequest, res: Response) {
    try {
      const { id, commandId } = req.params;
      const userId = req.body.ownerId || req.userId || req.headers['x-user-id'] as string;
      const updates = req.body;

      const bot = await botsService.getById(id);
      if (!bot || bot.ownerId !== userId) {
        return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
      }
      const command = await botsService.updateCommand(commandId, id, updates);
      if (!command) return res.status(404).json({ error: 'Commande non trouvée' });
      res.json({ command });
    } catch (error) {
      console.error('Update command error:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour de la commande' });
    }
  }

  async deleteCommand(req: AuthRequest, res: Response) {
    try {
      const { id, commandId } = req.params;
      const userId = req.body.ownerId || req.userId || req.headers['x-user-id'] as string;

      const bot = await botsService.getById(id);
      if (!bot || bot.ownerId !== userId) {
        return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
      }
      const deleted = await botsService.deleteCommand(commandId, id);
      if (!deleted) return res.status(404).json({ error: 'Commande non trouvée' });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete command error:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression de la commande' });
    }
  }

  // ==========================================
  // GESTION DES SERVEURS
  // ==========================================

  async addToServer(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { serverId, permissions } = req.body;

      const bot = await botsService.getById(id);
      if (!bot) return res.status(404).json({ error: 'Bot non trouvé' });

      const data: AddBotToServerDTO = { botId: id, serverId, permissions: permissions || 0 };
      const added = await botsService.addToServer(data);
      if (!added) return res.status(400).json({ error: 'Le bot est déjà sur ce serveur' });
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Add to server error:', error);
      res.status(500).json({ error: "Erreur lors de l'ajout du bot au serveur" });
    }
  }

  async removeFromServer(req: AuthRequest, res: Response) {
    try {
      const { id, serverId } = req.params;
      const removed = await botsService.removeFromServer(id, serverId);
      if (!removed) return res.status(404).json({ error: 'Bot non trouvé sur ce serveur' });
      res.json({ success: true });
    } catch (error) {
      console.error('Remove from server error:', error);
      res.status(500).json({ error: 'Erreur lors du retrait du bot du serveur' });
    }
  }

  async getBotsInServer(req: AuthRequest, res: Response) {
    try {
      const { serverId } = req.params;
      const bots = await botsService.getBotsInServer(serverId);
      res.json({ bots });
    } catch (error) {
      console.error('Get bots in server error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des bots' });
    }
  }

  // ==========================================
  // CERTIFICATION
  // ==========================================

  async requestCertification(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.body.ownerId || req.userId || req.headers['x-user-id'] as string;
      const { reason } = req.body;

      const result = await botsService.requestCertification({ botId: id, reason }, userId);
      if (!result) return res.status(400).json({ error: 'Demande impossible (bot non trouvé, non autorisé, ou déjà en attente)' });
      res.status(201).json({ success: true, requestId: result.id });
    } catch (error) {
      console.error('Request certification error:', error);
      res.status(500).json({ error: 'Erreur lors de la demande de certification' });
    }
  }

  async getPendingCertifications(req: AuthRequest, res: Response) {
    try {
      const certifications = await botsService.getPendingCertifications();
      res.json({ certifications });
    } catch (error) {
      console.error('Get pending certifications error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des certifications' });
    }
  }

  async reviewCertification(req: AuthRequest, res: Response) {
    try {
      const { requestId } = req.params;
      const reviewerId = req.body.ownerId || req.userId || req.headers['x-user-id'] as string;
      const { status, note } = req.body;

      const reviewed = await botsService.reviewCertification({ requestId, status, note }, reviewerId);
      if (!reviewed) return res.status(404).json({ error: 'Demande de certification non trouvée' });
      res.json({ success: true });
    } catch (error) {
      console.error('Review certification error:', error);
      res.status(500).json({ error: "Erreur lors de l'examen de la certification" });
    }
  }

  // ==========================================
  // AUTHENTIFICATION BOT (pour Gateway)
  // ==========================================

  async authenticate(req: AuthRequest, res: Response) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bot ')) {
        return res.status(401).json({ error: 'Token de bot invalide' });
      }
      const token = authHeader.substring(4);
      const bot = await botsService.authenticateBot(token);

      if (!bot) return res.status(401).json({ error: 'Bot non trouvé' });
      res.json({ bot });
    } catch (error) {
      console.error('Bot authenticate error:', error);
      res.status(500).json({ error: "Erreur d'authentification" });
    }
  }
}

export const botsController = new BotsController();
