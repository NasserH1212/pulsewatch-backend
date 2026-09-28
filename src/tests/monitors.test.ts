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

describe('GET /api/monitors/:id/stats', () => {
  let monitorId: string;
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

  beforeAll(async () => {
    const create = await request(app)
      .post('/api/monitors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newMonitor);
    monitorId = create.body.id;

    // Inside the 24h window: 3 UP (100/200/300ms) + 1 DOWN. One more UP sits
    // outside it (40h ago), only picked up by the wider 7d period.
    await prisma.check.createMany({
      data: [
        { monitorId, status: 'UP', responseTimeMs: 100, checkedAt: hoursAgo(20) },
        { monitorId, status: 'UP', responseTimeMs: 200, checkedAt: hoursAgo(10) },
        { monitorId, status: 'UP', responseTimeMs: 300, checkedAt: hoursAgo(5) },
        { monitorId, status: 'DOWN', checkedAt: hoursAgo(4) },
        { monitorId, status: 'UP', responseTimeMs: 999, checkedAt: hoursAgo(40) },
      ],
    });
    // Overlaps the 24h period: 3 hours of downtime.
    await prisma.incident.create({ data: { monitorId, startedAt: hoursAgo(6), resolvedAt: hoursAgo(3) } });
    // Resolved well before the 24h period, but still inside the 7d one.
    await prisma.incident.create({ data: { monitorId, startedAt: hoursAgo(50), resolvedAt: hoursAgo(45) } });
  });

  it('defaults to a 24h period and aggregates counts, uptime and downtime', async () => {
    const res = await request(app)
      .get(`/api/monitors/${monitorId}/stats`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      period: '24h',
      totalChecks: 4,
      uptimePercent: 75,
      avgResponseTimeMs: 200, // average of the 3 UP checks only
      incidentCount: 1,
      downtimeSeconds: 3 * 60 * 60,
    });
  });

  it('picks up more checks and incidents with a wider period', async () => {
    const res = await request(app)
      .get(`/api/monitors/${monitorId}/stats?period=7d`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalChecks).toBe(5);
    expect(res.body.incidentCount).toBe(2);
  });

  it('rejects an unsupported period', async () => {
    const res = await request(app)
      .get(`/api/monitors/${monitorId}/stats?period=1h`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(400);
  });

  it('answers 404 for a monitor that does not exist', async () => {
    const res = await request(app)
      .get('/api/monitors/00000000-0000-0000-0000-000000000000/stats')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/monitors/:id', () => {
  let monitorId: string;

  beforeEach(async () => {
    const create = await request(app)
      .post('/api/monitors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newMonitor);
    monitorId = create.body.id;
  });

  it('lets an ADMIN update name, interval, threshold and paused', async () => {
    const res = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed', intervalSeconds: 120, failureThreshold: 5, paused: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed', intervalSeconds: 120, failureThreshold: 5, paused: true });
  });

  it('resets consecutiveFailures when the target changes', async () => {
    await prisma.monitor.update({ where: { id: monitorId }, data: { consecutiveFailures: 3 } });

    const res = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ target: 'https://example.org' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ target: 'https://example.org', consecutiveFailures: 0 });
  });

  it('keeps consecutiveFailures when the target is unchanged', async () => {
    await prisma.monitor.update({ where: { id: monitorId }, data: { consecutiveFailures: 3 } });

    const res = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ target: newMonitor.target, name: 'Same target' });

    expect(res.status).toBe(200);
    expect(res.body.consecutiveFailures).toBe(3);
  });

  it('rejects a target that no longer matches the monitor type', async () => {
    const res = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ target: 'not a url' });

    expect(res.status).toBe(400);
  });

  it('ignores an attempt to change the type', async () => {
    const res = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'PING', name: 'Still HTTP' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('HTTP');
  });

  it('rejects a body with no fields to update', async () => {
    const res = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('does not let a VIEWER update a monitor', async () => {
    const res = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('answers 404 for a monitor that does not exist', async () => {
    const res = await request(app)
      .patch('/api/monitors/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(404);
  });
});
