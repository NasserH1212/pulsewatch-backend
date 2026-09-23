import axios from 'axios';
import net from 'net';
// @ts-ignore — the `ping` package ships no bundled types
import ping from 'ping';
import { MonitorType } from '@prisma/client';

export interface CheckResult {
  isUp: boolean;
  responseTimeMs: number;
}

const TIMEOUT_MS = 5000;

export const runHttpCheck = async (target: string): Promise<CheckResult> => {
  const start = Date.now();
  try {
    const res = await axios.get(target, { timeout: TIMEOUT_MS, validateStatus: () => true });
    return { isUp: res.status < 400, responseTimeMs: Date.now() - start };
  } catch {
    return { isUp: false, responseTimeMs: Date.now() - start };
  }
};

// target format: "host:port", e.g. "db.internal:5432"
export const runPortCheck = (target: string): Promise<CheckResult> =>
  new Promise((resolve) => {
    const [host, portStr] = target.split(':');
    const port = Number(portStr);
    const start = Date.now();
    const socket = new net.Socket();

    const finish = (isUp: boolean) => {
      socket.destroy();
      resolve({ isUp, responseTimeMs: Date.now() - start });
    };

    socket.setTimeout(TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });

// Requires the system `ping` binary to be available (present on Linux/macOS/Windows by default).
export const runPingCheck = async (target: string): Promise<CheckResult> => {
  const start = Date.now();
  const result = await ping.promise.probe(target, { timeout: TIMEOUT_MS / 1000 });
  return { isUp: result.alive, responseTimeMs: Date.now() - start };
};

export const runCheck = (type: MonitorType, target: string): Promise<CheckResult> => {
  switch (type) {
    case 'HTTP':
      return runHttpCheck(target);
    case 'PORT':
      return runPortCheck(target);
    case 'PING':
      return runPingCheck(target);
  }
};
