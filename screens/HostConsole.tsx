'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { RoomApi } from '@/lib/useRoom';
import { RoomSettings, StealMode, TeamPin } from '@/lib/types';
import { buildCsv } from '@/lib/csv';
import { msToSeconds } from '@/lib/time';
import { BrandFooter } from '@/components/BrandFooter';

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
  const { code, state, hostDetail, error, countdownRemainingMs, connected, startRound, judge, abortRound, nextRound, updateSettings, defineTeams, leaveRoom } = room;

  const [showSettings, setShowSettings] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [copied, setCopied] = useState(false);
  const [displayCopied, setDisplayCopied] = useState(false);
  const [displayQrDataUrl, setDisplayQrDataUrl] = useState('');

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

  if (!state) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        <p>Setting up your room…</p>
      </div>
    );
  }

  const phase = state.phase;
  const readyCount = state.players.filter((p) => p.ready).length;
  const canStart = !state.settings.requireReadyCheck || readyCount >= Math.min(2, state.players.length || 2);
  const currentPresses = hostDetail?.presses ?? [];
  const activeSorted = [...currentPresses].filter((p) => !p.falseStart).sort((a, b) => a.elapsedMs - b.elapsedMs);
  const falseStarts = currentPresses.filter((p) => p.falseStart);
  const scoreboard = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-2xl)' }}>
          <span style={{ backgroundImage: 'var(--gradient-text-spectrum)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Qurious</span>
          <span style={{ marginLeft: 8, fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--text-muted)' }}>Host Console</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pill pill-code">{code}</span>
          <button className="btn btn-outline" onClick={copyRoomLink}>{copied ? '✓ Copied' : 'Copy link'}</button>
          <button className="btn btn-outline" onClick={() => setShowSettings(true)} disabled={phase !== 'idle'}>Settings</button>
          <button className="btn btn-outline" onClick={() => setShowTeams(true)} disabled={phase !== 'idle'}>Teams</button>
          <button className="btn btn-outline" onClick={leaveRoom}>End Session</button>
        </div>
      </header>

      {!connected && <div className="banner banner-warning" style={{ marginBottom: 16 }} role="alert">Connection lost — reconnecting…</div>}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {displayQrDataUrl && <img src={displayQrDataUrl} alt="QR code for the TV display screen" style={{ width: 64, height: 64, borderRadius: 8, flexShrink: 0 }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-muted)', margin: '0 0 4px' }}>TV / Display screen</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl}</p>
        </div>
        <button className="btn btn-outline" onClick={copyDisplayLink}>{displayCopied ? '✓ Copied' : 'Copy'}</button>
      </div>

      {state.entry_mode === 'teams' && hostDetail && hostDetail.teams.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--text-muted)' }}>
              Team codes
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-disabled)' }}>Room {code} + team code to log in</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {hostDetail.teams.map((t) => (
              <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 12px' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', letterSpacing: '0.1em', color: 'var(--color-cyan)' }}>{t.pin}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="banner banner-error" style={{ marginBottom: 16 }} role="alert">{error}</div>}

      <div role="status" aria-live="assertive" className="sr-only">
        {phase === 'locked' && !state.locking_in && `${state.current_winner} buzzed in first.`}
      </div>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-muted)', marginBottom: 12 }}>
          Round {state.round_number || '—'}
        </h2>

        {phase === 'idle' && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 12 }}>
              {state.settings.requireReadyCheck ? `${readyCount}/${state.players.length} players ready` : 'Ready check disabled'}
            </p>
            <button className="btn btn-primary" onClick={() => void startRound()} disabled={!canStart}>Start Round</button>
          </div>
        )}

        {phase === 'countdown' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 'var(--text-8xl)', fontFamily: 'var(--font-display)', fontWeight: 700, backgroundImage: 'var(--gradient-text-dusk)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              {msToSeconds(countdownRemainingMs ?? 0)}
            </div>
            <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => void abortRound()}>Cancel round</button>
          </div>
        )}

        {phase === 'open' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Buzzers open — waiting for a press…</p>
            {falseStarts.length > 0 && (
              <p style={{ color: 'var(--color-berry)', fontSize: 'var(--text-xs)', marginTop: 8 }}>False starts: {falseStarts.map((p) => p.playerName).join(', ')}</p>
            )}
            <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => void abortRound()}>Abort round</button>
          </div>
        )}

        {phase === 'locked' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-muted)', margin: '0 0 4px' }}>
                {state.locking_in ? 'Locking in…' : 'Buzzed in'}
              </p>
              <p style={{ fontSize: 'var(--text-6xl)', fontFamily: 'var(--font-display)', fontWeight: 700, backgroundImage: 'var(--gradient-text-aurora)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', margin: 0 }}>
                {state.current_winner ?? '—'}
              </p>
              {activeSorted[0] && (
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {activeSorted[0].elapsedMs}ms · {activeSorted[0].timeSource}
                </p>
              )}
            </div>
            {!state.locking_in && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                <button className="btn" style={{ background: 'var(--color-cyan)', color: '#04140d' }} onClick={() => void judge('correct')}>Correct</button>
                <button className="btn" style={{ background: 'var(--color-berry)', color: '#fff' }} onClick={() => void judge('wrong')}>
                  Wrong{state.settings.stealMode !== 'off' ? ' (steal)' : ''}
                </button>
                <button className="btn btn-secondary" onClick={() => void judge('no_answer')}>No Answer</button>
              </div>
            )}
            {activeSorted.length > 1 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-muted)', marginBottom: 8 }}>Press order</h3>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {activeSorted.map((p) => (
                    <li key={p.playerName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 8, padding: '6px 12px' }}>
                      <span>#{p.rank} {p.playerName}</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{p.elapsedMs}ms</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {phase === 'ended' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              {state.last_verdict === 'correct' && `${state.current_winner} got it right`}
              {state.last_verdict === 'wrong' && 'Marked wrong, no more stealers'}
              {state.last_verdict === 'no_answer' && 'No answer — round closed'}
              {!state.last_verdict && 'Round aborted'}
            </p>
            {state.last_points_awarded.length > 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 16 }}>
                {state.last_points_awarded.map((a) => `${a.player} ${a.delta > 0 ? '+' : ''}${a.delta}`).join(', ')}
              </p>
            )}
            <button className="btn btn-primary" onClick={() => void nextRound()}>Next Round</button>
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div className="card">
          <h2 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-muted)', marginBottom: 12 }}>
            Roster ({state.players.length})
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 256, overflowY: 'auto' }}>
            {state.players.map((p) => (
              <li key={p.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', background: 'var(--bg-elevated)', borderRadius: 8, padding: '6px 12px' }}>
                <span style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)' }}>{p.score}</span>
              </li>
            ))}
            {state.players.length === 0 && <li style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No players yet</li>}
          </ul>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-muted)', margin: 0 }}>Scoreboard</h2>
            <button className="btn-outline btn" onClick={exportResults} disabled={!hostDetail?.roundHistory.length}>Export results</button>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scoreboard.map((p, i) => (
              <li key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', background: 'var(--bg-elevated)', borderRadius: 8, padding: '6px 12px' }}>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', width: 20 }}>#{i + 1}</span>
                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{p.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)' }}>{p.score}</span>
              </li>
            ))}
            {scoreboard.length === 0 && <li style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No players yet</li>}
          </ol>
        </div>
      </section>

      {showSettings && <SettingsModal settings={state.settings} onSave={updateSettings} onClose={() => setShowSettings(false)} />}
      {showTeams && (
        <TeamsModal
          existing={hostDetail?.teams ?? []}
          onSave={defineTeams}
          onClose={() => setShowTeams(false)}
        />
      )}
      <BrandFooter style={{ marginTop: 'var(--space-8)' }} />
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

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' };
  const rangeStyle: React.CSSProperties = { width: '100%', marginTop: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Round settings" className="card" style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700 }}>Settings</h2>

        <label style={labelStyle}>
          Countdown: <span style={{ color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>{countdownSeconds}s</span>
          <input type="range" min={1} max={10} value={countdownSeconds} onChange={(e) => setCountdownSeconds(Number(e.target.value))} style={rangeStyle} />
        </label>

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
            style={{ width: '100%', marginTop: 4, borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', padding: '8px 12px', color: 'var(--text-primary)' }}
          >
            <option value="next-fastest">Next fastest (background order)</option>
            <option value="reopen-remaining">Reopen buzzers for remaining players</option>
            <option value="off">Off — wrong ends the round</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={requireReadyCheck} onChange={(e) => setRequireReadyCheck(e.target.checked)} />
          Require ready check before each round
        </label>

        <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}>Save</button>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Define teams" className="card" style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700 }}>Define teams</h2>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
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
          style={{
            width: '100%', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
            padding: '12px 14px', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', resize: 'vertical', fontFamily: 'inherit',
          }}
        />
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-disabled)' }}>{names.length} team{names.length === 1 ? '' : 's'}</p>
        <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={names.length === 0} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
