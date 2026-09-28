import { prisma } from '../../lib/prisma';
import { downtimeSecondsInPeriod, STATS_PERIOD_MS, StatsPeriod } from '../checks/monitorState';
import { CreateMonitorInput, targetRules, UpdateMonitorInput } from './monitor.schemas';

export const createMonitor = (input: CreateMonitorInput, createdById: string) =>
  prisma.monitor.create({ data: { ...input, createdById } });

export const listMonitors = () =>
  prisma.monitor.findMany({
    orderBy: { createdAt: 'desc' },
    include: { checks: { orderBy: { checkedAt: 'desc' }, take: 1 } }, // latest raw check per monitor
  });

export const getMonitorWithHistory = (id: string) =>
  prisma.monitor.findUnique({
    where: { id },
    include: {
      checks: { orderBy: { checkedAt: 'desc' }, take: 100 },
      incidents: { orderBy: { startedAt: 'desc' }, take: 20 },
    },
  });

// deleteMany instead of delete: a missing id gives count 0 rather than an
// exception, so it can be answered with a clean 404.
export const deleteMonitor = async (id: string) => {
  const { count } = await prisma.monitor.deleteMany({ where: { id } });
  if (count === 0) throw { status: 404, message: 'Monitor not found' };
};

// Aggregated in the database (groupBy / count) instead of loading every
// check row into memory — a busy monitor on a short interval can have tens
// of thousands of checks in a 30-day window.
export const getMonitorStats = async (id: string, period: StatsPeriod) => {
  const monitor = await prisma.monitor.findUnique({ where: { id }, select: { id: true } });
  if (!monitor) throw { status: 404, message: 'Monitor not found' };

  const now = new Date();
  const periodStart = new Date(now.getTime() - STATS_PERIOD_MS[period]);

  const [byStatus, incidents] = await Promise.all([
    prisma.check.groupBy({
      by: ['status'],
      where: { monitorId: id, checkedAt: { gte: periodStart } },
      _count: { _all: true },
      _avg: { responseTimeMs: true },
    }),
    // An incident overlaps the period if it's still open, or it resolved
    // inside the period — one that both started and resolved before
    // periodStart contributed no downtime within the window.
    prisma.incident.findMany({
      where: { monitorId: id, OR: [{ resolvedAt: null }, { resolvedAt: { gte: periodStart } }] },
      select: { startedAt: true, resolvedAt: true },
    }),
  ]);

  const upGroup = byStatus.find((group) => group.status === 'UP');
  const totalChecks = byStatus.reduce((sum, group) => sum + group._count._all, 0);
  const upCount = upGroup?._count._all ?? 0;

  return {
    period,
    totalChecks,
    uptimePercent: totalChecks === 0 ? null : Math.round((upCount / totalChecks) * 10000) / 100,
    avgResponseTimeMs:
      upGroup?._avg.responseTimeMs != null ? Math.round(upGroup._avg.responseTimeMs) : null,
    incidentCount: incidents.length,
    downtimeSeconds: downtimeSecondsInPeriod(incidents, periodStart, now),
  };
};

// The type itself can't change through this endpoint, so a new target is
// checked against the monitor's existing type with the same rules createMonitorSchema
// uses. Changing the target resets consecutiveFailures: a streak counted
// against the old target shouldn't carry over to the new one.
export const updateMonitor = async (id: string, input: UpdateMonitorInput) => {
  const monitor = await prisma.monitor.findUnique({ where: { id } });
  if (!monitor) throw { status: 404, message: 'Monitor not found' };

  const data: Parameters<typeof prisma.monitor.update>[0]['data'] = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.intervalSeconds !== undefined) data.intervalSeconds = input.intervalSeconds;
  if (input.failureThreshold !== undefined) data.failureThreshold = input.failureThreshold;
  if (input.paused !== undefined) data.paused = input.paused;

  if (input.target !== undefined) {
    const rule = targetRules[monitor.type];
    if (!rule.isValid(input.target)) throw { status: 400, message: rule.message };

    data.target = input.target;
    if (input.target !== monitor.target) data.consecutiveFailures = 0;
  }

  return prisma.monitor.update({ where: { id }, data });
};
