import { prisma } from '../lib/prisma';
import { recordResult } from '../modules/checks/scheduler';
import { cleanupUsers, uniqueEmail } from './helpers';

// Requires a running database (see auth.test.ts). Exercises the part of the
// scheduler that writes results: state, incidents and alerts.
const email = uniqueEmail('scheduler');
let userId: string;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: 'Scheduler', email, passwordHash: 'x' } });
  userId = user.id;
});

afterAll(async () => {
  await cleanupUsers([email]);
  await prisma.$disconnect();
});

const createMonitor = (failureThreshold?: number) =>
  prisma.monitor.create({
    data: { name: 'Target', type: 'HTTP', target: 'https://example.com', createdById: userId, failureThreshold },
  });

const openIncidents = (monitorId: string) => prisma.incident.count({ where: { monitorId, resolvedAt: null } });

describe('recordResult with the default threshold (2)', () => {
  let monitorId: string;
  let firstFailureAt: Date;

  beforeAll(async () => {
    monitorId = (await createMonitor()).id;
    await recordResult(monitorId, true, 100); // healthy to begin with
  });

  it('a single failed check is recorded but opens no incident', async () => {
    const result = await recordResult(monitorId, false, 5000);
    firstFailureAt = result!.checkedAt;

    expect(result).toMatchObject({ alert: null, lastStatus: 'UP', checkStatus: 'DOWN', consecutiveFailures: 1 });
    expect(await openIncidents(monitorId)).toBe(0);
  });

  it('the second failure in a row opens one incident, dated from the first failure', async () => {
    const result = await recordResult(monitorId, false, 5000);
    expect(result).toMatchObject({ alert: 'DOWN', lastStatus: 'DOWN', consecutiveFailures: 2 });

    const incidents = await prisma.incident.findMany({ where: { monitorId } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].startedAt).toEqual(firstFailureAt);
    expect(incidents[0].cause).toBe('2 checks failed in a row');
  });

  it('further failures do not alert again', async () => {
    const result = await recordResult(monitorId, false, 5000);
    expect(result?.alert).toBeNull();
    expect(await openIncidents(monitorId)).toBe(1);
  });

  it('the first success resolves the incident and alerts once', async () => {
    const back = await recordResult(monitorId, true, 120);
    expect(back).toMatchObject({ alert: 'UP', lastStatus: 'UP', consecutiveFailures: 0 });
    expect(await openIncidents(monitorId)).toBe(0);

    const again = await recordResult(monitorId, true, 110);
    expect(again?.alert).toBeNull();
  });

  it('a flapping target (fail, ok, fail) never alerts', async () => {
    const results = [
      await recordResult(monitorId, false, 5000),
      await recordResult(monitorId, true, 100),
      await recordResult(monitorId, false, 5000),
    ];
    expect(results.map((r) => r?.alert)).toEqual([null, null, null]);
    expect(await openIncidents(monitorId)).toBe(0);
  });

  it('stores every check with its raw result', async () => {
    const checks = await prisma.check.findMany({ where: { monitorId }, orderBy: { checkedAt: 'asc' } });
    expect(checks.map((c) => c.status)).toEqual(['UP', 'DOWN', 'DOWN', 'DOWN', 'UP', 'UP', 'DOWN', 'UP', 'DOWN']);
  });
});

describe('recordResult under concurrency', () => {
  it('never opens two incidents when results for one monitor arrive at the same time', async () => {
    const { id } = await createMonitor();
    await recordResult(id, true, 100);

    const results = await Promise.all([
      recordResult(id, false, 5000),
      recordResult(id, false, 5000),
      recordResult(id, false, 5000),
      recordResult(id, false, 5000),
    ]);

    expect(results.filter((r) => r?.alert === 'DOWN')).toHaveLength(1);
    expect(await openIncidents(id)).toBe(1);

    const monitor = await prisma.monitor.findUniqueOrThrow({ where: { id } });
    expect(monitor.consecutiveFailures).toBe(4); // no lost updates
  });
});

describe('recordResult edge cases', () => {
  it('alerts on the first failure when the threshold is 1', async () => {
    const { id } = await createMonitor(1);
    const result = await recordResult(id, false, 5000);
    expect(result).toMatchObject({ alert: 'DOWN', lastStatus: 'DOWN' });
    expect((await prisma.incident.findFirstOrThrow({ where: { monitorId: id } })).cause).toBe('Check failed');
  });

  it('ignores results for a monitor deleted mid-check', async () => {
    const { id } = await createMonitor();
    await prisma.monitor.delete({ where: { id } });
    expect(await recordResult(id, false, 5000)).toBeNull();
  });
});
