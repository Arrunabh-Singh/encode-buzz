'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from './supabaseBrowser';
import { rpc } from './rpc';
import { startClockSync, getServerNow, getLastRttMs } from './clock';
import { remainingMs } from './time';
import { Role, RoomState, RoomSettings, Verdict, HostDetail } from './types';

// Used by the lobby to decide name-join vs. pin-login before joining — a
// plain lookup, not part of the hook's own state.
export async function checkEntryMode(code: string): Promise<'open' | 'teams' | null> {
  const { data } = await supabaseBrowser.rpc('get_room_state', { p_code: code });
  return (data as RoomState | null)?.entry_mode ?? null;
}

const SESSION_KEY = 'qurious_session';

interface StoredSession {
  code: string;
  role: 'host' | 'player';
  secret: string;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable (private browsing, etc.) — session just won't survive a refresh
  }
}

export function useRoom(opts: { isDisplay?: boolean } = {}) {
  const { isDisplay = false } = opts;
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [state, setState] = useState<RoomState | null>(null);
  const [hostDetail, setHostDetail] = useState<HostDetail | null>(null);
  const [error, setError] = useState<string>('');
  const [falseStart, setFalseStart] = useState<boolean>(false);
  const [countdownRemainingMs, setCountdownRemainingMs] = useState<number | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [sessionReplaced, setSessionReplaced] = useState<boolean>(false);

  const secretRef = useRef<string>('');
  const roleRef = useRef<Role | null>(null);
  const falseStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
    setTimeout(() => setError(''), 3000);
  }, []);

  const refreshState = useCallback(async (c: string) => {
    // room_state itself is locked down (no direct SELECT) so a room code
    // can't be discovered by listing the view — this RPC is scoped to one
    // code at a time, the one the caller already has.
    const { data } = await supabaseBrowser.rpc('get_room_state', { p_code: c });
    setState((data as RoomState | null) ?? null);
  }, []);

  const refreshHostDetail = useCallback(async (c: string, hostSecret: string) => {
    const data = await rpc<HostDetail & { error?: string }>('get_host_state', { p_code: c, p_host_secret: hostSecret });
    if (!data.error) setHostDetail(data);
  }, []);

  // Clock sync runs continuously — the buzzer needs it warmed up before a
  // press ever happens, not started reactively once a round opens.
  useEffect(() => startClockSync(), []);

  // Restore a host/player session after a page reload.
  useEffect(() => {
    if (isDisplay) return;
    const session = loadSession();
    if (!session) return;
    (async () => {
      const data = await rpc<{ role?: Role; name?: string; error?: string }>('get_session', {
        p_code: session.code,
        p_secret: session.secret,
      });
      if (data.error) {
        saveSession(null);
        return;
      }
      secretRef.current = session.secret;
      roleRef.current = session.role;
      setRole(session.role);
      setCode(session.code);
      if (data.name) setMyName(data.name);
    })();
  }, [isDisplay]);

  // Realtime: subscribe to this room's broadcast channel and re-fetch on any
  // ping. Room codes are shared join codes (not secrets), so a public,
  // non-private channel is fine — the ping carries no sensitive payload.
  useEffect(() => {
    if (!code) return;
    void refreshState(code);
    if (roleRef.current === 'host' && secretRef.current) void refreshHostDetail(code, secretRef.current);

    const channel = supabaseBrowser.channel(`room:${code}`);
    channel
      .on('broadcast', { event: 'state_change' }, () => {
        void refreshState(code);
        if (roleRef.current === 'host' && secretRef.current) void refreshHostDetail(code, secretRef.current);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnected(true);
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnected(false);
      });

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [code, refreshState, refreshHostDetail]);

  const nudge = useCallback(() => {
    if (!code) return;
    void supabaseBrowser.rpc('expire_round_if_due', { p_code: code }).then(() => {
      void refreshState(code);
    });
  }, [code, refreshState]);

  // Nobody runs a background timer anymore — any connected client's local
  // ticker nudges a stalled round forward. This 1s poll is a safety net;
  // the effects below schedule exact one-shot timers for the two moments
  // that actually matter (countdown ending, lock window closing) since a
  // 1s poll alone is what let backgrounded/locked-screen phones appear to
  // "get stuck" — a throttled recurring timer can silently stop firing for
  // tens of seconds, while a one-shot timer for a near-term deadline and the
  // visibility-return catch-up below are far harder for the browser to defer.
  useEffect(() => {
    if (!code || !state || state.phase === 'idle' || state.phase === 'ended') return;
    const t = setInterval(nudge, 1000);
    return () => clearInterval(t);
  }, [code, state?.phase, nudge]);

  // Exact one-shot for the countdown → open edge.
  useEffect(() => {
    if (state?.phase !== 'countdown' || !state.opens_at) return;
    const ms = remainingMs(new Date(state.opens_at).getTime(), getServerNow());
    const t = setTimeout(nudge, ms + 30);
    return () => clearTimeout(t);
  }, [state?.phase, state?.opens_at, nudge]);

  // Exact one-shot for the 250ms press-collection window closing — this is
  // the one that showed up as a round stuck on "Locking in…".
  useEffect(() => {
    if (!state?.locking_in || !state.lock_window_closes_at) return;
    const ms = remainingMs(new Date(state.lock_window_closes_at).getTime(), getServerNow());
    const t = setTimeout(nudge, ms + 30);
    return () => clearTimeout(t);
  }, [state?.locking_in, state?.lock_window_closes_at, nudge]);

  // A backgrounded tab (screen lock, app switch) throttles its own timers —
  // catch up the instant it's foregrounded again instead of waiting on them.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') nudge();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [nudge]);

  // Local countdown ticker, driven off the synced server clock so every
  // device — phone, laptop, TV — hits zero on the same wall-clock instant.
  useEffect(() => {
    if (state?.phase !== 'countdown' || !state.opens_at) return;
    const opensAt = new Date(state.opens_at).getTime();
    const tick = () => setCountdownRemainingMs(remainingMs(opensAt, getServerNow()));
    tick();
    const interval = setInterval(tick, 100);
    return () => {
      clearInterval(interval);
      setCountdownRemainingMs(null);
    };
  }, [state?.phase, state?.opens_at]);

  const createRoom = useCallback(async () => {
    const data = await rpc<{ code?: string; hostSecret?: string; error?: string }>('create_room', {});
    if (data.error || !data.code || !data.hostSecret) {
      showError(data.error || 'Could not create room');
      return;
    }
    secretRef.current = data.hostSecret;
    roleRef.current = 'host';
    saveSession({ code: data.code, role: 'host', secret: data.hostSecret });
    setRole('host');
    setCode(data.code);
  }, [showError]);

  const joinRoom = useCallback(
    async (joinCode: string) => {
      const data = await rpc<{ name?: string; playerSecret?: string; error?: string }>('join_room', { p_code: joinCode });
      if (data.error || !data.name || !data.playerSecret) {
        showError(data.error || 'Could not join room');
        return;
      }
      secretRef.current = data.playerSecret;
      roleRef.current = 'player';
      saveSession({ code: joinCode, role: 'player', secret: data.playerSecret });
      setRole('player');
      setCode(joinCode);
      setMyName(data.name);
    },
    [showError]
  );

  const teamLogin = useCallback(
    async (joinCode: string, pin: string) => {
      const data = await rpc<{ name?: string; secret?: string; error?: string }>('team_login', { p_code: joinCode, p_pin: pin });
      if (data.error || !data.name || !data.secret) {
        showError(data.error || 'Could not log in');
        return false;
      }
      secretRef.current = data.secret;
      roleRef.current = 'player';
      saveSession({ code: joinCode, role: 'player', secret: data.secret });
      setSessionReplaced(false);
      setRole('player');
      setCode(joinCode);
      setMyName(data.name);
      return true;
    },
    [showError]
  );

  const defineTeams = useCallback(
    async (names: string[]) => {
      if (!code || !secretRef.current) return;
      // Rewrites the players table, which fires the realtime broadcast that
      // already refreshes hostDetail (including the new teams+pins) — no
      // separate state needed here.
      const data = await rpc<{ error?: string }>('define_teams', {
        p_code: code,
        p_host_secret: secretRef.current,
        p_team_names: names,
      });
      if (data.error) showError(data.error);
    },
    [code, showError]
  );

  const joinDisplay = useCallback((joinCode: string) => {
    setCode(joinCode);
  }, []);

  const leaveRoom = useCallback(() => {
    if (code && secretRef.current && roleRef.current === 'player') {
      void rpc('leave_room', { p_code: code, p_secret: secretRef.current });
    }
    saveSession(null);
    secretRef.current = '';
    roleRef.current = null;
    setRole(null);
    setCode('');
    setMyName('');
    setState(null);
    setHostDetail(null);
  }, [code]);

  const changeName = useCallback(
    async (newName: string) => {
      if (!code || !secretRef.current) return;
      const data = await rpc<{ error?: string; name?: string }>('change_name', {
        p_code: code,
        p_secret: secretRef.current,
        p_new_name: newName,
      });
      if (data.error) {
        showError(data.error);
        return;
      }
      if (data.name) setMyName(data.name);
    },
    [code, showError]
  );

  const handleSessionReplaced = useCallback(() => {
    saveSession(null);
    secretRef.current = '';
    setSessionReplaced(true);
  }, []);

  const setReady = useCallback(async () => {
    if (!code || !secretRef.current) return;
    const data = await rpc<{ error?: string }>('set_ready', { p_code: code, p_secret: secretRef.current });
    if (data.error === 'session_replaced') handleSessionReplaced();
  }, [code, handleSessionReplaced]);

  const updateSettings = useCallback(
    (patch: Partial<RoomSettings>) => {
      if (code && secretRef.current) void rpc('update_settings', { p_code: code, p_host_secret: secretRef.current, p_patch: patch });
    },
    [code]
  );

  const startRound = useCallback(async () => {
    if (!code || !secretRef.current) return;
    const data = await rpc<{ error?: string }>('start_round', { p_code: code, p_host_secret: secretRef.current });
    if (data.error) showError(data.error);
  }, [code, showError]);

  const press = useCallback(async () => {
    if (!code || !secretRef.current) return;
    const data = await rpc<{ event?: string }>('record_press', {
      p_code: code,
      p_player_secret: secretRef.current,
      p_client_estimated_server_ms: Math.round(getServerNow()),
      p_rtt_ms: Math.round(getLastRttMs()),
    });
    if (data.event === 'session_replaced') {
      handleSessionReplaced();
      return;
    }
    if (data.event === 'false_start') {
      setFalseStart(true);
      if (falseStartTimer.current) clearTimeout(falseStartTimer.current);
      falseStartTimer.current = setTimeout(() => setFalseStart(false), 1500);
    }
  }, [code, handleSessionReplaced]);

  const judge = useCallback(
    async (verdict: Verdict) => {
      if (!code || !secretRef.current) return;
      const data = await rpc<{ error?: string }>('judge_round', { p_code: code, p_host_secret: secretRef.current, p_verdict: verdict });
      if (data.error) showError(data.error);
    },
    [code, showError]
  );

  const abortRound = useCallback(async () => {
    if (!code || !secretRef.current) return;
    const data = await rpc<{ error?: string }>('abort_round', { p_code: code, p_host_secret: secretRef.current });
    if (data.error) showError(data.error);
  }, [code, showError]);

  const nextRound = useCallback(async () => {
    if (!code || !secretRef.current) return;
    const data = await rpc<{ error?: string }>('next_round', { p_code: code, p_host_secret: secretRef.current });
    if (data.error) showError(data.error);
  }, [code, showError]);

  const myPlayer = state?.players.find((p) => p.name === myName) ?? null;

  return {
    connected,
    role,
    code,
    myName,
    myPlayer,
    state,
    hostDetail,
    error,
    falseStart,
    sessionReplaced,
    countdownRemainingMs,
    createRoom,
    joinRoom,
    teamLogin,
    defineTeams,
    joinDisplay,
    leaveRoom,
    changeName,
    setReady,
    updateSettings,
    startRound,
    press,
    judge,
    abortRound,
    nextRound,
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
