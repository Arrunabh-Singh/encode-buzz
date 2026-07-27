'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { RoomApi } from '@/lib/useRoom';
import { msToSeconds } from '@/lib/time';
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 'clamp(1.5rem, 4vw, 2.5rem)' }}>Room not found — check the code and try again.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', position: 'relative' }}>
      {!connected && (
        <div className="banner banner-warning" style={{ position: 'fixed', top: 24, left: 24, zIndex: 10 }} role="alert">
          Connection lost — this screen may be showing stale info…
        </div>
      )}

      <div className="card" style={{ position: 'fixed', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        {qrDataUrl && <img src={qrDataUrl} alt={`QR code to join room ${code}`} style={{ width: 96, height: 96, borderRadius: 8 }} />}
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-muted)', margin: '0 0 4px' }}>Join at</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)', letterSpacing: '0.15em', color: 'var(--color-cyan)', margin: 0 }}>{code || '------'}</p>
        </div>
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 32,
          backgroundImage: 'var(--gradient-text-spectrum)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          fontSize: 'clamp(2rem, 5vw, 4rem)',
        }}
      >
        Qurious
      </h1>

      {phase === 'countdown' && (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, lineHeight: 1,
              backgroundImage: 'var(--gradient-text-dusk)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              fontSize: 'clamp(6rem, 24vw, 20rem)',
            }}
          >
            {msToSeconds(countdownRemainingMs ?? 0)}
          </div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 16, fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>Get ready…</p>
        </div>
      )}

      {(phase === 'open' || phase === 'locked') && (
        <div style={{ textAlign: 'center', width: '100%', maxWidth: 960 }}>
          {state?.current_winner ? (
            <>
              <p style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3em', marginBottom: 16, fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>
                {state.locking_in ? 'Locking in…' : 'Buzzed in'}
              </p>
              <div
                style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, lineHeight: 1,
                  backgroundImage: 'var(--gradient-text-spectrum)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                  fontSize: 'clamp(3rem, 12vw, 10rem)',
                }}
              >
                {state.current_winner}
              </div>
            </>
          ) : phase === 'locked' ? (
            // Buzzers are NOT open right now — someone already pressed and a
            // winner just hasn't been resolved yet (the 250ms lock window,
            // or every press this round was a false start). "BUZZ!" here
            // would tell the audience to do the one thing they can't.
            <p style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: 'clamp(2rem, 6vw, 5rem)' }}>Locking in…</p>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: 'clamp(2rem, 6vw, 5rem)' }}>BUZZ!</p>
          )}
          {displayFalseStarts.length > 0 && (
            <p style={{ color: 'var(--color-berry)', fontSize: 'clamp(0.9rem, 1.5vw, 1.25rem)', marginTop: 16 }}>
              False start: {displayFalseStarts.map((p) => p.playerName).join(', ')}
            </p>
          )}
        </div>
      )}

      {phase === 'ended' && (
        <div style={{ textAlign: 'center', width: '100%', maxWidth: 760 }}>
          <div className="card card-bordered" style={{ display: 'inline-block', padding: '24px 40px', marginBottom: 24 }}>
            <p style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3em', marginBottom: 8, fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>
              {state?.last_verdict === 'correct'
                ? 'Correct'
                : state?.last_verdict == null
                  ? 'Round Aborted'
                  : 'Round Over'}
            </p>
            <div
              style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, lineHeight: 1,
                backgroundImage: 'var(--gradient-text-aurora)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                fontSize: 'clamp(2.5rem, 10vw, 8rem)',
              }}
            >
              {state?.current_winner ?? 'No winner'}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
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
          <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 32px', justifyContent: 'center' }}>
            {scoreboard.slice(0, 8).map((p) => (
              <span key={p.name} style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.9rem, 1.5vw, 1.25rem)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{p.name}</strong> <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)' }}>{p.score}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <BrandFooter style={{ position: 'fixed', bottom: 8, left: 8, padding: 0 }} />
    </div>
  );
}
