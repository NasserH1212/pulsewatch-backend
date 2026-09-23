import http from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';

export const createSocketServer = (server: http.Server): Server => {
  const io = new Server(server, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
  });

  return io;
};
