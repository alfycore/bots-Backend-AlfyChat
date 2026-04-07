"use strict";
// ==========================================
// ALFYCHAT - BOTS ROUTES
// ==========================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.botsRouter = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const controllers_1 = require("../controllers");
const middleware_1 = require("../middleware");
const router = (0, express_1.Router)();
// ==========================================
// ROUTES BOTS
// ==========================================
// Créer un bot
router.post('/', (0, express_validator_1.body)('name').isString().isLength({ min: 2, max: 32 }).withMessage('Nom requis (2-32 caractères)'), (0, express_validator_1.body)('description').optional().isString().isLength({ max: 500 }), (0, express_validator_1.body)('prefix').optional().isString().isLength({ min: 1, max: 5 }), middleware_1.validateRequest, (req, res) => controllers_1.botsController.create(req, res));
// Récupérer mes bots
router.get('/me', (req, res) => controllers_1.botsController.getMyBots(req, res));
// Récupérer les bots publics
router.get('/public', (req, res) => controllers_1.botsController.getPublicBots(req, res));
// Authentifier un bot (pour le gateway)
router.post('/authenticate', (req, res) => controllers_1.botsController.authenticate(req, res));
// Récupérer un bot par ID
router.get('/:id', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), middleware_1.validateRequest, (req, res) => controllers_1.botsController.getById(req, res));
// Mettre à jour un bot
router.patch('/:id', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), (0, express_validator_1.body)('name').optional().isString().isLength({ min: 2, max: 32 }), (0, express_validator_1.body)('description').optional().isString().isLength({ max: 500 }), (0, express_validator_1.body)('prefix').optional().isString().isLength({ min: 1, max: 5 }), (0, express_validator_1.body)('isPublic').optional().isBoolean(), middleware_1.validateRequest, (req, res) => controllers_1.botsController.update(req, res));
// Supprimer un bot
router.delete('/:id', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), middleware_1.validateRequest, (req, res) => controllers_1.botsController.delete(req, res));
// Régénérer le token d'un bot
router.post('/:id/regenerate-token', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), middleware_1.validateRequest, (req, res) => controllers_1.botsController.regenerateToken(req, res));
// Mettre à jour le statut d'un bot
router.patch('/:id/status', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), (0, express_validator_1.body)('status').isIn(['online', 'offline', 'maintenance']).withMessage('Statut invalide'), middleware_1.validateRequest, (req, res) => controllers_1.botsController.updateStatus(req, res));
// ==========================================
// ROUTES COMMANDES
// ==========================================
// Récupérer les commandes d'un bot
router.get('/:id/commands', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), middleware_1.validateRequest, (req, res) => controllers_1.botsController.getCommands(req, res));
// Créer une commande
router.post('/:id/commands', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), (0, express_validator_1.body)('name').isString().isLength({ min: 1, max: 32 }).withMessage('Nom requis'), (0, express_validator_1.body)('description').isString().isLength({ min: 1, max: 200 }).withMessage('Description requise'), (0, express_validator_1.body)('usage').optional().isString().isLength({ max: 200 }), (0, express_validator_1.body)('cooldown').optional().isInt({ min: 0 }), (0, express_validator_1.body)('permissions').optional().isInt({ min: 0 }), middleware_1.validateRequest, (req, res) => controllers_1.botsController.createCommand(req, res));
// Mettre à jour une commande
router.patch('/:id/commands/:commandId', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), (0, express_validator_1.param)('commandId').isUUID().withMessage('ID de commande invalide'), (0, express_validator_1.body)('name').optional().isString().isLength({ min: 1, max: 32 }), (0, express_validator_1.body)('description').optional().isString().isLength({ max: 200 }), (0, express_validator_1.body)('usage').optional().isString().isLength({ max: 200 }), (0, express_validator_1.body)('isEnabled').optional().isBoolean(), (0, express_validator_1.body)('cooldown').optional().isInt({ min: 0 }), (0, express_validator_1.body)('permissions').optional().isInt({ min: 0 }), middleware_1.validateRequest, (req, res) => controllers_1.botsController.updateCommand(req, res));
// Supprimer une commande
router.delete('/:id/commands/:commandId', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), (0, express_validator_1.param)('commandId').isUUID().withMessage('ID de commande invalide'), middleware_1.validateRequest, (req, res) => controllers_1.botsController.deleteCommand(req, res));
// ==========================================
// ROUTES SERVEURS
// ==========================================
// Ajouter un bot à un serveur
router.post('/:id/servers', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), (0, express_validator_1.body)('serverId').isUUID().withMessage('ID de serveur invalide'), (0, express_validator_1.body)('permissions').optional().isInt({ min: 0 }), middleware_1.validateRequest, (req, res) => controllers_1.botsController.addToServer(req, res));
// Retirer un bot d'un serveur
router.delete('/:id/servers/:serverId', (0, express_validator_1.param)('id').isUUID().withMessage('ID de bot invalide'), (0, express_validator_1.param)('serverId').isUUID().withMessage('ID de serveur invalide'), middleware_1.validateRequest, (req, res) => controllers_1.botsController.removeFromServer(req, res));
// Récupérer les bots d'un serveur
router.get('/servers/:serverId', (0, express_validator_1.param)('serverId').isUUID().withMessage('ID de serveur invalide'), middleware_1.validateRequest, (req, res) => controllers_1.botsController.getBotsInServer(req, res));
exports.botsRouter = router;
//# sourceMappingURL=bots.js.map