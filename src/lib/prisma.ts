import { PrismaClient } from '@prisma/client';

// A single shared instance avoids exhausting DB connections in dev
// (ts-node-dev hot-reloads the module otherwise).
export const prisma = new PrismaClient();

// Prisma error codes worth handling explicitly:
//   P2002 unique constraint failed · P2025 record not found
// Matched by name and code rather than instanceof, which breaks when two
// copies of the Prisma runtime are loaded (e.g. under Jest).
export const isPrismaError = (err: unknown, code: string): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { name?: unknown }).name === 'PrismaClientKnownRequestError' &&
  (err as { code?: unknown }).code === code;
