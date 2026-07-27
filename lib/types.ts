export type Role = 'host' | 'player' | 'display';
export type TimeSource = 'client' | 'server-fallback';
export type Verdict = 'correct' | 'wrong' | 'no_answer';
export type StealMode = 'next-fastest' | 'reopen-remaining' | 'off';
export type RoundPhase = 'idle' | 'countdown' | 'open' | 'locked' | 'ended';
export type EntryMode = 'open' | 'teams';

export interface RoomSettings {
  countdownSeconds: number;
  roundTimeoutSeconds: number;
  pointsPerCorrect: number;
  pointsPenaltyWrong: number;
  stealMode: StealMode;
  requireReadyCheck: boolean;
}

export interface SafePress {
  playerName: string;
  elapsedMs: number;
  rank: number;
  falseStart: boolean;
}

export interface PublicPlayer {
  name: string;
  score: number;
  connected: boolean;
  ready: boolean;
}

export interface RoomState {
  code: string;
  phase: RoundPhase;
  round_number: number;
  settings: RoomSettings;
  opens_at: string | null;
  round_deadline_at: string | null;
  lock_window_closes_at: string | null;
  entry_mode: EntryMode;
  locking_in: boolean;
  current_winner: string | null;
  winners: string[];
  last_verdict: Verdict | null;
  last_points_awarded: { player: string; delta: number }[];
  presses: SafePress[];
  players: PublicPlayer[];
}

export interface HostPress {
  playerName: string;
  elapsedMs: number;
  clientMs: number | null;
  serverMs: number;
  timeSource: TimeSource;
  rank: number;
  falseStart: boolean;
}

export interface RoundHistoryEntry {
  round: number;
  winner: string | null;
  verdict: Verdict | null;
  presses: HostPress[];
  pointsAwarded: { player: string; delta: number }[];
}

export interface HostDetail {
  presses: HostPress[];
  roundHistory: RoundHistoryEntry[];
  teams: TeamPin[];
}

export interface TeamPin {
  name: string;
  pin: string;
}
