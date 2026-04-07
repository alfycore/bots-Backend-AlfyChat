// ==========================================
// ALFYCHAT - TYPES EXPRESS EXTENSION
// ==========================================

import { Request } from 'express';

export interface AuthRequest extends Request {
  userId?: string;
  sessionId?: string;
}
