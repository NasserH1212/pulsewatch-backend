import { Response } from 'supertest';
import { prisma } from '../lib/prisma';

// Shared helpers for tests that hit the real database (auth, monitors).

export const uniqueEmail = (label: string) =>
  `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@pulsewatch.test`;

// Returns "refreshToken=<value>" from a response's Set-Cookie header.
export const getRefreshCookie = (res: Response): string | undefined => {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('refreshToken='));
  return cookie?.split(';')[0];
};

// Removes the users a test file created (their sessions cascade) and anything they own.
export const cleanupUsers = async (emails: string[]) => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.monitor.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
};
