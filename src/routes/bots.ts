// ==========================================
// ALFYCHAT - BOTS ROUTES (v2)
// ==========================================

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { botsController } from '../controllers';
import { validateRequest } from '../middleware';

const router = Router();

// ==========================================
// ROUTES BOTS
// ==========================================

router.post('/',
  body('name').isString().isLength({ min: 2, max: 32 }).withMessage('Nom requis (2-32 caractères)'),
  body('description').optional().isString().isLength({ max: 500 }),
  body('prefix').optional().isString().isLength({ min: 1, max: 5 }),
  validateRequest,
  (req, res) => botsController.create(req, res)
);

router.get('/me',
  (req, res) => botsController.getMyBots(req, res)
);

router.get('/public',
  query('search').optional().isString(),
  query('tag').optional().isString(),
  (req, res) => botsController.getPublicBots(req, res)
);

router.post('/authenticate',
  (req, res) => botsController.authenticate(req, res)
);

router.get('/:id',
  param('id').isUUID().withMessage('ID de bot invalide'),
  validateRequest,
  (req, res) => botsController.getById(req, res)
);

router.patch('/:id',
  param('id').isUUID().withMessage('ID de bot invalide'),
  body('name').optional().isString().isLength({ min: 2, max: 32 }),
  body('description').optional().isString().isLength({ max: 500 }),
  body('prefix').optional().isString().isLength({ min: 1, max: 5 }),
  body('isPublic').optional().isBoolean(),
  body('tags').optional().isArray(),
  body('websiteUrl').optional().isString().isLength({ max: 500 }),
  body('supportServerUrl').optional().isString().isLength({ max: 500 }),
  body('privacyPolicyUrl').optional().isString().isLength({ max: 500 }),
  validateRequest,
  (req, res) => botsController.update(req, res)
);

router.delete('/:id',
  param('id').isUUID().withMessage('ID de bot invalide'),
  validateRequest,
  (req, res) => botsController.delete(req, res)
);

router.post('/:id/regenerate-token',
  param('id').isUUID().withMessage('ID de bot invalide'),
  validateRequest,
  (req, res) => botsController.regenerateToken(req, res)
);

router.patch('/:id/status',
  param('id').isUUID().withMessage('ID de bot invalide'),
  body('status').isIn(['online', 'offline', 'maintenance']).withMessage('Statut invalide'),
  validateRequest,
  (req, res) => botsController.updateStatus(req, res)
);

// ==========================================
// ROUTES COMMANDES
// ==========================================

router.get('/:id/commands',
  param('id').isUUID().withMessage('ID de bot invalide'),
  validateRequest,
  (req, res) => botsController.getCommands(req, res)
);

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

router.delete('/:id/commands/:commandId',
  param('id').isUUID().withMessage('ID de bot invalide'),
  param('commandId').isUUID().withMessage('ID de commande invalide'),
  validateRequest,
  (req, res) => botsController.deleteCommand(req, res)
);

// ==========================================
// ROUTES SERVEURS
// ==========================================

router.post('/:id/servers',
  param('id').isUUID().withMessage('ID de bot invalide'),
  body('serverId').isUUID().withMessage('ID de serveur invalide'),
  body('permissions').optional().isInt({ min: 0 }),
  validateRequest,
  (req, res) => botsController.addToServer(req, res)
);

router.delete('/:id/servers/:serverId',
  param('id').isUUID().withMessage('ID de bot invalide'),
  param('serverId').isUUID().withMessage('ID de serveur invalide'),
  validateRequest,
  (req, res) => botsController.removeFromServer(req, res)
);

router.get('/servers/:serverId',
  param('serverId').isUUID().withMessage('ID de serveur invalide'),
  validateRequest,
  (req, res) => botsController.getBotsInServer(req, res)
);

// ==========================================
// ROUTES CERTIFICATION
// ==========================================

router.post('/:id/certification',
  param('id').isUUID().withMessage('ID de bot invalide'),
  body('reason').isString().isLength({ min: 10, max: 1000 }).withMessage('Raison requise (10-1000 caractères)'),
  validateRequest,
  (req, res) => botsController.requestCertification(req, res)
);

router.get('/certification/pending',
  (req, res) => botsController.getPendingCertifications(req, res)
);

router.post('/certification/:requestId/review',
  param('requestId').isUUID().withMessage('ID de demande invalide'),
  body('status').isIn(['approved', 'rejected']).withMessage('Statut invalide'),
  body('note').optional().isString().isLength({ max: 500 }),
  validateRequest,
  (req, res) => botsController.reviewCertification(req, res)
);

export const botsRouter = router;
