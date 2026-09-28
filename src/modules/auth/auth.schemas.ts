import { z } from 'zod';

// Emails are stored lowercased, so "Nasser@X.com" and "nasser@x.com" are one account.
const email = z
  .string('Email is required')
  .trim()
  .toLowerCase()
  .pipe(z.email('Invalid email address').max(254, 'Email is too long'));

export const registerSchema = z.object({
  name: z.string('Name is required').trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email,
  password: z
    .string('Password is required')
    .min(8, 'Password must be at least 8 characters')
    // bcrypt ignores everything after the first 72 bytes, so a longer password
    // would silently accept any text that shares its first 72 bytes.
    .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, {
      error: 'Password must be at most 72 bytes',
    }),
});

export const loginSchema = z.object({
  email,
  // No strength rules here: login only checks the password, it doesn't set one.
  password: z.string('Password is required').min(1, 'Password is required').max(1024),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
