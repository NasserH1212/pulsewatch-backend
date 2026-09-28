import http from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyAccessToken } from '../lib/jwt';

// Clients must send their access token when connecting:
//   io(API_URL, { auth: { token: accessToken } })
// Without it the connection is refused, so monitor data isn't public.
export const socketAuth = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || !token) return next(new Error('Unauthorized'));

  try {
    const payload = verifyAccessToken(token);
    socket.data.user = { userId: payload.userId, role: payload.role };
    socket.data.tokenExpiresAt = payload.exp * 1000;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
};

export const createSocketServer = (server: http.Server): Server => {
  const io = new Server(server, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    // A socket can't outlive its token: disconnect when the access token
    // expires, and the client reconnects with a fresh one.
    const msLeft = socket.data.tokenExpiresAt - Date.now();
    const expiryTimer = setTimeout(() => socket.disconnect(true), msLeft);

    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
      clearTimeout(expiryTimer);
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};
