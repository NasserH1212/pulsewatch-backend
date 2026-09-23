import request from 'supertest';
import { createApp } from '../app';

// Requires a running database matching .env's DATABASE_URL (docker-compose up -d
// then npx prisma migrate dev). This is intentionally a small starting example —
// add one file per module (monitors.test.ts, checks.test.ts) as you build them out.
const app = createApp();

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
