import { Request, Response } from 'express';
import { loginUser, registerUser } from './auth.service';
import { env } from '../../config/env';

export const register = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }

  const user = await registerUser(name, email, password);
  res.status(201).json({ id: user.id, name: user.name, email: user.email });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { accessToken, refreshToken, user } = await loginUser(email, password);

  // Refresh token lives only in an httpOnly cookie — never exposed to client-side JS.
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ accessToken, user });
};
