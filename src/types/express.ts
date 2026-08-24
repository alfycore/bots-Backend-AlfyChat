// ==========================================
// ALFYCHAT - TYPES EXPRESS EXTENSION
// ==========================================
// Augmentation de module plutôt qu'une interface dérivée : `AuthRequest extends
// Request` fixait les génériques de Request, et un handler typé `AuthRequest`
// n'était plus assignable à `RequestHandler` (params `Record<string, any> |
// undefined` vs `ParamsDictionary`). Avec l'augmentation, `req.userId` existe
// sur toute Request, sans contrainte de généricité.

import type { Request } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
    }
  }
}

/** Alias conservé pour les signatures existantes. */
export type AuthRequest = Request;

export {};
