import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';

const RUN_EVERY_MS = 60 * 60 * 1000; // hourly
const DAY_MS = 24 * 60 * 60 * 1000;

// Every check is a row, so history grows forever without a cleanup: one
// monitor on a 60s interval adds ~43,000 rows a month. Incidents are kept;
// they're few and they are the long-term record.
//
// Deletes one monitor at a time so each delete uses the (monitorId, checkedAt)
// index and stays short, instead of one big scan over the whole table.
export const deleteOldChecks = async (retentionDays: number, now: Date = new Date()) => {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const monitors = await prisma.monitor.findMany({ select: { id: true } });

  let deleted = 0;
  for (const { id } of monitors) {
    const { count } = await prisma.check.deleteMany({
      where: { monitorId: id, checkedAt: { lt: cutoff } },
    });
    deleted += count;
  }
  return deleted;
};

export const startRetentionJob = () => {
  const days = env.checkRetentionDays;
  if (days === 0) {
    console.log('🧹 Check retention disabled (CHECK_RETENTION_DAYS=0)');
    return () => {};
  }

  const run = async () => {
    try {
      const deleted = await deleteOldChecks(days);
      if (deleted > 0) console.log(`🧹 Deleted ${deleted} checks older than ${days} days`);
    } catch (err) {
      console.error('[retention] cleanup failed:', err);
    }
  };

  const timer = setInterval(() => void run(), RUN_EVERY_MS);
  void run();
  return () => clearInterval(timer);
};
