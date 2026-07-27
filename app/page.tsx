'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoom, loadSession, checkEntryMode } from '@/lib/useRoom';
import { PlayerScreen } from '@/screens/PlayerScreen';
import { HostConsole } from '@/screens/HostConsole';
import { DisplayScreen } from '@/screens/DisplayScreen';
import { TeamLogin } from '@/screens/TeamLogin';
import { BrandHeader } from '@/components/BrandHeader';
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <BrandHeader />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-5xl)', margin: '0 0 8px',
                backgroundImage: 'var(--gradient-text-spectrum)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}
            >
              Qurious
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>Tap fast, win faster.</p>
          </div>

          {error && <div className="banner banner-error" role="alert">{error}</div>}

          <button className="btn btn-primary btn-lg btn-full" onClick={createRoom}>Host a Quiz</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ height: 1, flex: 1, background: 'var(--border-default)' }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>or</span>
            <div style={{ height: 1, flex: 1, background: 'var(--border-default)' }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <label htmlFor="room-code-input" className="sr-only">Room code</label>
            <input
              id="room-code-input"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && submitJoin()}
              placeholder="Room code"
              maxLength={6}
              style={{
                flex: 1, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                padding: '14px', textAlign: 'center', fontSize: 'var(--text-lg)', fontFamily: 'var(--font-mono)', letterSpacing: '0.3em', color: 'var(--text-primary)',
              }}
            />
            <button className="btn btn-secondary" disabled={!roomCode.trim() || joining} onClick={submitJoin}>{joining ? '…' : 'Join'}</button>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-disabled)', margin: 0 }}>You&rsquo;ll get a default name and can change it anytime</p>
        </div>
      </div>
      <BrandFooter />
    </div>
  );
}

function SessionReplaced({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-2xl)', margin: 0 }}>Signed out</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: 0 }}>
          Your team logged in on another device, so this one was signed out. Only one device per team can be active at a time.
        </p>
        <button className="btn btn-primary btn-full" onClick={onDismiss}>Back to login</button>
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
