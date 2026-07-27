import { describe, test, expect } from 'vitest';
import { remainingMs, msToSeconds } from './time';

describe('remainingMs', () => {
  test('returns the gap between now and the open time', () => {
    expect(remainingMs(10_000, 7_000)).toBe(3_000);
  });

  test('clamps to zero instead of going negative once the round has opened', () => {
    expect(remainingMs(10_000, 12_000)).toBe(0);
  });

  test('is exactly zero right at the open instant', () => {
    expect(remainingMs(10_000, 10_000)).toBe(0);
  });
});

describe('msToSeconds', () => {
  test('rounds up so the display never shows a stale second early', () => {
    expect(msToSeconds(2001)).toBe(3);
    expect(msToSeconds(1999)).toBe(2);
  });

  test('an exact second boundary stays at that second', () => {
    expect(msToSeconds(3000)).toBe(3);
  });

  test('zero remaining ms displays as zero', () => {
    expect(msToSeconds(0)).toBe(0);
  });
});
