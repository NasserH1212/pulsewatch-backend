import { prisma } from '../lib/prisma';
import { deleteOldChecks } from '../modules/checks/retention';
import { cleanupUsers, uniqueEmail } from './helpers';

// Requires a running database (see auth.test.ts).
const email = uniqueEmail('retention');
const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-28T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

let monitorA: string;
let monitorB: string;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: 'Retention', email, passwordHash: 'x' } });
  const create = () =>
    prisma.monitor.create({ data: { name: 'M', type: 'PING', target: '10.0.0.1', createdById: user.id } });
  monitorA = (await create()).id;
  monitorB = (await create()).id;

  await prisma.check.createMany({
    data: [
      { monitorId: monitorA, status: 'UP', checkedAt: daysAgo(45) },
      { monitorId: monitorA, status: 'DOWN', checkedAt: daysAgo(31) },
      { monitorId: monitorA, status: 'UP', checkedAt: daysAgo(29) },
      { monitorId: monitorA, status: 'UP', checkedAt: daysAgo(1) },
      { monitorId: monitorB, status: 'UP', checkedAt: daysAgo(90) },
      { monitorId: monitorB, status: 'UP', checkedAt: daysAgo(2) },
    ],
  });
  await prisma.incident.create({ data: { monitorId: monitorA, startedAt: daysAgo(31), resolvedAt: daysAgo(30) } });
});

afterAll(async () => {
  await cleanupUsers([email]);
  await prisma.$disconnect();
});

describe('deleteOldChecks', () => {
  it('deletes only checks older than the retention window, across all monitors', async () => {
    const deleted = await deleteOldChecks(30, now);
    // Other test files may have their own old checks, so count at least ours.
    expect(deleted).toBeGreaterThanOrEqual(3);

    const remaining = await prisma.check.findMany({
      where: { monitorId: { in: [monitorA, monitorB] } },
      orderBy: { checkedAt: 'asc' },
    });
    expect(remaining.map((c) => [c.monitorId, c.checkedAt.getTime()])).toEqual([
      [monitorA, daysAgo(29).getTime()],
      [monitorB, daysAgo(2).getTime()],
      [monitorA, daysAgo(1).getTime()],
    ]);
  });

  it('keeps incidents, which are the long-term record', async () => {
    expect(await prisma.incident.count({ where: { monitorId: monitorA } })).toBe(1);
  });
});
