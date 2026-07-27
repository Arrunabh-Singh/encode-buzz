'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RoomApi } from '@/lib/useRoom';
import { msToSeconds } from '@/lib/time';
import { hasPressedInEpoch } from '@/lib/presses';
import { Buzzer } from '@/components/Buzzer';

function useBuzzerSound() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  useEffect(() => {
    return () => {
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, []);

  const tone = useCallback(
    (freqs: number[], duration: number, type: OscillatorType = 'sine') => {
      try {
        const ctx = ensureContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, ctx.currentTime + i * (duration / freqs.length)));
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      } catch {
        // Web Audio unavailable — buzzer still works, just silently
      }
    },
    [ensureContext]
  );

  return {
    unlock: ensureContext,
    playBuzz: () => tone([150, 300, 200], 0.3, 'sawtooth'),
    playWin: () => tone([523, 659, 784], 0.4, 'sine'),
    playCountdownTick: () => tone([880], 0.15, 'sine'),
  };
}

export function PlayerScreen({ room }: { room: RoomApi }) {
  const { code, myName, myPlayer, state, error, falseStart, countdownRemainingMs, connected, changeName, setReady, press, leaveRoom } = room;

  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(myName);
  const [copied, setCopied] = useState(false);
  const { unlock, playBuzz, playWin, playCountdownTick } = useBuzzerSound();
  const lastTickSecond = useRef<number | null>(null);
  const wonRef = useRef(false);
  const buzzButtonRef = useRef<HTMLButtonElement>(null);
  const pointerHandledRef = useRef(false);
  const pointerResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phase = state?.phase ?? 'idle';
  const hasPressed = state ? hasPressedInEpoch(state.presses, myName, state.lock_epoch) : false;
  const isMyTurn = state?.current_winner === myName;
  const iPressed = state?.presses.some((p) => p.playerName === myName && !p.falseStart) ?? false;
  const scoreboard = useMemo(() => (state ? [...state.players].sort((a, b) => b.score - a.score) : []), [state]);

  useEffect(() => {
    if (countdownRemainingMs === null) {
      lastTickSecond.current = null;
      return;
    }
    const second = msToSeconds(countdownRemainingMs);
    if (second > 0 && second !== lastTickSecond.current) {
      lastTickSecond.current = second;
      playCountdownTick();
    }
  }, [countdownRemainingMs, playCountdownTick]);

  useEffect(() => {
    if (phase === 'ended' && state?.last_verdict === 'correct' && state.current_winner === myName && !wonRef.current) {
      wonRef.current = true;
      playWin();
    }
    if (phase !== 'ended') wonRef.current = false;
  }, [phase, state?.last_verdict, state?.current_winner, myName, playWin]);

  useEffect(() => {
    if (hasPressed) playBuzz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPressed]);

  const copyRoomLink = useCallback(() => {
    const link = `${globalThis.location.origin}/?room=${code}`;
    void navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handlePress = useCallback(() => {
    unlock();
    void press();
  }, [press, unlock]);

  const saveName = () => {
    if (!tempName.trim()) return;
    void changeName(tempName.trim());
    setEditingName(false);
  };

  let label = 'BUZZ';
  let sub = 'tap to buzz';
  let labelSize = 'clamp(32px,12cqw,56px)';
  let disabled = false;

  if (phase === 'countdown') {
    label = String(msToSeconds(countdownRemainingMs ?? 0));
    sub = 'hands off';
    labelSize = 'clamp(64px,26cqw,124px)';
    disabled = true;
  } else if (phase === 'open') {
    if (hasPressed) {
      label = 'IN';
      sub = 'buzzed';
      labelSize = 'clamp(30px,12cqw,54px)';
      disabled = true;
    }
  } else if (phase === 'locked') {
    disabled = true;
    labelSize = 'clamp(24px,9cqw,42px)';
    if (state?.locking_in) {
      label = '···';
      sub = 'locking in';
    } else if (isMyTurn) {
      label = 'IN';
      sub = 'judging…';
    } else {
      label = state?.current_winner ?? '—';
      sub = 'buzzed in';
    }
  } else if (phase === 'ended') {
    disabled = true;
    labelSize = 'clamp(28px,11cqw,52px)';
    if (state?.last_verdict === 'correct' && state.current_winner === myName) {
      label = 'FIRST';
      sub = 'correct';
    } else if (state?.current_winner) {
      label = state.current_winner;
      sub = 'took it';
    } else if (iPressed) {
      // Nobody ended up correct, but this player did buzz in — "MISSED" would
      // be a flat lie to someone who pressed and got judged wrong.
      label = 'WRONG';
      sub = 'no one got it';
    } else {
      label = 'MISSED';
      sub = 'no presses';
    }
  } else {
    // idle
    labelSize = 'clamp(26px,10cqw,46px)';
    if (state?.settings.requireReadyCheck) {
      if (myPlayer?.ready) {
        label = 'ARMED';
        sub = 'waiting for host';
        disabled = true;
      } else {
        label = 'READY';
        sub = 'tap to arm';
      }
    } else {
      label = 'WAITING';
      sub = 'host controls the round';
      disabled = true;
    }
  }

  if (!connected) {
    label = '…';
    sub = 'reconnecting';
    disabled = true;
  }

  const onBigButton = () => {
    if (!connected) return;
    if (phase === 'idle' && state?.settings.requireReadyCheck && !myPlayer?.ready) {
      unlock();
      setReady();
      return;
    }
    if (phase === 'open' && !hasPressed) handlePress();
  };

  const handleButtonPointerDown = () => {
    pointerHandledRef.current = true;
    // Fallback: if click never fires (gesture cancelled, touch-scroll
    // interrupt, browser quirk), this flag must not stay stuck true forever
    // and silently eat the next real press.
    if (pointerResetTimer.current) clearTimeout(pointerResetTimer.current);
    pointerResetTimer.current = setTimeout(() => {
      pointerHandledRef.current = false;
    }, 500);
    onBigButton();
  };
  const handleButtonClick = () => {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      if (pointerResetTimer.current) clearTimeout(pointerResetTimer.current);
      return;
    }
    onBigButton();
  };

  // onBigButton closes over phase/connected/hasPressed/etc., which change on
  // every state refresh — routing the call through a ref (rather than
  // listing onBigButton in the deps) keeps the listener mounted once instead
  // of tearing down and re-adding it on every render.
  const onBigButtonRef = useRef(onBigButton);
  onBigButtonRef.current = onBigButton;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const active = document.activeElement;
      const isTypingTarget = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (isTypingTarget || active === buzzButtonRef.current) return;
      e.preventDefault();
      onBigButtonRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', gap: 'clamp(14px,2.6vh,26px)' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-2xl)', letterSpacing: '-.035em',
          backgroundImage: 'var(--gradient-text-spectrum)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          margin: 0,
        }}
      >
        Qurious
      </h1>

      <div className="pill" style={{ gap: 8 }}>
        <span className="pill pill-code">{code}</span>
        <button className="btn btn-outline" onClick={copyRoomLink}>{copied ? '✓ Copied' : 'Copy link'}</button>
        <button className="btn btn-outline" onClick={leaveRoom}>Leave</button>
      </div>

      <div aria-live="polite">
        {editingName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="player-name" className="sr-only">Your name</label>
            <input
              id="player-name"
              autoFocus
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              style={{ borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', padding: '6px 12px', color: 'var(--text-primary)' }}
            />
            <button className="btn btn-primary btn-sm" onClick={saveName}>Save</button>
            <button className="btn btn-outline" onClick={() => setEditingName(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: 0 }}>
              Playing as <strong style={{ color: 'var(--text-primary)' }}>{myName}</strong>
            </p>
            <button
              className="btn btn-outline"
              onClick={() => {
                setTempName(myName);
                setEditingName(true);
              }}
            >
              Rename
            </button>
          </div>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {falseStart && 'False start — you are locked out this round.'}
        {phase === 'locked' && !state?.locking_in && `${state?.current_winner} buzzed in.`}
        {phase === 'ended' && state?.current_winner && `Round over. ${state.current_winner} got it.`}
        {!connected && 'Connection lost — reconnecting.'}
      </div>

      {!connected && <div className="banner banner-warning" role="alert">Connection lost — reconnecting…</div>}
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      {falseStart && <div className="banner banner-false-start anim-shake" role="alert">FALSE START — locked out this round</div>}

      <Buzzer
        buttonRef={buzzButtonRef}
        label={label}
        sub={sub}
        labelSize={labelSize}
        disabled={disabled}
        onPointerDown={handleButtonPointerDown}
        onClick={handleButtonClick}
      />

      {state && state.players.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
          {state.players.map((p) => (
            <span
              key={p.name}
              className="badge"
              style={{
                color: p.name === myName ? 'var(--color-cyan)' : 'var(--text-secondary)',
                borderColor: p.name === myName ? 'rgba(6,182,212,0.4)' : 'var(--border-default)',
                background: p.name === myName ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,.04)',
              }}
            >
              {p.name}
              {state.settings.requireReadyCheck && phase === 'idle' && <span aria-hidden="true">{p.ready ? '●' : '○'}</span>}
            </span>
          ))}
        </div>
      )}

      {state && state.winners.length > 0 && (
        <div style={{ width: '100%', maxWidth: 320 }}>
          <h2 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-muted)', marginBottom: 12 }}>
            Scoreboard
          </h2>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scoreboard.map((p) => (
              <li
                key={p.name}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderColor: p.name === myName ? 'rgba(6,182,212,0.4)' : undefined }}
              >
                <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)' }}>{p.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
