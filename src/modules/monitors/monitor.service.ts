import { MonitorType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

interface CreateMonitorInput {
  name: string;
  type: MonitorType;
  target: string;
  intervalSeconds?: number;
  createdById: string;
}

export const createMonitor = (data: CreateMonitorInput) => prisma.monitor.create({ data });

export const listMonitors = () =>
  prisma.monitor.findMany({
    orderBy: { createdAt: 'desc' },
    include: { checks: { orderBy: { checkedAt: 'desc' }, take: 1 } }, // latest status per monitor
  });

export const getMonitorWithHistory = (id: string) =>
  prisma.monitor.findUnique({
    where: { id },
    include: {
      checks: { orderBy: { checkedAt: 'desc' }, take: 100 },
      incidents: { orderBy: { startedAt: 'desc' }, take: 20 },
    },
  });

export const deleteMonitor = (id: string) => prisma.monitor.delete({ where: { id } });
