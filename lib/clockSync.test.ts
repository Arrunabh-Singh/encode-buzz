import { describe, test, expect } from 'vitest';
import { pickBestSample } from './clockSync';

describe('pickBestSample', () => {
  test('picks the sample with the lowest RTT, not an average', () => {
    const best = pickBestSample([
      { offset: 100, rtt: 80 },
      { offset: 5, rtt: 12 },
      { offset: 50, rtt: 40 },
    ]);
    expect(best).toEqual({ offset: 5, rtt: 12 });
  });

  test('a single slow sample does not get averaged in — the fast one wins outright', () => {
    const best = pickBestSample([
      { offset: 9999, rtt: 500 },
      { offset: 3, rtt: 8 },
    ]);
    expect(best.offset).toBe(3);
  });

  test('an empty sample set falls back to a zero offset with infinite rtt', () => {
    expect(pickBestSample([])).toEqual({ offset: 0, rtt: Infinity });
  });

  test('a single sample is returned as-is', () => {
    expect(pickBestSample([{ offset: 42, rtt: 20 }])).toEqual({ offset: 42, rtt: 20 });
  });
});
