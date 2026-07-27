// Milliseconds remaining until a round opens, clamped so a slightly-stale
// tick (server clock offset, render delay) never displays a negative count.
export function remainingMs(opensAtServerMs: number, serverNowMs: number): number {
  return Math.max(0, opensAtServerMs - serverNowMs);
}

// Countdown display rounds UP — "1.2s left" should still read "2", not "1",
// so it never flashes a number after time's actually up.
export function msToSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}
