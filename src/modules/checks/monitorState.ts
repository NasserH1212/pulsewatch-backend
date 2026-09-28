import type { CheckStatus } from '@prisma/client';

// Pure scheduling rules, kept free of DB and network code so they can be
// unit-tested directly (see src/tests/monitorState.test.ts).

// Floor for intervalSeconds, so a bad value can't make the server hammer a target.
export const MIN_INTERVAL_SECONDS = 10;

// Timers can fire a few ms early or late. Without this slack, a check due at
// exactly 60s that the tick sees at 59.999s would slip a whole tick (5s) late.
export const DUE_SLACK_MS = 250;

export const isDue = (
  intervalSeconds: number,
  lastRunAtMs: number | undefined,
  nowMs: number,
): boolean => {
  if (!lastRunAtMs) return true; // never checked
  const intervalMs = Math.max(intervalSeconds, MIN_INTERVAL_SECONDS) * 1000;
  return nowMs - lastRunAtMs >= intervalMs - DUE_SLACK_MS;
};

export type Transition = 'WENT_DOWN' | 'RECOVERED' | 'NONE';

// A monitor with no history counts as UP, so a target that is already down on
// its very first check still opens an incident and sends an alert.
export const getTransition = (previous: CheckStatus | null, isUp: boolean): Transition => {
  const wasUp = previous !== 'DOWN';
  if (wasUp && !isUp) return 'WENT_DOWN';
  if (!wasUp && isUp) return 'RECOVERED';
  return 'NONE';
};
