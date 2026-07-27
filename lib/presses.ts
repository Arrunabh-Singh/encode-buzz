import { SafePress } from './types';

// A "reopen-remaining" steal bumps lock_epoch to open a fresh buzz window —
// a press from a prior epoch must not keep blocking a re-buzz in the new one.
export function hasPressedInEpoch(presses: SafePress[], playerName: string, lockEpoch: number): boolean {
  return presses.some((p) => p.playerName === playerName && p.lockEpoch === lockEpoch);
}
