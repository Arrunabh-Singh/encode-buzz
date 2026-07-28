'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { RoomApi } from '@/lib/useRoom';
import { msToSeconds } from '@/lib/time';
import { Buzzer } from '@/components/Buzzer';
import { BrandFooter } from '@/components/BrandFooter';

export function DisplayScreen({ room }: { room: RoomApi }) {
  const { code, state, stateLoaded, countdownRemainingMs, connected } = room;
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!code) return;
    const link = `${globalThis.location.origin}/?room=${code}`;
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#090910', light: '#FFFFFF' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [code]);

  const phase = state?.phase ?? 'idle';
  const activePresses = useMemo(
    () => [...(state?.presses ?? [])].filter((p) => !p.falseStart).sort((a, b) => a.elapsedMs - b.elapsedMs),
    [state?.presses]
  );
  const displayFalseStarts = useMemo(() => (state?.presses ?? []).filter((p) => p.falseStart), [state?.presses]);
  const scoreboard = useMemo(() => [...(state?.players ?? [])].sort((a, b) => b.score - a.score), [state?.players]);

  // A fetch that came back with no room is a dead code, not an empty room —
  // conflating the two left this screen stuck on "Waiting for players to
  // join…" forever for a typo'd or stale room code.
  if (code && stateLoaded && !state) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 'clamp(1.5rem, 4vw, 2.5rem)' }}>Room not found — check the code and try again.</p>
      </div>
    );
  }

  let stageLabel = 'BUZZ!';
  let stageSub = '';
  let stageSize = 'clamp(36px,10cqw,90px)';
  let stageKicker = '';
  const winnerName = state?.current_winner;

  if (phase === 'countdown') {
    stageLabel = String(msToSeconds(countdownRemainingMs ?? 0));
    stageSub = 'get ready';
    stageSize = 'clamp(64px,20cqw,220px)';
  } else if (phase === 'open' || phase === 'locked') {
    if (winnerName) {
      stageKicker = state?.locking_in ? 'Locking in…' : 'Buzzed in';
      stageLabel = winnerName;
      stageSize = 'clamp(40px,14cqw,140px)';
      stageSub = state?.locking_in ? 'locking in' : 'buzzed in';
    } else if (phase === 'locked') {
      // Buzzers are NOT open right now — someone already pressed and a
      // winner just hasn't been resolved yet (the 250ms lock window,
      // or every press this round was a false start). "BUZZ!" here
      // would tell the audience to do the one thing they can't.
      stageLabel = '···';
      stageSub = 'locking in';
      stageSize = 'clamp(48px,16cqw,140px)';
    } else {
      stageLabel = 'BUZZ!';
      stageSub = 'buzzers are open';
    }
  } else if (phase === 'ended') {
    stageKicker =
      state?.last_verdict === 'correct' ? 'Correct' : state?.last_verdict == null ? 'Round Aborted' : 'Round Over';
    stageLabel = state?.current_winner ?? 'No winner';
    stageSize = 'clamp(36px,12cqw,120px)';
  }

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', height: '100dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', gap: 28 }}>
      {!connected && (
        <div className="banner banner-warning" style={{ position: 'fixed', top: 24, left: 24, zIndex: 10 }} role="alert">
          Connection lost — this screen may be showing stale info…
        </div>
      )}

      <div className="glass eb-rise" style={{ position: 'fixed', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}>
        {qrDataUrl && <img src={qrDataUrl} alt={`QR code to join room ${code}`} style={{ width: 96, height: 96, borderRadius: 8 }} />}
        <div style={{ textAlign: 'left' }}>
          <p className="micro" style={{ margin: '0 0 4px' }}>Join at</p>
          <p className="mono-num" style={{ fontSize: 30, letterSpacing: '.15em', color: 'var(--color-cyan)', margin: 0 }}>{code || '------'}</p>
        </div>
      </div>

      <h1
        style={{
          fontWeight: 800, letterSpacing: '-.03em', margin: 0,
          backgroundImage: 'var(--gradient-text-spectrum)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
        }}
      >
        Qurious
      </h1>

      {(phase === 'countdown' || phase === 'open' || phase === 'locked') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {stageKicker && (
            <p style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.3em', margin: 0, fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>{stageKicker}</p>
          )}
          <Buzzer size="xl" label={stageLabel} sub={stageSub} labelSize={stageSize} disabled onPointerDown={() => {}} onClick={() => {}} />
          {displayFalseStarts.length > 0 && (
            <p style={{ color: 'var(--color-berry)', fontSize: 'clamp(0.9rem, 1.5vw, 1.25rem)', margin: 0 }}>
              False start: {displayFalseStarts.map((p) => p.playerName).join(', ')}
            </p>
          )}
        </div>
      )}

      {phase === 'ended' && (
        <div style={{ textAlign: 'center', width: '100%', maxWidth: 760 }}>
          <div className="glass eb-rise" style={{ display: 'inline-block', padding: '28px 44px', marginBottom: 24 }}>
            <p style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.3em', marginBottom: 8, fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>{stageKicker}</p>
            <div
              style={{
                fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1,
                backgroundImage: 'var(--gradient-text-aurora)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                fontSize: 'clamp(2.5rem, 10vw, 8rem)',
              }}
            >
              {stageLabel}
            </div>
          </div>
          {activePresses.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, margin: '0 auto' }}>
              {activePresses.slice(1, 6).map((p) => (
                <p key={p.playerName} style={{ color: 'var(--text-secondary)', fontWeight: 600, margin: 0, fontSize: 'clamp(1rem, 2.5vw, 1.75rem)' }}>
                  #{p.rank} — {p.playerName}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'idle' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
            {(state?.players ?? []).map((p) => (
              <span key={p.name} className="badge" style={{ fontSize: 'clamp(0.9rem, 1.5vw, 1.25rem)', padding: '6px 16px' }}>
                {p.name}
                {state?.settings.requireReadyCheck && <span style={{ marginLeft: 8, color: 'var(--color-cyan)' }}>{p.ready ? '●' : '○'}</span>}
              </span>
            ))}
            {stateLoaded && (state?.players.length ?? 0) === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(1.25rem, 2.5vw, 2rem)' }}>Waiting for players to join…</p>
            )}
          </div>
        </div>
      )}

      {/* Hidden during open/locked so the audience can't watch scores update
          mid-round and read who's about to win before the round resolves. */}
      {scoreboard.length > 0 && (phase === 'idle' || phase === 'ended') && (
        <div style={{ position: 'fixed', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'center' }}>
          <div className="glass eb-rise" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 32px', justifyContent: 'center', padding: '14px 24px' }}>
            {scoreboard.slice(0, 8).map((p) => (
              <span key={p.name} style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.9rem, 1.5vw, 1.25rem)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{p.name}</strong> <span className="mono-num" style={{ color: 'var(--color-cyan)' }}>{p.score}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <BrandFooter style={{ position: 'fixed', bottom: 8, left: 8, padding: 0 }} />
    </div>
  );
}
