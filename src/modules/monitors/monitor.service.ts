import { prisma } from '../../lib/prisma';
import { CreateMonitorInput } from './monitor.schemas';

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
