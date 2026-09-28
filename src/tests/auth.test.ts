import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsers, getRefreshCookie, uniqueEmail } from './helpers';

// Requires a running database matching .env's DATABASE_URL, with migrations
// applied (npx prisma migrate deploy). Every user created here is deleted in afterAll.
const app = createApp();
const password = 'correct-horse-battery';
const email = uniqueEmail('auth');

afterAll(async () => {
  await cleanupUsers([email]);
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('rejects login with a non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('rejects login with missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });
});

describe('session lifecycle', () => {
  let accessToken: string;
  let firstCookie: string;
  let rotatedCookie: string;

  it('registers a new user as VIEWER', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password });
    expect(res.status).toBe(201);
    expect(res.body.passwordHash).toBeUndefined();

    const duplicate = await request(app).post('/api/auth/register').send({ name: 'Again', email, password });
    expect(duplicate.status).toBe(409);
  });

  it('logs in and sets an httpOnly refresh cookie scoped to /api/auth', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('VIEWER');

    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Path=\/api\/auth/);

    accessToken = res.body.accessToken;
    firstCookie = getRefreshCookie(res)!;
    expect(firstCookie).toBeDefined();
  });

  it('GET /api/auth/me returns the current user', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email, role: 'VIEWER' });
  });

  it('GET /api/auth/me without a token is rejected', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('refresh without a cookie is rejected', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('refresh returns a new access token and rotates the refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    rotatedCookie = getRefreshCookie(res)!;
    expect(rotatedCookie).toBeDefined();
    expect(rotatedCookie).not.toBe(firstCookie);
  });

  it('reusing an already-rotated token revokes every session of that user', async () => {
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
    expect(reuse.status).toBe(401);

    // The legitimate, newer token is now dead too: the whole family was revoked.
    const afterReuse = await request(app).post('/api/auth/refresh').set('Cookie', rotatedCookie);
    expect(afterReuse.status).toBe(401);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const cookie = getRefreshCookie(login)!;

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/refreshToken=;/);

    const afterLogout = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(afterLogout.status).toBe(401);
  });
});
