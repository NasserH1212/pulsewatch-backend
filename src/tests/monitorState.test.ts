import { DUE_SLACK_MS, getTransition, isDue, MIN_INTERVAL_SECONDS } from '../modules/checks/monitorState';

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

describe('getTransition', () => {
  it('opens an incident when an UP monitor goes down', () => {
    expect(getTransition('UP', false)).toBe('WENT_DOWN');
  });

  it('treats a brand-new monitor as UP, so a first failed check alerts', () => {
    expect(getTransition(null, false)).toBe('WENT_DOWN');
    expect(getTransition(null, true)).toBe('NONE');
  });

  it('resolves when a DOWN monitor comes back', () => {
    expect(getTransition('DOWN', true)).toBe('RECOVERED');
  });

  it('does nothing while the status stays the same (no repeated alerts)', () => {
    expect(getTransition('UP', true)).toBe('NONE');
    expect(getTransition('DOWN', false)).toBe('NONE');
  });
});
