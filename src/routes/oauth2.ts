// ==========================================
// ALFYCHAT - OAUTH2 ROUTES
// ==========================================

import { Router } from 'express';
import { body, param } from 'express-validator';
import { oauth2Controller } from '../controllers/oauth2.controller';
import { validateRequest, authMiddleware } from '../middleware';

const router = Router();

// GET /oauth2/applications/:clientId — infos publiques (pas d'auth)
router.get('/applications/:clientId',
  param('clientId').isUUID().withMessage('client_id invalide'),
  validateRequest,
  (req, res) => oauth2Controller.getApplication(req, res)
);

// POST /oauth2/authorize — l'utilisateur authentifié approuve
router.post('/authorize',
  authMiddleware,
  body('clientId').isUUID().withMessage('clientId invalide'),
  body('redirectUri').isURL({ require_tld: false }).withMessage('redirectUri invalide'),
  body('scopes').isArray({ min: 1 }).withMessage('scopes requis'),
  body('permissions').optional().isInt({ min: 0 }),
  validateRequest,
  (req, res) => oauth2Controller.authorize(req, res)
);

// POST /oauth2/token — échange code → access_token (pas d'auth JWT, credentials dans le body)
router.post('/token',
  body('grant_type').equals('authorization_code').withMessage('grant_type doit être authorization_code'),
  body('code').isString().isLength({ min: 1 }).withMessage('code requis'),
  body('client_id').isUUID().withMessage('client_id invalide'),
  body('client_secret').isString().isLength({ min: 1 }).withMessage('client_secret requis'),
  body('redirect_uri').isURL({ require_tld: false }).withMessage('redirect_uri invalide'),
  validateRequest,
  (req, res) => oauth2Controller.exchangeToken(req, res)
);

export const oauth2Router = router;
