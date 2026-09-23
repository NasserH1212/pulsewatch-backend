import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'ADMIN' | 'VIEWER';

export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.jwtAccessSecret, { expiresIn: '15m' });

export const signRefreshToken = (userId: string): string =>
  jwt.sign({ userId }, env.jwtRefreshSecret, { expiresIn: '7d' });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): { userId: string } =>
  jwt.verify(token, env.jwtRefreshSecret) as { userId: string };
