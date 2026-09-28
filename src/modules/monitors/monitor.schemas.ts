import net from 'net';
import { z } from 'zod';
import { MAX_FAILURE_THRESHOLD, MIN_INTERVAL_SECONDS, STATS_PERIODS } from '../checks/monitorState';

const MAX_INTERVAL_SECONDS = 24 * 60 * 60;

// RFC 1123 hostname: dot-separated labels of letters, digits and hyphens.
const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i;

// "10.0.0.1" and "db.internal" are fine. All-digit strings like "999.1.1.1"
// would also pass the hostname pattern, so those must be real IPv4 addresses.
// IPv6 isn't supported yet: the PORT check splits "host:port" on ':'.
export const isHost = (value: string) =>
  /^[\d.]+$/.test(value) ? net.isIPv4(value) : HOSTNAME.test(value);

export const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
};

export const isHostPort = (value: string) => {
  const colon = value.lastIndexOf(':');
  if (colon <= 0) return false;

  const host = value.slice(0, colon);
  const port = value.slice(colon + 1);
  return isHost(host) && /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;
};

const target = (isValid: (value: string) => boolean, message: string) =>
  z.string('Target is required').trim().max(2048, 'Target is too long').refine(isValid, { error: message });

// One place for the type -> target-format rule, so create and update both
// check the same thing the same way.
export const targetRules = {
  HTTP: { isValid: isHttpUrl, message: 'HTTP target must be a full URL, e.g. https://example.com/health' },
  PORT: { isValid: isHostPort, message: 'PORT target must be host:port, e.g. db.example.com:5432' },
  PING: { isValid: isHost, message: 'PING target must be a hostname or IPv4 address' },
} as const;

const commonFields = {
  name: z.string('Name is required').trim().min(1, 'Name is required').max(100, 'Name is too long'),
  intervalSeconds: z
    .int('intervalSeconds must be a whole number of seconds')
    .min(MIN_INTERVAL_SECONDS, `intervalSeconds must be at least ${MIN_INTERVAL_SECONDS}`)
    .max(MAX_INTERVAL_SECONDS, `intervalSeconds must be at most ${MAX_INTERVAL_SECONDS} (24h)`)
    .optional(),
  failureThreshold: z
    .int('failureThreshold must be a whole number')
    .min(1, 'failureThreshold must be at least 1')
    .max(MAX_FAILURE_THRESHOLD, `failureThreshold must be at most ${MAX_FAILURE_THRESHOLD}`)
    .optional(),
};

// The target format depends on the type, so each type gets its own shape.
export const createMonitorSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HTTP'),
    target: target(targetRules.HTTP.isValid, targetRules.HTTP.message),
    ...commonFields,
  }),
  z.object({
    type: z.literal('PORT'),
    target: target(targetRules.PORT.isValid, targetRules.PORT.message),
    ...commonFields,
  }),
  z.object({
    type: z.literal('PING'),
    target: target(targetRules.PING.isValid, targetRules.PING.message),
    ...commonFields,
  }),
]);

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;

export const statsQuerySchema = z.object({
  period: z.enum(STATS_PERIODS).default('24h'),
});

export type StatsQuery = z.infer<typeof statsQuerySchema>;

// Partial update: every field optional, but at least one must be present.
// The target's format still depends on the monitor's type, which isn't part
// of this payload (the type itself can't change) — monitor.service.ts checks
// it against targetRules once it has loaded the monitor.
export const updateMonitorSchema = z
  .object({
    name: commonFields.name.optional(),
    target: z.string('Target is required').trim().max(2048, 'Target is too long').optional(),
    intervalSeconds: commonFields.intervalSeconds,
    failureThreshold: commonFields.failureThreshold,
    paused: z.boolean('paused must be a boolean').optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'At least one field must be provided',
  });

export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
