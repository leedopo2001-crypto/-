import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth.js';

function isAdminPhone(phone: string): boolean {
  const configured = (process.env.ADMIN_PHONE ?? '').replace(/[^\d]/g, '');
  if (!configured) return false;
  return configured === phone;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.auth || !isAdminPhone(req.auth.phone)) {
      return res.status(403).json({ error: 'admin_only' });
    }
    return next();
  });
}
