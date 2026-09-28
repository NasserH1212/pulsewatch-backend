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

  it('creates a monitor with the default threshold and ignores unknown fields', async () => {
    const res = await request(app)
      .post('/api/monitors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...newMonitor, type: 'PORT', target: 'db.example.com:5432', lastStatus: 'DOWN' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ failureThreshold: 2, consecutiveFailures: 0, lastStatus: null });
  });

  it('rejects an invalid monitor with 400 and field details (it used to be a 500)', async () => {
    const res = await request(app)
      .post('/api/monitors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', type: 'HTTP', target: 'not a url', intervalSeconds: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['intervalSeconds', 'target']);
  });

  it('rejects an unknown monitor type', async () => {
    const res = await request(app)
      .post('/api/monitors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...newMonitor, type: 'SMTP' });
    expect(res.status).toBe(400);
  });

  it('answers 404 when deleting a monitor that does not exist (it used to be a 500)', async () => {
    const res = await request(app)
      .delete('/api/monitors/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Monitor not found');
  });

  it('answers 404 for a monitor that does not exist', async () => {
    const res = await request(app).get('/api/monitors/does-not-exist').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(404);
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
