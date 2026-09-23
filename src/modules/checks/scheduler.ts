import cron from 'node-cron';
import { Server } from 'socket.io';
import { prisma } from '../../lib/prisma';
import { runCheck } from './check.service';
import { sendTelegramAlert } from '../alerts/telegram.service';

// Runs every 30s and checks every monitor regardless of its own intervalSeconds —
// simple to reason about for a starter project. A production version would group
// monitors by interval instead of checking everything on one fixed tick.
export const startScheduler = (io: Server) => {
  cron.schedule('*/30 * * * * *', async () => {
    const monitors = await prisma.monitor.findMany();

    for (const monitor of monitors) {
      const lastCheck = await prisma.check.findFirst({
        where: { monitorId: monitor.id },
        orderBy: { checkedAt: 'desc' },
      });
      const wasUp = !lastCheck || lastCheck.status === 'UP';

      const { isUp, responseTimeMs } = await runCheck(monitor.type, monitor.target);

      await prisma.check.create({
        data: { monitorId: monitor.id, status: isUp ? 'UP' : 'DOWN', responseTimeMs },
      });

      io.emit('check:update', {
        monitorId: monitor.id,
        status: isUp ? 'UP' : 'DOWN',
        responseTimeMs,
        checkedAt: new Date().toISOString(),
      });

      if (wasUp && !isUp) {
        await prisma.incident.create({
          data: { monitorId: monitor.id, cause: 'Check failed' },
        });
        await sendTelegramAlert(`🔴 ${monitor.name} is DOWN — ${monitor.target}`);
      }

      if (!wasUp && isUp) {
        const openIncident = await prisma.incident.findFirst({
          where: { monitorId: monitor.id, resolvedAt: null },
        });
        if (openIncident) {
          await prisma.incident.update({
            where: { id: openIncident.id },
            data: { resolvedAt: new Date() },
          });
        }
        await sendTelegramAlert(`✅ ${monitor.name} is back UP — ${monitor.target}`);
      }
    }
  });

  console.log('⏱  Scheduler started — checking monitors every 30s');
};
