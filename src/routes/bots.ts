// ==========================================
// ALFYCHAT - BOTS ROUTES
// ==========================================

import { Router } from 'express';
import { body, param } from 'express-validator';
import { botsController } from '../controllers';
import { validateRequest } from '../middleware';

const router = Router();

// ==========================================
// ROUTES BOTS
// ==========================================

// Créer un bot
router.post('/',
  body('name').isString().isLength({ min: 2, max: 32 }).withMessage('Nom requis (2-32 caractères)'),
  body('description').optional().isString().isLength({ max: 500 }),
  body('prefix').optional().isString().isLength({ min: 1, max: 5 }),
  validateRequest,
  (req, res) => botsController.create(req, res)
);

// Récupérer mes bots
router.get('/me',
  (req, res) => botsController.getMyBots(req, res)
);

// Récupérer les bots publics
router.get('/public',
  (req, res) => botsController.getPublicBots(req, res)
);

// Authentifier un bot (pour le gateway)
router.post('/authenticate',
  (req, res) => botsController.authenticate(req, res)
);

// Récupérer un bot par ID
router.get('/:id',
  param('id').isUUID().withMessage('ID de bot invalide'),
  validateRequest,
  (req, res) => botsController.getById(req, res)
);

// Mettre à jour un bot
router.patch('/:id',
  param('id').isUUID().withMessage('ID de bot invalide'),
  body('name').optional().isString().isLength({ min: 2, max: 32 }),
  body('description').optional().isString().isLength({ max: 500 }),
  body('prefix').optional().isString().isLength({ min: 1, max: 5 }),
  body('isPublic').optional().isBoolean(),
  validateRequest,
  (req, res) => botsController.update(req, res)
);

// Supprimer un bot
router.delete('/:id',
  param('id').isUUID().withMessage('ID de bot invalide'),
  validateRequest,
  (req, res) => botsController.delete(req, res)
);

// Régénérer le token d'un bot
router.post('/:id/regenerate-token',
  param('id').isUUID().withMessage('ID de bot invalide'),
  validateRequest,
  (req, res) => botsController.regenerateToken(req, res)
);

// Mettre à jour le statut d'un bot
router.patch('/:id/status',
  param('id').isUUID().withMessage('ID de bot invalide'),
  body('status').isIn(['online', 'offline', 'maintenance']).withMessage('Statut invalide'),
  validateRequest,
  (req, res) => botsController.updateStatus(req, res)
);

// ==========================================
// ROUTES COMMANDES
// ==========================================

// Récupérer les commandes d'un bot
router.get('/:id/commands',
  param('id').isUUID().withMessage('ID de bot invalide'),
  validateRequest,
  (req, res) => botsController.getCommands(req, res)
);

// Créer une commande
router.post('/:id/commands',
  param('id').isUUID().withMessage('ID de bot invalide'),
  body('name').isString().isLength({ min: 1, max: 32 }).withMessage('Nom requis'),
  body('description').isString().isLength({ min: 1, max: 200 }).withMessage('Description requise'),
  body('usage').optional().isString().isLength({ max: 200 }),
  body('cooldown').optional().isInt({ min: 0 }),
  body('permissions').optional().isInt({ min: 0 }),
  validateRequest,
  (req, res) => botsController.createCommand(req, res)
);

// Mettre à jour une commande
router.patch('/:id/commands/:commandId',
  param('id').isUUID().withMessage('ID de bot invalide'),
  param('commandId').isUUID().withMessage('ID de commande invalide'),
  body('name').optional().isString().isLength({ min: 1, max: 32 }),
  body('description').optional().isString().isLength({ max: 200 }),
  body('usage').optional().isString().isLength({ max: 200 }),
  body('isEnabled').optional().isBoolean(),
  body('cooldown').optional().isInt({ min: 0 }),
  body('permissions').optional().isInt({ min: 0 }),
  validateRequest,
  (req, res) => botsController.updateCommand(req, res)
);

// Supprimer une commande
router.delete('/:id/commands/:commandId',
  param('id').isUUID().withMessage('ID de bot invalide'),
  param('commandId').isUUID().withMessage('ID de commande invalide'),
  validateRequest,
  (req, res) => botsController.deleteCommand(req, res)
);

// ==========================================
// ROUTES SERVEURS
// ==========================================

// Ajouter un bot à un serveur
router.post('/:id/servers',
  param('id').isUUID().withMessage('ID de bot invalide'),
  body('serverId').isUUID().withMessage('ID de serveur invalide'),
  body('permissions').optional().isInt({ min: 0 }),
  validateRequest,
  (req, res) => botsController.addToServer(req, res)
);

// Retirer un bot d'un serveur
router.delete('/:id/servers/:serverId',
  param('id').isUUID().withMessage('ID de bot invalide'),
  param('serverId').isUUID().withMessage('ID de serveur invalide'),
  validateRequest,
  (req, res) => botsController.removeFromServer(req, res)
);

// Récupérer les bots d'un serveur
router.get('/servers/:serverId',
  param('serverId').isUUID().withMessage('ID de serveur invalide'),
  validateRequest,
  (req, res) => botsController.getBotsInServer(req, res)
);

export const botsRouter = router;
