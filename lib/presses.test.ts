import { describe, test, expect } from 'vitest';
import { hasPressedInEpoch } from './presses';
import { SafePress } from './types';

const press = (overrides: Partial<SafePress>): SafePress => ({
  playerName: 'Alice',
  elapsedMs: 100,
  rank: 1,
  falseStart: false,
  lockEpoch: 0,
  ...overrides,
});

describe('hasPressedInEpoch', () => {
  test('true when the player pressed in the current epoch', () => {
    expect(hasPressedInEpoch([press({ lockEpoch: 1 })], 'Alice', 1)).toBe(true);
  });

  test('false for a press left over from a prior epoch — reopen-remaining must not stay blocked', () => {
    expect(hasPressedInEpoch([press({ lockEpoch: 0 })], 'Alice', 1)).toBe(false);
  });

  test('false for a different player entirely', () => {
    expect(hasPressedInEpoch([press({ playerName: 'Bob', lockEpoch: 1 })], 'Alice', 1)).toBe(false);
  });

  test('false with no presses at all', () => {
    expect(hasPressedInEpoch([], 'Alice', 0)).toBe(false);
  });
});
