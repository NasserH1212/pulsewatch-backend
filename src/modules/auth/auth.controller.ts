import { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { REFRESH_TOKEN_TTL_MS } from '../../lib/jwt';
import { AuthedRequest } from '../../middlewares/auth.middleware';
import { LoginInput, RegisterInput } from './auth.schemas';
import {
  getCurrentUser,
  loginUser,
  logoutSession,
  refreshSession,
  registerUser,
} from './auth.service';

const REFRESH_COOKIE = 'refreshToken';

// The refresh token lives only in an httpOnly cookie, never in client-side JS.
// Path limits it to /api/auth/*, so the browser doesn't attach it to every call.
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'strict',
  path: '/api/auth',
};

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, { ...refreshCookieOptions, maxAge: REFRESH_TOKEN_TTL_MS });

const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);

// Bodies reaching register and login were already checked and normalized by
// validateBody (see auth.routes.ts), so no field checks are repeated here.
export const register = async (req: Request, res: Response) => {
  const { name, email, password } = req.body as RegisterInput;
  const user = await registerUser(name, email, password);
  res.status(201).json({ id: user.id, name: user.name, email: user.email });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput;
  const { accessToken, refreshToken, user } = await loginUser(email, password);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user });
};

export const refresh = async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: 'Missing refresh token' });

  try {
    const { accessToken, refreshToken, user } = await refreshSession(token);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  } catch (err) {
    clearRefreshCookie(res); // a dead token is no use to the browser
    throw err;
  }
};

export const logout = async (req: Request, res: Response) => {
  await logoutSession(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.status(204).send();
};

export const me = async (req: AuthedRequest, res: Response) => {
  res.json(await getCurrentUser(req.user!.userId));
};
