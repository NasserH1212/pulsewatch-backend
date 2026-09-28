import { CheckStatus, Monitor } from '@prisma/client';
import { Server } from 'socket.io';
import { prisma } from '../../lib/prisma';
import { sendTelegramAlert } from '../alerts/telegram.service';
import { runCheck } from './check.service';
import { effectiveIntervalSeconds, evaluateCheck, isDue, MonitorHealth } from './monitorState';

// How often the scheduler looks for monitors whose interval has elapsed.
// Each monitor is still checked on its own intervalSeconds, not on this tick.
const TICK_MS = 5_000;

// Checks run in parallel, but capped: a burst of slow or timing-out targets
// can't open hundreds of sockets at once or starve everything else.
const MAX_CONCURRENT_CHECKS = 10;

type ScheduledMonitor = Pick<
  Monitor,
  'id' | 'name' | 'type' | 'target' | 'intervalSeconds' | 'lastCheckedAt' | 'lastStatus' | 'consecutiveFailures'
>;

type Alert = 'DOWN' | 'UP' | null;

// Saves one check result and updates the monitor's state and incidents in a
// single transaction. The monitor row is locked (FOR UPDATE) and its state
// read inside the transaction, so two results for the same monitor are
// applied one after the other: a stale read can never open a second incident
// or send a second alert.
export const recordResult = (monitorId: string, isUp: boolean, responseTimeMs: number) =>
  prisma.$transaction(async (tx) => {
    const [current] = await tx.$queryRaw<MonitorHealth[]>`
      SELECT "lastStatus", "consecutiveFailures", "failureThreshold"
      FROM "Monitor" WHERE "id" = ${monitorId} FOR UPDATE`;
    if (!current) return null; // monitor was deleted while its check was running

    const checkStatus: CheckStatus = isUp ? 'UP' : 'DOWN';
    const checkedAt = new Date();
    const next = evaluateCheck(current, isUp);

    await tx.check.create({ data: { monitorId, status: checkStatus, responseTimeMs, checkedAt } });
    await tx.monitor.update({
      where: { id: monitorId },
      data: {
        lastStatus: next.lastStatus,
        consecutiveFailures: next.consecutiveFailures,
        lastCheckedAt: checkedAt,
      },
    });

    let alert: Alert = null;

    if (next.transition === 'WENT_DOWN') {
      const open = await tx.incident.findFirst({ where: { monitorId, resolvedAt: null } });
      if (!open) {
        // The outage began at the first failure of the streak, not at the
        // check that confirmed it, so downtime is measured from there.
        const streak = await tx.check.findMany({
          where: { monitorId },
          orderBy: { checkedAt: 'desc' },
          take: next.consecutiveFailures,
          select: { checkedAt: true },
        });
        const startedAt = streak[streak.length - 1]?.checkedAt ?? checkedAt;
        const cause =
          next.consecutiveFailures === 1 ? 'Check failed' : `${next.consecutiveFailures} checks failed in a row`;

        await tx.incident.create({ data: { monitorId, cause, startedAt } });
        alert = 'DOWN';
      }
    } else if (next.transition === 'RECOVERED') {
      await tx.incident.updateMany({
        where: { monitorId, resolvedAt: null },
        data: { resolvedAt: checkedAt },
      });
      alert = 'UP';
    }

    return { ...next, checkStatus, checkedAt, alert };
  });

const checkMonitor = async (monitor: ScheduledMonitor, io: Server) => {
  const { isUp, responseTimeMs } = await runCheck(monitor.type, monitor.target);
  const result = await recordResult(monitor.id, isUp, responseTimeMs);
  if (!result) return;

  io.emit('check:update', {
    monitorId: monitor.id,
    status: result.lastStatus, // confirmed monitor state: UP, DOWN, or null (not confirmed yet)
    checkStatus: result.checkStatus, // raw result of this one check
    consecutiveFailures: result.consecutiveFailures,
    responseTimeMs,
    checkedAt: result.checkedAt.toISOString(),
  });

  // Network calls stay outside the transaction so it isn't held open.
  if (result.alert === 'DOWN') {
    await sendTelegramAlert(`🔴 ${monitor.name} is DOWN — ${monitor.target}`);
  } else if (result.alert === 'UP') {
    await sendTelegramAlert(`✅ ${monitor.name} is back UP — ${monitor.target}`);
  }
};

// Designed for a single API instance. With several, each would check every
// monitor (incidents would still be correct thanks to the row lock above);
// a shared lock such as a Postgres advisory lock would fix that.
export const startScheduler = (io: Server) => {
  const inFlight = new Set<string>();
  // When each monitor's check was last started, measured from tick starts so
  // intervals stay on schedule. The DB's lastCheckedAt (set when a check
  // finishes) is only the fallback, e.g. right after a restart.
  const lastStartedAt = new Map<string, number>();
  let ticking = false;

  const tick = async () => {
    if (ticking) return; // the previous tick's DB read hasn't come back yet
    ticking = true;
    const now = Date.now();

    try {
      const monitors = await prisma.monitor.findMany({
        where: { paused: false },
        select: {
          id: true,
          name: true,
          type: true,
          target: true,
          intervalSeconds: true,
          lastCheckedAt: true,
          lastStatus: true,
          consecutiveFailures: true,
        },
        orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } }, // most overdue first
      });

      for (const monitor of monitors) {
        if (inFlight.size >= MAX_CONCURRENT_CHECKS) break; // the rest wait for the next tick
        if (inFlight.has(monitor.id)) continue;

        const lastRunAt = lastStartedAt.get(monitor.id) ?? monitor.lastCheckedAt?.getTime();
        if (!isDue(effectiveIntervalSeconds(monitor), lastRunAt, now)) continue;

        inFlight.add(monitor.id);
        lastStartedAt.set(monitor.id, now);

        // Not awaited: checks run in the background while the tick moves on.
        checkMonitor(monitor, io)
          .catch((err) => console.error(`[scheduler] check failed for monitor ${monitor.id}:`, err))
          .finally(() => inFlight.delete(monitor.id));
      }

      // Forget monitors that have been deleted.
      const liveIds = new Set(monitors.map((m) => m.id));
      for (const id of lastStartedAt.keys()) {
        if (!liveIds.has(id)) lastStartedAt.delete(id);
      }
    } catch (err) {
      console.error('[scheduler] tick failed:', err);
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  void tick();
  console.log(`⏱  Scheduler started — each monitor is checked on its own interval`);

  return () => clearInterval(timer);
};
