'use client';

import { PublicPlayer, RoundPhase } from '@/lib/types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Roster({
  players,
  myName,
  requireReadyCheck,
  phase,
  footer,
}: {
  players: PublicPlayer[];
  myName?: string;
  requireReadyCheck?: boolean;
  phase?: RoundPhase;
  footer?: React.ReactNode;
}) {
  const showReadyDots = requireReadyCheck && phase === 'idle';

  return (
    <aside className="glass room-aside eb-rise">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="micro">In the room</span>
        <span className="mono-num" style={{ fontSize: 11, color: 'rgba(255,255,255,.42)' }}>{players.length} here</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {players.map((p) => {
          const isMe = p.name === myName;
          let sub = p.connected ? 'connected' : 'offline';
          let dot = p.connected ? 'rgba(255,255,255,.35)' : 'var(--text-disabled)';
          let glow = false;
          if (p.lockedOut) {
            sub = 'locked out';
            dot = 'var(--color-berry)';
            glow = true;
          } else if (showReadyDots) {
            sub = p.ready ? 'ready' : 'not ready';
            dot = p.ready ? '#4ade80' : 'rgba(255,255,255,.25)';
            glow = p.ready;
          }
          return (
            <div
              key={p.name}
              className="roster-row"
              style={{ background: isMe ? 'rgba(6,182,212,.08)' : 'rgba(255,255,255,.03)', border: `1px solid ${isMe ? 'rgba(6,182,212,.25)' : 'rgba(255,255,255,.08)'}` }}
            >
              <div className="roster-row-tile">{initials(p.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isMe ? '#fff' : 'rgba(255,255,255,.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}{isMe ? ' (you)' : ''}
                </div>
                <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>{sub}</div>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: glow ? `0 0 12px ${dot}` : 'none', flexShrink: 0 }} />
              <span className="mono-num" style={{ fontSize: 12, color: 'var(--color-cyan)', flexShrink: 0 }}>{p.score}</span>
            </div>
          );
        })}
        {players.length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>No players yet</div>}
      </div>

      <div style={{ flex: 1 }} />
      {footer}
    </aside>
  );
}
