import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { startRetentionJob } from './modules/checks/retention';
import { startScheduler } from './modules/checks/scheduler';
import { createSocketServer } from './sockets';

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server);

const stopScheduler = startScheduler(io);
const stopRetention = startRetentionJob();

server.listen(env.port, () => {
  console.log(`🚀 PulseWatch API running on http://localhost:${env.port}`);
});

// Hosts like Railway send SIGTERM before replacing the container. Stop taking
// new work, let open requests finish, then release the DB connections.
const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  stopScheduler();
  stopRetention();
  // Closes every socket and then the HTTP server itself.
  io.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // don't hang forever
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
