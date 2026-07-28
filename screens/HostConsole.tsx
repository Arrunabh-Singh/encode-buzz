'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { RoomApi } from '@/lib/useRoom';
import { RoomSettings, StealMode, TeamPin } from '@/lib/types';
import { buildCsv } from '@/lib/csv';
import { msToSeconds } from '@/lib/time';
import { BrandFooter } from '@/components/BrandFooter';
import { RoomHeader } from '@/components/RoomHeader';
import { Roster } from '@/components/Roster';
import { PressBoard } from '@/components/PressBoard';
import { Buzzer } from '@/components/Buzzer';

const COUNTDOWN_PRESETS = [1, 3, 5, 7, 10];

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function HostConsole({ room }: { room: RoomApi }) {
  const { code, state, hostDetail, error, countdownRemainingMs, connected, pingMs, startRound, judge, abortRound, nextRound, updateSettings, defineTeams, leaveRoom } = room;

  const [showSettings, setShowSettings] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [copied, setCopied] = useState(false);
  const [displayCopied, setDisplayCopied] = useState(false);
  const [displayQrDataUrl, setDisplayQrDataUrl] = useState('');
  const [judging, setJudging] = useState(false);
  const [pinsRevealed, setPinsRevealed] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  // A judge click starts an RPC round-trip; a second click before it resolves
  // must not fire again — in steal mode the round has already moved on to
  // the next stealer by the time the first verdict lands, so a double-click
  // would penalize two different players for one decision.
  const handleJudge = useCallback(
    async (verdict: Parameters<typeof judge>[0]) => {
      if (judging) return;
      setJudging(true);
      try {
        await judge(verdict);
      } finally {
        setJudging(false);
      }
    },
    [judge, judging]
  );

  const displayUrl = code ? `${globalThis.location.origin}/?room=${code}&display` : '';

  useEffect(() => {
    if (!displayUrl) return;
    QRCode.toDataURL(displayUrl, { margin: 1, width: 160, color: { dark: '#090910', light: '#FFFFFF' } })
      .then(setDisplayQrDataUrl)
      .catch(() => setDisplayQrDataUrl(''));
  }, [displayUrl]);

  const copyRoomLink = useCallback(() => {
    void navigator.clipboard.writeText(`${globalThis.location.origin}/?room=${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const copyDisplayLink = useCallback(() => {
    void navigator.clipboard.writeText(displayUrl);
    setDisplayCopied(true);
    setTimeout(() => setDisplayCopied(false), 2000);
  }, [displayUrl]);

  const exportResults = useCallback(() => {
    if (!hostDetail) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(buildCsv(hostDetail.roundHistory), `qurious-${code}-${stamp}.csv`, 'text/csv');
    downloadBlob(JSON.stringify(hostDetail.roundHistory, null, 2), `qurious-${code}-${stamp}.json`, 'application/json');
  }, [hostDetail, code]);

  // Hooks must run unconditionally, so these are computed before the
  // !state early return below rather than after it.
  const currentPresses = hostDetail?.presses ?? [];
  const activeSorted = useMemo(
    () => [...currentPresses].filter((p) => !p.falseStart).sort((a, b) => a.elapsedMs - b.elapsedMs),
    [currentPresses]
  );
  const falseStarts = useMemo(() => currentPresses.filter((p) => p.falseStart), [currentPresses]);
  // The press belonging to the player currently up for judgment — not
  // necessarily activeSorted[0], which stays pinned to the original fastest
  // presser through a whole steal chain even as current_winner moves on.
  const currentWinnerPress = state ? activeSorted.find((p) => p.playerName === state.current_winner) : undefined;
  const roundHistoryRows = useMemo(
    () =>
      (hostDetail?.roundHistory ?? [])
        .slice()
        .reverse()
        .map((h) => ({
          label: h.winner ?? 'No winner',
          sub: h.verdict ?? undefined,
        })),
    [hostDetail]
  );

  if (!state) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        <p>Setting up your room…</p>
      </div>
    );
  }

  const phase = state.phase;
  const readyCount = state.players.filter((p) => p.ready).length;
  const canStart = !state.settings.requireReadyCheck || readyCount >= Math.min(2, state.players.length || 2);

  let kicker = 'Lobby';
  let stageTitle = 'Ready to start';
  let domeLabel = '···';
  let domeSub = 'idle';
  const domeSize = 'clamp(28px,10cqw,48px)';

  if (phase === 'idle') {
    stageTitle = state.settings.requireReadyCheck ? `${readyCount}/${state.players.length} players ready` : 'Ready check disabled';
    domeSub = canStart ? 'ready to start' : 'waiting on players';
  } else if (phase === 'countdown') {
    kicker = 'Starting';
    stageTitle = 'Counting down';
    domeLabel = String(msToSeconds(countdownRemainingMs ?? 0));
    domeSub = 'starting';
  } else if (phase === 'open') {
    kicker = 'Live';
    stageTitle = 'Buzzers open — waiting for a press…';
    domeLabel = 'LIVE';
    domeSub = 'waiting for a press';
  } else if (phase === 'locked') {
    kicker = state.locking_in ? 'Locking in' : 'Buzzed in';
    stageTitle = state.locking_in ? 'Locking in…' : `${state.current_winner ?? '—'} buzzed in`;
    domeLabel = state.current_winner ?? '—';
    domeSub = state.locking_in ? 'locking in' : 'judging…';
  } else if (phase === 'ended') {
    kicker = 'Round over';
    domeLabel =
      state.last_verdict === 'correct' ? 'CORRECT' : state.last_verdict === 'wrong' ? 'WRONG' : state.last_verdict === 'no_answer' ? 'NO ANSWER' : 'ABORTED';
    domeSub = 'round closed';
    stageTitle =
      (state.last_verdict === 'correct' && `${state.current_winner} got it right`) ||
      (state.last_verdict === 'wrong' && 'Marked wrong, no more stealers') ||
      (state.last_verdict === 'no_answer' && 'No answer — round closed') ||
      'Round aborted';
  }

  return (
    <div className="room">
      <RoomHeader
        code={code}
        isHost
        pingMs={pingMs}
        connected={connected}
        copied={copied}
        onCopyLink={copyRoomLink}
        onOpenSettings={() => setShowSettings(true)}
        settingsDisabled={phase !== 'idle'}
        rightSlot={
          <>
            <button className="gbtn gbtn--ghost gbtn--sm" onClick={() => setShowTeams(true)} disabled={phase !== 'idle'}>Teams</button>
            {confirmingEnd ? (
              <>
                <span style={{ fontSize: 13, color: 'var(--color-berry)' }}>End for good?</span>
                <button className="gbtn gbtn--danger gbtn--sm" onClick={leaveRoom}>Confirm</button>
                <button className="gbtn gbtn--ghost gbtn--sm" onClick={() => setConfirmingEnd(false)}>Cancel</button>
              </>
            ) : (
              // The room survives on the server, but the host secret is only in
              // this browser's session — losing it here means no way back into
              // this console, so a stray click shouldn't be able to do that.
              <button className="gbtn gbtn--ghost gbtn--sm gbtn--leave" onClick={() => setConfirmingEnd(true)}>End Session</button>
            )}
          </>
        }
      />

      {!connected && <div className="banner banner-warning" role="alert">Connection lost — reconnecting…</div>}
      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <div role="status" aria-live="assertive" className="sr-only">
        {phase === 'locked' && !state.locking_in && `${state.current_winner} buzzed in first.`}
      </div>

      <div className="room-body">
        <Roster
          players={state.players}
          requireReadyCheck={state.settings.requireReadyCheck}
          phase={phase}
        />

        <main className="glass room-main eb-rise">
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120, background: 'linear-gradient(180deg, rgba(255,255,255,.09), transparent)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', textAlign: 'center', zIndex: 2 }}>
            <div className="micro" style={{ fontSize: 11, letterSpacing: '.3em' }}>{kicker}</div>
            <div style={{ marginTop: 7, fontSize: 'clamp(18px,2.7vh,26px)', fontWeight: 700, letterSpacing: '-.025em', color: '#fff' }}>{stageTitle}</div>
          </div>

          <Buzzer label={domeLabel} sub={domeSub} labelSize={domeSize} disabled onPointerDown={() => {}} onClick={() => {}} />

          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '10px 12px', zIndex: 2 }}>
            {phase === 'idle' && (
              <button className="gbtn gbtn--primary" onClick={() => void startRound()} disabled={!canStart}>Start Round</button>
            )}
            {phase === 'countdown' && (
              <button className="gbtn gbtn--ghost" onClick={() => void abortRound()}>Cancel round</button>
            )}
            {phase === 'open' && (
              <>
                <button className="gbtn gbtn--ghost" onClick={() => void abortRound()}>Abort round</button>
                {falseStarts.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--color-berry)' }}>False starts: {falseStarts.map((p) => p.playerName).join(', ')}</span>
                )}
              </>
            )}
            {phase === 'locked' && !state.locking_in && (
              <>
                <button className="gbtn gbtn--primary gbtn--sm" disabled={judging} onClick={() => void handleJudge('correct')}>Correct</button>
                <button className="gbtn gbtn--danger gbtn--sm" disabled={judging} onClick={() => void handleJudge('wrong')}>
                  Wrong{state.settings.stealMode !== 'off' ? ' (steal)' : ''}
                </button>
                <button className="gbtn gbtn--ghost gbtn--sm" disabled={judging} onClick={() => void handleJudge('no_answer')}>No Answer</button>
              </>
            )}
            {phase === 'locked' && currentWinnerPress && (
              <span className="mono-num" style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', width: '100%', textAlign: 'center' }}>
                {currentWinnerPress.elapsedMs}ms · {currentWinnerPress.timeSource}
              </span>
            )}
            {phase === 'ended' && (
              <>
                <button className="gbtn gbtn--primary" onClick={() => void nextRound()}>Next Round</button>
                {state.last_points_awarded.length > 0 && (
                  <span className="mono-num" style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', width: '100%', textAlign: 'center' }}>
                    {state.last_points_awarded.map((a) => `${a.player} ${a.delta > 0 ? '+' : ''}${a.delta}`).join(', ')}
                  </span>
                )}
              </>
            )}
          </div>
        </main>

        <PressBoard presses={currentPresses} history={roundHistoryRows} />
      </div>

      <details className="glass room-tools">
        <summary className="micro">Room tools</summary>
        <div className="room-tools-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {displayQrDataUrl && <img src={displayQrDataUrl} alt="QR code for the TV display screen" style={{ width: 64, height: 64, borderRadius: 8, flexShrink: 0 }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="micro" style={{ margin: '0 0 4px' }}>TV / Display screen</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl}</p>
            </div>
            <button className="gbtn gbtn--ghost gbtn--sm" onClick={copyDisplayLink}>{displayCopied ? '✓ Copied' : 'Copy'}</button>
          </div>

          {state.entry_mode === 'teams' && hostDetail && hostDetail.teams.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="micro">Team codes</span>
                <button className="gbtn gbtn--ghost gbtn--sm" onClick={() => setPinsRevealed((v) => !v)}>{pinsRevealed ? 'Hide' : 'Reveal'}</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {hostDetail.teams.map((t) => (
                  <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: '8px 12px' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span className="mono-num" style={{ fontSize: 16, letterSpacing: '.1em', color: 'var(--color-cyan)' }}>{pinsRevealed ? t.pin : '••••'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span className="micro">Results</span>
            <button className="gbtn gbtn--ghost gbtn--sm" onClick={exportResults} disabled={!hostDetail?.roundHistory.length}>Export results</button>
          </div>
        </div>
      </details>

      {showSettings && <SettingsModal settings={state.settings} onSave={updateSettings} onClose={() => setShowSettings(false)} />}
      {showTeams && (
        <TeamsModal
          existing={hostDetail?.teams ?? []}
          onSave={defineTeams}
          onClose={() => setShowTeams(false)}
        />
      )}
      <BrandFooter style={{ marginTop: 4 }} />
    </div>
  );
}

function SettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: RoomSettings;
  onSave: (patch: Partial<RoomSettings>) => void;
  onClose: () => void;
}) {
  const [countdownSeconds, setCountdownSeconds] = useState(settings.countdownSeconds);
  const [roundTimeoutSeconds, setRoundTimeoutSeconds] = useState(settings.roundTimeoutSeconds);
  const [pointsPerCorrect, setPointsPerCorrect] = useState(settings.pointsPerCorrect);
  const [pointsPenaltyWrong, setPointsPenaltyWrong] = useState(settings.pointsPenaltyWrong);
  const [stealMode, setStealMode] = useState<StealMode>(settings.stealMode);
  const [requireReadyCheck, setRequireReadyCheck] = useState(settings.requireReadyCheck);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('input, select, button, [tabindex]')?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    onSave({ countdownSeconds, roundTimeoutSeconds, pointsPerCorrect, pointsPenaltyWrong, stealMode, requireReadyCheck });
    onClose();
  };

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--text-secondary)' };
  const rangeStyle: React.CSSProperties = { width: '100%', marginTop: 6 };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,4,10,.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Round settings"
        className="glass-strong shimmer-sweep eb-rise"
        style={{ width: '100%', maxWidth: 440, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>Round settings</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,.45)' }}>Applies to every player in this room.</p>
        </div>

        <div>
          <div className="micro" style={{ marginBottom: 12 }}>Countdown</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {COUNTDOWN_PRESETS.map((s) => (
              <button
                key={s}
                onClick={() => setCountdownSeconds(s)}
                className="gbtn gbtn--sm"
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  background: s === countdownSeconds ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.05)',
                  borderColor: s === countdownSeconds ? 'rgba(255,255,255,.32)' : 'rgba(255,255,255,.1)',
                  color: s === countdownSeconds ? '#fff' : 'rgba(255,255,255,.55)',
                }}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        <label style={labelStyle}>
          Round timeout (0 = no limit): <span style={{ color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>{roundTimeoutSeconds}s</span>
          <input type="range" min={0} max={120} step={5} value={roundTimeoutSeconds} onChange={(e) => setRoundTimeoutSeconds(Number(e.target.value))} style={rangeStyle} />
        </label>

        <label style={labelStyle}>
          Points for correct: <span style={{ color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>{pointsPerCorrect}</span>
          <input type="range" min={0} max={50} value={pointsPerCorrect} onChange={(e) => setPointsPerCorrect(Number(e.target.value))} style={rangeStyle} />
        </label>

        <label style={labelStyle}>
          Penalty for wrong: <span style={{ color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>{pointsPenaltyWrong}</span>
          <input type="range" min={0} max={20} value={pointsPenaltyWrong} onChange={(e) => setPointsPenaltyWrong(Number(e.target.value))} style={rangeStyle} />
        </label>

        <label style={labelStyle}>
          Steal mode
          <select
            value={stealMode}
            onChange={(e) => setStealMode(e.target.value as StealMode)}
            className="ginput"
            style={{ width: '100%', marginTop: 6, fontSize: 14, padding: '10px 12px' }}
          >
            <option value="next-fastest">Next fastest (background order)</option>
            <option value="reopen-remaining">Reopen buzzers for remaining players</option>
            <option value="off">Off — wrong ends the round</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={requireReadyCheck} onChange={(e) => setRequireReadyCheck(e.target.checked)} />
          Require ready check before each round
        </label>

        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <button className="gbtn gbtn--ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="gbtn gbtn--primary" style={{ flex: 1 }} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

function TeamsModal({
  existing,
  onSave,
  onClose,
}: {
  existing: TeamPin[];
  onSave: (names: string[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(existing.map((t) => t.name).join('\n'));
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('textarea, button')?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const names = text.split('\n').map((n) => n.trim()).filter(Boolean);

  const save = () => {
    if (names.length === 0) return;
    onSave(names);
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,4,10,.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Define teams"
        className="glass-strong shimmer-sweep eb-rise"
        style={{ width: '100%', maxWidth: 440, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>Define teams</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,.45)' }}>
          One team name per line. Each gets a random 4-digit code to log in with — only these teams can join.
          {existing.length > 0 && ' Saving replaces the current team list and resets everyone’s scores.'}
        </p>
        <label htmlFor="team-names" className="sr-only">Team names</label>
        <textarea
          id="team-names"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'Team Alpha\nTeam Bravo\nTeam Charlie'}
          className="ginput"
          style={{ width: '100%', fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.32)' }}>{names.length} team{names.length === 1 ? '' : 's'}</p>
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <button className="gbtn gbtn--ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="gbtn gbtn--primary" style={{ flex: 1 }} disabled={names.length === 0} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
