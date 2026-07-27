import { RoundHistoryEntry } from './types';

export function escapeCsvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rounds: RoundHistoryEntry[]): string {
  const header = ['round', 'player', 'rank', 'clientMs', 'serverMs', 'timeSource', 'verdict', 'pointsDelta'];
  const rows: string[] = [header.join(',')];
  for (const round of rounds) {
    for (const press of round.presses) {
      const award = round.pointsAwarded.find((a) => a.player === press.playerName);
      const verdict = (press.playerName === round.winner ? round.verdict : press.falseStart ? 'false_start' : '') ?? '';
      rows.push(
        [round.round, press.playerName, press.rank, press.clientMs ?? '', press.serverMs, press.timeSource, verdict, award?.delta ?? 0]
          .map(escapeCsvField)
          .join(',')
      );
    }
  }
  return rows.join('\n');
}
