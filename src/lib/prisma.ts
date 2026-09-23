import { PrismaClient } from '@prisma/client';

// A single shared instance avoids exhausting DB connections in dev
// (ts-node-dev hot-reloads the module otherwise).
export const prisma = new PrismaClient();
