import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { signAccessToken, signRefreshToken } from '../../lib/jwt';

export const registerUser = async (name: string, email: string, password: string) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw { status: 409, message: 'Email already registered' };

  if (password.length < 8) {
    throw { status: 400, message: 'Password must be at least 8 characters' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({
    data: { name, email, passwordHash, role: 'VIEWER' },
  });
};

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw { status: 401, message: 'Invalid credentials' };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw { status: 401, message: 'Invalid credentials' };

  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: await bcrypt.hash(refreshToken, 10),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
};
