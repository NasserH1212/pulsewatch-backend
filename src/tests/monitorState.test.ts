import {
  DUE_SLACK_MS,
  effectiveIntervalSeconds,
  evaluateCheck,
  isDue,
  MIN_INTERVAL_SECONDS,
  MonitorHealth,
  RETRY_INTERVAL_SECONDS,
} from '../modules/checks/monitorState';

// Pure logic, no database needed.

describe('isDue', () => {
  const now = 1_000_000_000;

  it('is due when the monitor has never been checked', () => {
    expect(isDue(60, undefined, now)).toBe(true);
    expect(isDue(60, 0, now)).toBe(true);
  });

  it('respects each monitor’s own interval', () => {
    expect(isDue(60, now - 50_000, now)).toBe(false);
    expect(isDue(60, now - 60_000, now)).toBe(true);
    expect(isDue(300, now - 120_000, now)).toBe(false);
  });

  it('tolerates a timer firing a few ms early instead of slipping a whole tick', () => {
    expect(isDue(60, now - 59_999, now)).toBe(true);
    expect(isDue(60, now - (60_000 - DUE_SLACK_MS - 1), now)).toBe(false);
  });

  it('never checks more often than the minimum interval', () => {
    const fiveSecondsAgo = now - 5_000;
    expect(isDue(1, fiveSecondsAgo, now)).toBe(false);
    expect(isDue(0, fiveSecondsAgo, now)).toBe(false);
    expect(isDue(-5, fiveSecondsAgo, now)).toBe(false);
    expect(isDue(1, now - MIN_INTERVAL_SECONDS * 1000, now)).toBe(true);
  });
});

describe('effectiveIntervalSeconds', () => {
  it('uses the normal interval while the monitor is healthy', () => {
    expect(effectiveIntervalSeconds({ intervalSeconds: 300, lastStatus: 'UP', consecutiveFailures: 0 })).toBe(300);
  });

  it('re-checks sooner while a failure is waiting to be confirmed', () => {
    expect(effectiveIntervalSeconds({ intervalSeconds: 300, lastStatus: 'UP', consecutiveFailures: 1 })).toBe(
      RETRY_INTERVAL_SECONDS,
    );
    expect(effectiveIntervalSeconds({ intervalSeconds: 300, lastStatus: null, consecutiveFailures: 1 })).toBe(
      RETRY_INTERVAL_SECONDS,
    );
  });

  it('never slows down a monitor whose interval is already shorter than the retry', () => {
    expect(effectiveIntervalSeconds({ intervalSeconds: 10, lastStatus: 'UP', consecutiveFailures: 1 })).toBe(10);
  });

  it('goes back to the normal interval once the monitor is confirmed DOWN', () => {
    expect(effectiveIntervalSeconds({ intervalSeconds: 300, lastStatus: 'DOWN', consecutiveFailures: 4 })).toBe(300);
  });
});

describe('evaluateCheck', () => {
  const state = (lastStatus: MonitorHealth['lastStatus'], consecutiveFailures = 0, failureThreshold = 2) => ({
    lastStatus,
    consecutiveFailures,
    failureThreshold,
  });

  it('does not go DOWN on a single failure when the threshold is 2', () => {
    expect(evaluateCheck(state('UP'), false)).toEqual({
      lastStatus: 'UP',
      consecutiveFailures: 1,
      transition: 'NONE',
    });
  });

  it('goes DOWN once failures in a row reach the threshold', () => {
    expect(evaluateCheck(state('UP', 1), false)).toEqual({
      lastStatus: 'DOWN',
      consecutiveFailures: 2,
      transition: 'WENT_DOWN',
    });
  });

  it('goes DOWN on the first failure when the threshold is 1', () => {
    expect(evaluateCheck(state('UP', 0, 1), false).transition).toBe('WENT_DOWN');
  });

  it('a success in between resets the streak (a flapping target never alerts)', () => {
    const afterBlip = evaluateCheck(state('UP'), false);
    const afterSuccess = evaluateCheck({ ...afterBlip, failureThreshold: 2 }, true);
    expect(afterSuccess).toEqual({ lastStatus: 'UP', consecutiveFailures: 0, transition: 'NONE' });

    const nextBlip = evaluateCheck({ ...afterSuccess, failureThreshold: 2 }, false);
    expect(nextBlip.transition).toBe('NONE');
  });

  it('a brand-new monitor that keeps failing still goes DOWN and alerts', () => {
    const first = evaluateCheck(state(null), false);
    expect(first).toEqual({ lastStatus: null, consecutiveFailures: 1, transition: 'NONE' });
    expect(evaluateCheck({ ...first, failureThreshold: 2 }, false).transition).toBe('WENT_DOWN');
  });

  it('stays DOWN without new alerts while failures continue', () => {
    expect(evaluateCheck(state('DOWN', 5), false)).toEqual({
      lastStatus: 'DOWN',
      consecutiveFailures: 6,
      transition: 'NONE',
    });
  });

  it('recovers on the first success', () => {
    expect(evaluateCheck(state('DOWN', 6), true)).toEqual({
      lastStatus: 'UP',
      consecutiveFailures: 0,
      transition: 'RECOVERED',
    });
  });
});
