import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { login, register } from './auth.controller';

// Blocks brute-force attempts against /login — the single most common
// weak point in student projects that DO have JWT auth.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again later' },
});

export const authRouter = Router();

authRouter.post('/register', asyncHandler(register));
authRouter.post('/login', loginLimiter, asyncHandler(login));
