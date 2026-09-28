import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '@prisma/client';
import { isPrismaError, prisma } from '../../lib/prisma';
import {
  hashToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';

const toPublicUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

const invalidSession = () => ({ status: 401, message: 'Invalid or expired session' });

// Expects input already validated by registerSchema (email lowercased,
// password length checked).
export const registerUser = async (name: string, email: string, password: string) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw { status: 409, message: 'Email already registered' };

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    return await prisma.user.create({
      data: { name, email, passwordHash, role: 'VIEWER' },
    });
  } catch (err) {
    // Two sign-ups with the same email at the same moment can both pass the
    // check above; the unique index stops the second one here.
    if (isPrismaError(err, 'P2002')) throw { status: 409, message: 'Email already registered' };
    throw err;
  }
};

// Every login (and every refresh) opens a new session row. The row id goes
// into the refresh token as its jti; only a hash of the token is stored.
const startSession = async (user: User) => {
  const sessionId = crypto.randomUUID();
  const refreshToken = signRefreshToken(user.id, sessionId);

  await prisma.refreshToken.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return {
    accessToken: signAccessToken({ userId: user.id, role: user.role }),
    refreshToken,
    user: toPublicUser(user),
  };
};

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw { status: 401, message: 'Invalid credentials' };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw { status: 401, message: 'Invalid credentials' };

  return startSession(user);
};

// Refresh token rotation: each refresh token works exactly once and is swapped
// for a new one. If an already-used token shows up again, someone copied it
// before it was rotated, so every session of that user is revoked.
export const refreshSession = async (refreshToken: string) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw invalidSession();
  }
  if (!payload.jti) throw invalidSession();

  const session = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
    include: { user: true },
  });
  if (!session || session.userId !== payload.userId) throw invalidSession();
  if (session.tokenHash !== hashToken(refreshToken)) throw invalidSession();

  if (session.revoked) {
    await prisma.refreshToken.updateMany({
      where: { userId: session.userId, revoked: false },
      data: { revoked: true },
    });
    throw invalidSession();
  }
  if (session.expiresAt < new Date()) throw invalidSession();

  // `revoked: false` in the filter makes this a compare-and-set: if two
  // requests race with the same token, only one of them gets a new session.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: session.id, revoked: false },
    data: { revoked: true },
  });
  if (count === 0) throw invalidSession();

  // Reading the user fresh means a role change (e.g. admin:promote) applies
  // on the next refresh, without a new login.
  return startSession(session.user);
};

export const logoutSession = async (refreshToken: string | undefined) => {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    if (!payload.jti) return;
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, userId: payload.userId },
      data: { revoked: true },
    });
  } catch {
    // Invalid or expired token: there's no live session to revoke.
  }
};

export const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw { status: 404, message: 'User not found' };
  return toPublicUser(user);
};
