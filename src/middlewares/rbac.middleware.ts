import { NextFunction, Response } from 'express';
import { AuthedRequest } from './auth.middleware';
import { UserRole } from '../lib/jwt';

// Always place requireAuth before this in the route chain — it depends on req.user.
export const requireRole = (...roles: UserRole[]) =>
  (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden — insufficient role' });
    }
    next();
  };
