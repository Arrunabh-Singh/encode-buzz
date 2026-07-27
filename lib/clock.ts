import { supabaseBrowser } from './supabaseBrowser';
import { pickBestSample, ClockSample } from './clockSync';

const SYNC_SAMPLES = 3;
const RESYNC_INTERVAL_MS = 60000;

let offsetMs = 0;
let lastRttMs = 0;
let resyncTimer: ReturnType<typeof setInterval> | null = null;

// Syncs directly against server_time_ms() — the same Postgres clock
// record_press validates against — rather than proxying through a Vercel
// function's clock, which would add an unrelated hop of skew.
async function sampleOnce(): Promise<ClockSample> {
  const t0 = Date.now();
  const { data, error } = await supabaseBrowser.rpc('server_time_ms');
  const t3 = Date.now();
  if (error || typeof data !== 'number') return { offset: 0, rtt: Infinity };
  const rtt = t3 - t0;
  const offset = data - t0 - rtt / 2;
  return { offset, rtt };
}

export async function syncClock(): Promise<void> {
  const samples: ClockSample[] = [];
  for (let i = 0; i < SYNC_SAMPLES; i++) {
    samples.push(await sampleOnce());
  }
  const best = pickBestSample(samples);
  if (Number.isFinite(best.rtt)) {
    offsetMs = best.offset;
    lastRttMs = best.rtt;
  }
}

export function getServerNow(): number {
  return Date.now() + offsetMs;
}

export function getLastRttMs(): number {
  return lastRttMs;
}

export function startClockSync(): () => void {
  void syncClock();
  // Backgrounded tabs don't need a fresh offset — skip the RPC burst until
  // the tab is foregrounded again; that's the only time it's actually used.
  resyncTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void syncClock();
  }, RESYNC_INTERVAL_MS);
  return () => {
    if (resyncTimer) clearInterval(resyncTimer);
    resyncTimer = null;
  };
}
