'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RoomApi } from '@/lib/useRoom';
import { msToSeconds } from '@/lib/time';
import { hasPressedInEpoch } from '@/lib/presses';
import { Buzzer } from '@/components/Buzzer';
import { RoomHeader } from '@/components/RoomHeader';
import { Roster } from '@/components/Roster';
import { PressBoard } from '@/components/PressBoard';
import { Toast } from '@/components/Toast';

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
  const { code, myName, myPlayer, state, error, falseStart, countdownRemainingMs, connected, pingMs, changeName, setReady, press, leaveRoom } = room;

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
  const winningPress = useMemo(
    () => state?.presses.find((p) => p.playerName === state.current_winner && !p.falseStart),
    [state]
  );

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
  let kicker = 'Lobby';
  let stageTitle = 'Waiting for host';

  if (phase === 'countdown') {
    label = String(msToSeconds(countdownRemainingMs ?? 0));
    sub = 'hands off';
    labelSize = 'clamp(64px,26cqw,124px)';
    disabled = true;
    kicker = 'Starting';
    stageTitle = 'Get ready…';
  } else if (phase === 'open') {
    kicker = 'Live';
    stageTitle = 'Buzzers are open';
    if (hasPressed) {
      label = 'IN';
      sub = 'buzzed';
      labelSize = 'clamp(30px,12cqw,54px)';
      disabled = true;
      stageTitle = 'You buzzed in';
    } else if (myPlayer?.lockedOut) {
      // False-started or judged 'wrong' in a reopen-remaining chain — the
      // server silently ignores a press from this player, so an enabled
      // "BUZZ" here would be a dead button with no feedback.
      label = 'OUT';
      sub = 'locked out this round';
      labelSize = 'clamp(28px,11cqw,50px)';
      disabled = true;
      stageTitle = 'Locked out this round';
    }
  } else if (phase === 'locked') {
    disabled = true;
    labelSize = 'clamp(24px,9cqw,42px)';
    if (state?.locking_in) {
      label = '···';
      sub = 'locking in';
      kicker = 'Locking in';
      stageTitle = 'Just a moment…';
    } else if (isMyTurn) {
      label = 'IN';
      sub = 'judging…';
      kicker = 'Buzzed in';
      stageTitle = 'Your turn to answer';
    } else {
      label = state?.current_winner ?? '—';
      sub = 'buzzed in';
      kicker = 'Buzzed in';
      stageTitle = `${state?.current_winner ?? '—'} buzzed in`;
    }
  } else if (phase === 'ended') {
    disabled = true;
    labelSize = 'clamp(28px,11cqw,52px)';
    kicker = 'Round over';
    if (state?.last_verdict === 'correct' && state.current_winner === myName) {
      label = 'FIRST';
      sub = 'correct';
      stageTitle = 'You got it!';
    } else if (state?.current_winner) {
      label = state.current_winner;
      sub = 'took it';
      stageTitle = `${state.current_winner} took it`;
    } else if (iPressed) {
      // Nobody ended up correct, but this player did buzz in — "MISSED" would
      // be a flat lie to someone who pressed and got judged wrong.
      label = 'WRONG';
      sub = 'no one got it';
      stageTitle = 'No one got it';
    } else {
      label = 'MISSED';
      sub = 'no presses';
      stageTitle = 'Round closed';
    }
  } else {
    // idle
    labelSize = 'clamp(26px,10cqw,46px)';
    if (state?.settings.requireReadyCheck) {
      if (myPlayer?.ready) {
        label = 'ARMED';
        sub = 'waiting for host';
        disabled = true;
        stageTitle = 'Waiting for the host to start';
      } else {
        label = 'READY';
        sub = 'tap to arm';
        stageTitle = 'Tap ready when you are set';
      }
    } else {
      label = 'WAITING';
      sub = 'host controls the round';
      disabled = true;
      stageTitle = 'Host controls the round';
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
    if (phase === 'open' && !hasPressed && !myPlayer?.lockedOut) handlePress();
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
    <div className="room">
      <RoomHeader
        code={code}
        pingMs={pingMs}
        connected={connected}
        copied={copied}
        onCopyLink={copyRoomLink}
        rightSlot={<button className="gbtn gbtn--ghost gbtn--sm gbtn--leave" onClick={leaveRoom}>Leave</button>}
      />

      <div role="status" aria-live="polite" className="sr-only">
        {falseStart && 'False start — you are locked out this round.'}
        {phase === 'locked' && !state?.locking_in && `${state?.current_winner} buzzed in.`}
        {phase === 'ended' && state?.current_winner && `Round over. ${state.current_winner} got it.`}
        {!connected && 'Connection lost — reconnecting.'}
      </div>

      {!connected && <div className="banner banner-warning" role="alert">Connection lost — reconnecting…</div>}
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      {falseStart && <div className="banner banner-false-start anim-shake" role="alert">FALSE START — locked out this round</div>}

      <div className="room-body">
        <Roster
          players={state?.players ?? []}
          myName={myName}
          requireReadyCheck={state?.settings.requireReadyCheck}
          phase={phase}
          footer={
            <div style={{ padding: 14, borderRadius: 16, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
              <div className="micro" style={{ marginBottom: 9 }}>You</div>
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
                    className="ginput"
                    style={{ flex: 1, minWidth: 0, padding: '8px 12px', fontSize: 14 }}
                  />
                  <button className="gbtn gbtn--primary gbtn--sm" onClick={saveName}>Save</button>
                  <button className="gbtn gbtn--ghost gbtn--sm" onClick={() => setEditingName(false)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{myName}</span>
                  <button
                    className="gbtn gbtn--ghost gbtn--sm"
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
          }
        />

        <main className="glass room-main eb-rise">
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120, background: 'linear-gradient(180deg, rgba(255,255,255,.09), transparent)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', textAlign: 'center', zIndex: 2 }}>
            <div className="micro" style={{ fontSize: 11, letterSpacing: '.3em' }}>{kicker}</div>
            <div style={{ marginTop: 7, fontSize: 'clamp(18px,2.7vh,26px)', fontWeight: 700, letterSpacing: '-.025em', color: '#fff' }}>{stageTitle}</div>
          </div>

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
            <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, zIndex: 2 }}>
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
        </main>

        <PressBoard
          presses={state?.presses ?? []}
          history={(state?.winners ?? []).map((name) => ({ label: name }))}
        />
      </div>

      {state && state.winners.length > 0 && (
        <div style={{ width: '100%', maxWidth: 320 }}>
          <h2 className="sr-only">Scoreboard</h2>
          <ol className="sr-only" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {scoreboard.map((p) => (
              <li key={p.name}>{p.name}: {p.score}</li>
            ))}
          </ol>
        </div>
      )}

      <Toast
        show={phase === 'locked' && !state?.locking_in && !!state?.current_winner}
        name={state?.current_winner ?? ''}
        time={winningPress ? `${winningPress.elapsedMs}ms` : undefined}
      />
    </div>
  );
}
