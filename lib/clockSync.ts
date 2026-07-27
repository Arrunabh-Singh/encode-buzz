export interface ClockSample {
  offset: number;
  rtt: number;
}

// NTP-style: keep the lowest-RTT sample rather than averaging — one slow
// round trip would otherwise pollute the offset estimate for the whole sync.
export function pickBestSample(samples: ClockSample[]): ClockSample {
  return samples.reduce((best, s) => (s.rtt < best.rtt ? s : best), { offset: 0, rtt: Infinity });
}
