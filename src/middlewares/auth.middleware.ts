import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../lib/jwt';

export interface AuthedRequest extends Request {
  user?: AccessTokenPayload;
}

export const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    req.user = verifyAccessToken(header.split(' ')[1]);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
