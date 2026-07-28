'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoom, loadSession, checkEntryMode } from '@/lib/useRoom';
import { PlayerScreen } from '@/screens/PlayerScreen';
import { HostConsole } from '@/screens/HostConsole';
import { DisplayScreen } from '@/screens/DisplayScreen';
import { TeamLogin } from '@/screens/TeamLogin';
import { BrandFooter } from '@/components/BrandFooter';

function Lobby({ error, createRoom, joinRoom }: { error: string; createRoom: () => void; joinRoom: (code: string) => void }) {
  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining] = useState(false);

  const submitJoin = () => {
    if (!roomCode.trim()) return;
    setJoining(true);
    joinRoom(roomCode.trim().toUpperCase());
    setTimeout(() => setJoining(false), 2000);
  };

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', height: '100dvh', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(14px,4vw,24px)' }}>
      <div className="eb-rise" style={{ width: 460, maxWidth: '100%', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: -2, borderRadius: 30, background: 'linear-gradient(140deg, rgba(255,255,255,.5), rgba(255,255,255,0) 40%, rgba(255,255,255,.18))', opacity: .5, filter: 'blur(.5px)' }} />
        <div className="glass-strong shimmer-sweep" style={{ position: 'relative', padding: '44px 38px 34px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, position: 'relative' }}>
            <div
              className="eb-bob"
              style={{
                width: 92, height: 92, borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: 'linear-gradient(150deg, rgba(255,255,255,.2), rgba(255,255,255,.04))', border: '1px solid rgba(255,255,255,.2)',
                boxShadow: '0 1px 0 rgba(255,255,255,.4) inset, 0 18px 40px -18px var(--a1)',
              }}
            >
              <svg viewBox="0 0 512 512" width={46} height={46} fill="none" stroke="url(#gl1)" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round">
                <defs><linearGradient id="gl1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fff" /><stop offset="100%" stopColor="#a5f3fc" /></linearGradient></defs>
                <path d="M256 140 L256 200" />
                <path d="M160 240 Q120 240 120 280 Q120 400 256 400 Q392 400 392 280 Q392 240 352 240" />
                <path d="M120 280 L120 380 Q120 400 140 400 L372 400 Q392 400 392 380 L392 280" />
                <path d="M180 400 L180 440" />
                <path d="M332 400 L332 440" />
              </svg>
            </div>

            <div style={{ textAlign: 'center' }}>
              <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1 }}>Qurious</h1>
              <p style={{ margin: '10px 0 0', fontSize: 13, letterSpacing: '.02em', color: 'rgba(255,255,255,.5)' }}>Tap fast, win faster.</p>
            </div>

            {error && <div className="banner banner-error" style={{ width: '100%', boxSizing: 'border-box' }} role="alert">{error}</div>}

            <button className="gbtn gbtn--hero" onClick={createRoom}>Create a room</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
              <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)' }} />
              <span style={{ fontSize: 10, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>or join</span>
              <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <label htmlFor="room-code-input" className="sr-only">Room code</label>
              <input
                id="room-code-input"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && submitJoin()}
                placeholder="CODE"
                maxLength={6}
                className="ginput ginput--code"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="gbtn gbtn--primary" style={{ flexShrink: 0 }} disabled={!roomCode.trim() || joining} onClick={submitJoin}>{joining ? '…' : 'Join'}</button>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,.32)', textAlign: 'center' }}>You&rsquo;ll get a default name and can change it anytime</p>
          </div>
        </div>
      </div>
      <BrandFooter style={{ position: 'fixed', bottom: 8, left: 0, right: 0 }} />
    </div>
  );
}

function SessionReplaced({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div className="glass-strong eb-rise" style={{ width: '100%', maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20, padding: 32 }}>
        <h1 style={{ fontWeight: 800, letterSpacing: '-.03em', fontSize: 24, margin: 0 }}>Signed out</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
          Your team logged in on another device, so this one was signed out. Only one device per team can be active at a time.
        </p>
        <button className="gbtn gbtn--primary" onClick={onDismiss}>Back to login</button>
      </div>
    </div>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [roomParam, setRoomParam] = useState<string | null>(null);
  const [isDisplayRoute, setIsDisplayRoute] = useState(false);
  const [teamLoginCode, setTeamLoginCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRoomParam(params.get('room'));
    setIsDisplayRoute(params.has('display'));
    setReady(true);
  }, []);

  const room = useRoom({ isDisplay: isDisplayRoute });
  const attemptedAutoJoin = useRef(false);
  const joinDisplayRef = useRef(room.joinDisplay);
  const joinRoomRef = useRef(room.joinRoom);

  useEffect(() => {
    joinDisplayRef.current = room.joinDisplay;
    joinRoomRef.current = room.joinRoom;
  });

  const attemptJoin = useCallback(async (code: string) => {
    const mode = await checkEntryMode(code);
    if (mode === 'teams') {
      setTeamLoginCode(code);
      return;
    }
    if (mode === 'error') {
      room.showError('Could not reach the server — check your connection and try again');
      return;
    }
    // 'open' or 'not_found' — join_room surfaces its own "room not found" error.
    joinRoomRef.current(code);
  }, [room.showError]);

  useEffect(() => {
    if (!ready || attemptedAutoJoin.current || !roomParam) return;
    attemptedAutoJoin.current = true;
    const code = roomParam.toUpperCase();

    if (!isDisplayRoute) {
      // useRoom's session-restore effect already rejoins this exact session —
      // firing a fresh join here too would create a duplicate player identity.
      const stored = loadSession();
      if (stored && stored.code === code) return;
    }

    if (isDisplayRoute) {
      joinDisplayRef.current(code);
    } else {
      void attemptJoin(code);
    }
  }, [ready, roomParam, isDisplayRoute, attemptJoin]);

  // A stored session that failed to restore (room gone, secret stale) would
  // otherwise strand the user on the Lobby with no path back in — retry as a
  // fresh join for the same code instead of requiring a manual re-entry.
  useEffect(() => {
    if (!room.staleSessionCode) return;
    void attemptJoin(room.staleSessionCode);
  }, [room.staleSessionCode, attemptJoin]);

  const createRoom = useCallback(() => void room.createRoom(), [room]);

  if (!ready) return null;

  if (isDisplayRoute && roomParam) return <DisplayScreen room={room} />;
  if (room.sessionReplaced) return <SessionReplaced onDismiss={() => window.location.reload()} />;
  if (room.role === 'host') return <HostConsole room={room} />;
  if (room.role === 'player') return <PlayerScreen room={room} />;
  if (teamLoginCode) {
    return (
      <TeamLogin
        code={teamLoginCode}
        error={room.error}
        onBack={() => setTeamLoginCode(null)}
        onSubmit={(pin) => room.teamLogin(teamLoginCode, pin)}
      />
    );
  }

  return <Lobby error={room.error} createRoom={createRoom} joinRoom={(code) => void attemptJoin(code)} />;
}
