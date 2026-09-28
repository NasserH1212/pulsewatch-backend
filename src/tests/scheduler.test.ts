import { prisma } from '../lib/prisma';
import { recordResult } from '../modules/checks/scheduler';
import { cleanupUsers, uniqueEmail } from './helpers';

// Requires a running database (see auth.test.ts). Exercises the part of the
// scheduler that writes results: incidents and alerts on UP/DOWN transitions.
const email = uniqueEmail('scheduler');
let monitorId: string;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: 'Scheduler', email, passwordHash: 'x' } });
  const monitor = await prisma.monitor.create({
    data: { name: 'Target', type: 'HTTP', target: 'https://example.com', createdById: user.id },
  });
  monitorId = monitor.id;
});

afterAll(async () => {
  await cleanupUsers([email]);
  await prisma.$disconnect();
});

const openIncidents = () => prisma.incident.count({ where: { monitorId, resolvedAt: null } });

describe('recordResult', () => {
  it('opens one incident and alerts once when a monitor goes down', async () => {
    const first = await recordResult(monitorId, false, 5000);
    expect(first?.alert).toBe('DOWN');

    const second = await recordResult(monitorId, false, 5000);
    expect(second?.alert).toBeNull(); // still down: no repeated alert
    expect(await openIncidents()).toBe(1);

    const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    expect(monitor?.lastStatus).toBe('DOWN');
  });

  it('resolves the incident and alerts once when it recovers', async () => {
    const back = await recordResult(monitorId, true, 120);
    expect(back?.alert).toBe('UP');
    expect(await openIncidents()).toBe(0);

    const again = await recordResult(monitorId, true, 110);
    expect(again?.alert).toBeNull();
  });

  it('never opens two incidents when results for one monitor arrive at the same time', async () => {
    const results = await Promise.all([
      recordResult(monitorId, false, 5000),
      recordResult(monitorId, false, 5000),
      recordResult(monitorId, false, 5000),
    ]);

    expect(results.filter((r) => r?.alert === 'DOWN')).toHaveLength(1);
    expect(await openIncidents()).toBe(1);
  });

  it('stores every check', async () => {
    expect(await prisma.check.count({ where: { monitorId } })).toBe(7);
  });

  it('ignores results for a monitor deleted mid-check', async () => {
    const gone = await prisma.monitor.create({
      data: { name: 'Gone', type: 'PING', target: '10.0.0.1', createdById: (await prisma.user.findUniqueOrThrow({ where: { email } })).id },
    });
    await prisma.monitor.delete({ where: { id: gone.id } });

    expect(await recordResult(gone.id, false, 5000)).toBeNull();
  });
});
