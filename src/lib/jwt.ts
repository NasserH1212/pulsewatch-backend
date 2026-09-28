import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'ADMIN' | 'VIEWER';

export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
}

export interface VerifiedAccessToken extends AccessTokenPayload {
  exp: number; // seconds since epoch, set by jsonwebtoken
}

export interface VerifiedRefreshToken {
  userId: string;
  jti?: string; // id of the RefreshToken row
  exp: number;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Pin the algorithm on both sign and verify so a token can't pick its own.
const ALGORITHM = 'HS256';

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.jwtAccessSecret, {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });

export const signRefreshToken = (userId: string, sessionId: string): string =>
  jwt.sign({ userId }, env.jwtRefreshSecret, {
    algorithm: ALGORITHM,
    expiresIn: REFRESH_TOKEN_TTL_MS / 1000,
    jwtid: sessionId,
  });

export const verifyAccessToken = (token: string): VerifiedAccessToken =>
  jwt.verify(token, env.jwtAccessSecret, { algorithms: [ALGORITHM] }) as VerifiedAccessToken;

export const verifyRefreshToken = (token: string): VerifiedRefreshToken =>
  jwt.verify(token, env.jwtRefreshSecret, { algorithms: [ALGORITHM] }) as VerifiedRefreshToken;

// SHA-256, not bcrypt. bcrypt only reads the first 72 bytes of its input, and
// the first 72 bytes of a JWT are its header plus the start of the payload,
// which are the same for every token a user gets. A token is already long and
// unguessable, so a fast hash of the whole string is the right tool here.
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
