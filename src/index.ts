import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { startScheduler } from './modules/checks/scheduler';
import { createSocketServer } from './sockets';

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server);

startScheduler(io);

server.listen(env.port, () => {
  console.log(`🚀 PulseWatch API running on http://localhost:${env.port}`);
});
