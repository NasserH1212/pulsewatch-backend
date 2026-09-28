import 'dotenv/config';
import { prisma } from '../lib/prisma';

// Registration always creates VIEWER accounts, so an ADMIN can't be created
// through the API. This script promotes an already-registered user:
//
//   npm run admin:promote -- you@example.com
//
// Log in again afterwards: the role lives inside the access token.
const findUserByEmail = async (email: string) => {
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;

  // Registration doesn't normalize case yet, so fall back to a case-insensitive
  // match. Re-check in JS: Postgres implements this with ILIKE, where "_" is a
  // wildcard, and promoting the wrong account would be a real security bug.
  const target = email.toLowerCase();
  const matches = (
    await prisma.user.findMany({ where: { email: { equals: email, mode: 'insensitive' } } })
  ).filter((u) => u.email.toLowerCase() === target);

  if (matches.length > 1) throw new Error(`Several accounts match ${email}; pass the exact email`);
  return matches[0] ?? null;
};

export const promoteUserToAdmin = async (email: string) => {
  const user = await findUserByEmail(email.trim());
  if (!user) throw new Error(`No user registered with email ${email}`);
  if (user.role === 'ADMIN') return user;

  return prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
};

const main = async () => {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run admin:promote -- <email>');
    process.exitCode = 1;
    return;
  }

  try {
    const user = await promoteUserToAdmin(email);
    console.log(`✅ ${user.email} is now ADMIN. Log in again to get an ADMIN token.`);
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  void main();
}
