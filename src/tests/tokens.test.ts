import bcrypt from 'bcryptjs';
import { hashToken, signAccessToken, signRefreshToken, verifyAccessToken } from '../lib/jwt';
import { socketAuth } from '../sockets';

// No database needed: these only exercise token signing and the socket handshake check.

describe('refresh token hashing', () => {
  const userId = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';
  const first = signRefreshToken(userId, 'session-1');
  const second = signRefreshToken(userId, 'session-2');

  it('shows why bcrypt was the wrong tool: it only sees the first 72 bytes', async () => {
    // Both tokens share their first 72 bytes (JWT header + start of the payload),
    // so a bcrypt hash of one "matches" the other.
    expect(first.slice(0, 72)).toBe(second.slice(0, 72));
    const hashOfFirst = await bcrypt.hash(first, 4);
    expect(await bcrypt.compare(second, hashOfFirst)).toBe(true);
  });

  it('gives every token its own SHA-256 hash', () => {
    expect(hashToken(first)).not.toBe(hashToken(second));
    expect(hashToken(first)).toBe(hashToken(first));
  });
});

describe('socketAuth', () => {
  const fakeSocket = (auth: Record<string, unknown>) =>
    ({ handshake: { auth }, data: {} }) as unknown as Parameters<typeof socketAuth>[0];

  const run = (auth: Record<string, unknown>) => {
    const socket = fakeSocket(auth);
    const next = jest.fn();
    socketAuth(socket, next);
    return { socket, next };
  };

  it('rejects a connection without a token', () => {
    const { next } = run({});
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects a forged token', () => {
    const { next } = run({ token: 'not.a.jwt' });
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects a refresh token used as an access token', () => {
    const { next } = run({ token: signRefreshToken('user-1', 'session-1') });
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('accepts a valid access token and remembers who connected', () => {
    const token = signAccessToken({ userId: 'user-1', role: 'VIEWER' });
    const { socket, next } = run({ token });

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toEqual({ userId: 'user-1', role: 'VIEWER' });
    expect(socket.data.tokenExpiresAt).toBe(verifyAccessToken(token).exp * 1000);
  });
});
