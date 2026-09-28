import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { promoteUserToAdmin } from '../scripts/promoteAdmin';
import { cleanupUsers, uniqueEmail } from './helpers';

// Requires a running database (see auth.test.ts). Checks that roles are enforced.
const app = createApp();
const password = 'correct-horse-battery';
const viewerEmail = uniqueEmail('viewer');
const adminEmail = uniqueEmail('admin');

let viewerToken: string;
let adminToken: string;

const login = async (email: string) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken as string;
};

beforeAll(async () => {
  await request(app).post('/api/auth/register').send({ name: 'Viewer', email: viewerEmail, password });
  await request(app).post('/api/auth/register').send({ name: 'Admin', email: adminEmail, password });

  // Same code path as `npm run admin:promote -- <email>`, with different casing
  // to prove the lookup ignores case.
  const promoted = await promoteUserToAdmin(adminEmail.toUpperCase());
  expect(promoted.role).toBe('ADMIN');

  viewerToken = await login(viewerEmail);
  adminToken = await login(adminEmail); // after promotion, so the token says ADMIN
});

afterAll(async () => {
  await cleanupUsers([viewerEmail, adminEmail]);
  await prisma.$disconnect();
});

const newMonitor = { name: 'Example', type: 'HTTP', target: 'https://example.com', intervalSeconds: 60 };

describe('/api/monitors access control', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/monitors');
    expect(res.status).toBe(401);
  });

  it('lets a VIEWER list monitors but not create one', async () => {
    const list = await request(app).get('/api/monitors').set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(200);

    const create = await request(app)
      .post('/api/monitors')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send(newMonitor);
    expect(create.status).toBe(403);
  });

  it('lets an ADMIN create and delete a monitor', async () => {
    const create = await request(app)
      .post('/api/monitors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newMonitor);
    expect(create.status).toBe(201);
    expect(create.body.lastStatus).toBeNull(); // not checked yet

    const remove = await request(app)
      .delete(`/api/monitors/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(remove.status).toBe(204);
  });

  it('does not let a VIEWER delete a monitor', async () => {
    const create = await request(app)
      .post('/api/monitors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newMonitor);

    const remove = await request(app)
      .delete(`/api/monitors/${create.body.id}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(remove.status).toBe(403);
  });
});
