import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middlewares/auth.middleware';
import { login, logout, me, refresh, register } from './auth.controller';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Blocks brute-force attempts against /login — the single most common
// weak point in student projects that DO have JWT auth.
const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  message: { error: 'Too many login attempts, try again later' },
});

// Stops scripted mass sign-ups.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many accounts created, try again later' },
});

// Generous: a normal client refreshes about once per access-token lifetime.
const refreshLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 60,
  message: { error: 'Too many refresh attempts, try again later' },
});

export const authRouter = Router();

authRouter.post('/register', registerLimiter, asyncHandler(register));
authRouter.post('/login', loginLimiter, asyncHandler(login));
authRouter.post('/refresh', refreshLimiter, asyncHandler(refresh));
authRouter.post('/logout', asyncHandler(logout));
authRouter.get('/me', requireAuth, asyncHandler(me));
