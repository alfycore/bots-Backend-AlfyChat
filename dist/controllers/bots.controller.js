"use strict";
// ==========================================
// ALFYCHAT - BOTS CONTROLLER
// ==========================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.botsController = exports.BotsController = void 0;
const services_1 = require("../services");
class BotsController {
    // ==========================================
    // GESTION DES BOTS
    // ==========================================
    async create(req, res) {
        try {
            const userId = req.userId;
            const { name, description, prefix } = req.body;
            const data = {
                ownerId: userId,
                name,
                description,
                prefix
            };
            const bot = await services_1.botsService.create(data);
            res.status(201).json({
                success: true,
                bot
            });
        }
        catch (error) {
            console.error('Create bot error:', error);
            res.status(500).json({ error: 'Erreur lors de la création du bot' });
        }
    }
    async getById(req, res) {
        try {
            const { id } = req.params;
            const userId = req.userId;
            const bot = await services_1.botsService.getById(id, false);
            if (!bot) {
                return res.status(404).json({ error: 'Bot non trouvé' });
            }
            // Si c'est le propriétaire, inclure le token
            if (bot.ownerId === userId) {
                const fullBot = await services_1.botsService.getById(id, true);
                return res.json({ bot: fullBot });
            }
            res.json({ bot });
        }
        catch (error) {
            console.error('Get bot error:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération du bot' });
        }
    }
    async getMyBots(req, res) {
        try {
            const userId = req.userId;
            const bots = await services_1.botsService.getByOwner(userId);
            res.json({ bots });
        }
        catch (error) {
            console.error('Get my bots error:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des bots' });
        }
    }
    async getPublicBots(req, res) {
        try {
            const bots = await services_1.botsService.getPublicBots();
            res.json({ bots });
        }
        catch (error) {
            console.error('Get public bots error:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des bots publics' });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const userId = req.userId;
            const updates = req.body;
            const bot = await services_1.botsService.update(id, userId, updates);
            if (!bot) {
                return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
            }
            res.json({ bot });
        }
        catch (error) {
            console.error('Update bot error:', error);
            res.status(500).json({ error: 'Erreur lors de la mise à jour du bot' });
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const userId = req.userId;
            const deleted = await services_1.botsService.delete(id, userId);
            if (!deleted) {
                return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
            }
            res.json({ success: true });
        }
        catch (error) {
            console.error('Delete bot error:', error);
            res.status(500).json({ error: 'Erreur lors de la suppression du bot' });
        }
    }
    async regenerateToken(req, res) {
        try {
            const { id } = req.params;
            const userId = req.userId;
            const newToken = await services_1.botsService.regenerateToken(id, userId);
            if (!newToken) {
                return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
            }
            res.json({ token: newToken });
        }
        catch (error) {
            console.error('Regenerate token error:', error);
            res.status(500).json({ error: 'Erreur lors de la régénération du token' });
        }
    }
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const userId = req.userId;
            // Vérifier que l'utilisateur est propriétaire
            const bot = await services_1.botsService.getById(id);
            if (!bot || bot.ownerId !== userId) {
                return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
            }
            await services_1.botsService.updateStatus(id, status);
            res.json({ success: true, status });
        }
        catch (error) {
            console.error('Update status error:', error);
            res.status(500).json({ error: 'Erreur lors de la mise à jour du statut' });
        }
    }
    // ==========================================
    // GESTION DES COMMANDES
    // ==========================================
    async getCommands(req, res) {
        try {
            const { id } = req.params;
            const commands = await services_1.botsService.getCommands(id);
            res.json({ commands });
        }
        catch (error) {
            console.error('Get commands error:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des commandes' });
        }
    }
    async createCommand(req, res) {
        try {
            const { id } = req.params;
            const userId = req.userId;
            const { name, description, usage, cooldown, permissions } = req.body;
            // Vérifier propriété du bot
            const bot = await services_1.botsService.getById(id);
            if (!bot || bot.ownerId !== userId) {
                return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
            }
            const data = {
                botId: id,
                name,
                description,
                usage,
                cooldown,
                permissions
            };
            const command = await services_1.botsService.createCommand(data);
            res.status(201).json({ command });
        }
        catch (error) {
            console.error('Create command error:', error);
            res.status(500).json({ error: 'Erreur lors de la création de la commande' });
        }
    }
    async updateCommand(req, res) {
        try {
            const { id, commandId } = req.params;
            const userId = req.userId;
            const updates = req.body;
            // Vérifier propriété du bot
            const bot = await services_1.botsService.getById(id);
            if (!bot || bot.ownerId !== userId) {
                return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
            }
            const command = await services_1.botsService.updateCommand(commandId, id, updates);
            if (!command) {
                return res.status(404).json({ error: 'Commande non trouvée' });
            }
            res.json({ command });
        }
        catch (error) {
            console.error('Update command error:', error);
            res.status(500).json({ error: 'Erreur lors de la mise à jour de la commande' });
        }
    }
    async deleteCommand(req, res) {
        try {
            const { id, commandId } = req.params;
            const userId = req.userId;
            // Vérifier propriété du bot
            const bot = await services_1.botsService.getById(id);
            if (!bot || bot.ownerId !== userId) {
                return res.status(404).json({ error: 'Bot non trouvé ou non autorisé' });
            }
            const deleted = await services_1.botsService.deleteCommand(commandId, id);
            if (!deleted) {
                return res.status(404).json({ error: 'Commande non trouvée' });
            }
            res.json({ success: true });
        }
        catch (error) {
            console.error('Delete command error:', error);
            res.status(500).json({ error: 'Erreur lors de la suppression de la commande' });
        }
    }
    // ==========================================
    // GESTION DES SERVEURS
    // ==========================================
    async addToServer(req, res) {
        try {
            const { id } = req.params;
            const { serverId, permissions } = req.body;
            const bot = await services_1.botsService.getById(id);
            if (!bot) {
                return res.status(404).json({ error: 'Bot non trouvé' });
            }
            const data = {
                botId: id,
                serverId,
                permissions: permissions || 0
            };
            const added = await services_1.botsService.addToServer(data);
            if (!added) {
                return res.status(400).json({ error: 'Le bot est déjà sur ce serveur' });
            }
            res.status(201).json({ success: true });
        }
        catch (error) {
            console.error('Add to server error:', error);
            res.status(500).json({ error: 'Erreur lors de l\'ajout du bot au serveur' });
        }
    }
    async removeFromServer(req, res) {
        try {
            const { id, serverId } = req.params;
            const removed = await services_1.botsService.removeFromServer(id, serverId);
            if (!removed) {
                return res.status(404).json({ error: 'Bot non trouvé sur ce serveur' });
            }
            res.json({ success: true });
        }
        catch (error) {
            console.error('Remove from server error:', error);
            res.status(500).json({ error: 'Erreur lors du retrait du bot du serveur' });
        }
    }
    async getBotsInServer(req, res) {
        try {
            const { serverId } = req.params;
            const bots = await services_1.botsService.getBotsInServer(serverId);
            res.json({ bots });
        }
        catch (error) {
            console.error('Get bots in server error:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des bots' });
        }
    }
    // ==========================================
    // AUTHENTIFICATION BOT (pour Gateway)
    // ==========================================
    async authenticate(req, res) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bot ')) {
                return res.status(401).json({ error: 'Token de bot invalide' });
            }
            const token = authHeader.substring(4);
            const bot = await services_1.botsService.authenticateBot(token);
            if (!bot) {
                return res.status(401).json({ error: 'Bot non trouvé' });
            }
            res.json({ bot });
        }
        catch (error) {
            console.error('Bot authenticate error:', error);
            res.status(500).json({ error: 'Erreur d\'authentification' });
        }
    }
}
exports.BotsController = BotsController;
exports.botsController = new BotsController();
//# sourceMappingURL=bots.controller.js.map