import { describe, test, expect } from 'vitest';
import { escapeCsvField, buildCsv } from './csv';
import { RoundHistoryEntry } from './types';

describe('escapeCsvField', () => {
  test('leaves plain values untouched', () => {
    expect(escapeCsvField('Player1')).toBe('Player1');
    expect(escapeCsvField(42)).toBe('42');
  });

  test('quotes and escapes a field containing a comma', () => {
    expect(escapeCsvField('Smith, John')).toBe('"Smith, John"');
  });

  test('quotes and doubles internal quotes', () => {
    expect(escapeCsvField('Say "hi"')).toBe('"Say ""hi"""');
  });

  test('quotes a field containing a newline', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('buildCsv', () => {
  const baseRound: RoundHistoryEntry = {
    round: 1,
    winner: 'Player1',
    verdict: 'correct',
    presses: [
      {
        playerName: 'Player1',
        elapsedMs: 250,
        clientMs: 250,
        serverMs: 260,
        timeSource: 'client',
        rank: 1,
        falseStart: false,
      },
      {
        playerName: 'Player2',
        elapsedMs: 400,
        clientMs: null,
        serverMs: 400,
        timeSource: 'server-fallback',
        rank: 2,
        falseStart: false,
      },
    ],
    pointsAwarded: [{ player: 'Player1', delta: 10 }],
  };

  test('includes a header row and one row per press', () => {
    const csv = buildCsv([baseRound]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('round,player,rank,clientMs,serverMs,timeSource,verdict,pointsDelta');
    expect(lines).toHaveLength(3);
  });

  test('maps the verdict only onto the winner’s row, and points only where awarded', () => {
    const csv = buildCsv([baseRound]);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('1,Player1,1,250,260,client,correct,10');
    expect(lines[2]).toBe('1,Player2,2,,400,server-fallback,,0');
  });

  test('marks a false start with its own verdict label', () => {
    // A false-starter is locked out and can never be the round's winner —
    // give the round a different (or no) winner to match real data shape.
    const round: RoundHistoryEntry = {
      ...baseRound,
      winner: null,
      presses: [{ ...baseRound.presses[0], falseStart: true, elapsedMs: -50, clientMs: -50 }],
    };
    const csv = buildCsv([round]);
    const [, row] = csv.split('\n');
    expect(row).toContain('false_start');
  });

  test('escapes a player name containing a comma inside a real CSV row', () => {
    const round: RoundHistoryEntry = {
      ...baseRound,
      presses: [{ ...baseRound.presses[0], playerName: 'Smith, John' }],
      pointsAwarded: [{ player: 'Smith, John', delta: 10 }],
    };
    const csv = buildCsv([round]);
    const [, row] = csv.split('\n');
    expect(row.startsWith('1,"Smith, John",1,')).toBe(true);
  });
});
