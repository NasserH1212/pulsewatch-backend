import type { CheckStatus } from '@prisma/client';

// Pure scheduling and state rules, kept free of DB and network code so they
// can be unit-tested directly (see src/tests/monitorState.test.ts).

// Floor for intervalSeconds, so a bad value can't make the server hammer a target.
export const MIN_INTERVAL_SECONDS = 10;

export const MAX_FAILURE_THRESHOLD = 10;

// After a failed check, a monitor that isn't confirmed DOWN yet is re-checked
// this soon instead of waiting its full interval. Otherwise a threshold of 3
// on a 5-minute monitor would delay the alert by 10 extra minutes.
export const RETRY_INTERVAL_SECONDS = 20;

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

export interface MonitorHealth {
  lastStatus: CheckStatus | null; // confirmed state
  consecutiveFailures: number;
  failureThreshold: number;
}

export const effectiveIntervalSeconds = (
  monitor: Pick<MonitorHealth, 'lastStatus' | 'consecutiveFailures'> & { intervalSeconds: number },
): number => {
  const confirmingFailure = monitor.consecutiveFailures > 0 && monitor.lastStatus !== 'DOWN';
  return confirmingFailure
    ? Math.min(monitor.intervalSeconds, RETRY_INTERVAL_SECONDS)
    : monitor.intervalSeconds;
};

export type Transition = 'WENT_DOWN' | 'RECOVERED' | 'NONE';

export interface Evaluation {
  lastStatus: CheckStatus | null;
  consecutiveFailures: number;
  transition: Transition;
}

// Applies one check result to a monitor's state.
// - A success resets the failure streak; it recovers a DOWN monitor at once.
// - A failure only turns the monitor DOWN when the streak reaches the
//   threshold. Below it, the confirmed state stays as it was.
// A brand-new monitor (lastStatus null) that fails enough times still goes
// DOWN, so a target that is dead from the start gets an alert too.
export const evaluateCheck = (previous: MonitorHealth, isUp: boolean): Evaluation => {
  if (isUp) {
    return {
      lastStatus: 'UP',
      consecutiveFailures: 0,
      transition: previous.lastStatus === 'DOWN' ? 'RECOVERED' : 'NONE',
    };
  }

  const consecutiveFailures = previous.consecutiveFailures + 1;
  if (previous.lastStatus === 'DOWN') {
    return { lastStatus: 'DOWN', consecutiveFailures, transition: 'NONE' };
  }
  if (consecutiveFailures >= Math.max(1, previous.failureThreshold)) {
    return { lastStatus: 'DOWN', consecutiveFailures, transition: 'WENT_DOWN' };
  }
  return { lastStatus: previous.lastStatus, consecutiveFailures, transition: 'NONE' };
};
