'use client';

import { ReactNode } from 'react';

export function RoomHeader({
  code,
  isHost,
  pingMs,
  connected,
  copied,
  onCopyLink,
  onOpenSettings,
  settingsDisabled,
  rightSlot,
}: {
  code: string;
  isHost?: boolean;
  pingMs: number | null;
  connected: boolean;
  copied: boolean;
  onCopyLink: () => void;
  onOpenSettings?: () => void;
  settingsDisabled?: boolean;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="glass-hd eb-rise">
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(150deg, rgba(255,255,255,.24), rgba(255,255,255,.05))', border: '1px solid rgba(255,255,255,.2)',
          }}
        >
          <svg viewBox="0 0 512 512" width={17} height={17} fill="none" stroke="#fff" strokeWidth={32} strokeLinecap="round" strokeLinejoin="round">
            <path d="M256 140 L256 200" />
            <path d="M160 240 Q120 240 120 280 Q120 400 256 400 Q392 400 392 280 Q392 240 352 240" />
            <path d="M120 280 L120 380 Q120 400 140 400 L372 400 Q392 400 392 380 L392 280" />
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em' }}>Qurious</span>
      </div>

      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,.12)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="pill pill-code">{code}</span>
        <button className="gbtn gbtn--ghost gbtn--sm" onClick={onCopyLink}>{copied ? '✓ Copied' : 'Copy link'}</button>
        {isHost && (
          <span
            style={{
              padding: '5px 11px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.14em',
              color: '#fff', background: 'linear-gradient(120deg, var(--a1), var(--a2))', boxShadow: '0 6px 18px -8px var(--a1)',
            }}
          >
            Host
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px', borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
        <span
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? '#4ade80' : 'var(--color-berry)',
            boxShadow: connected ? '0 0 10px #4ade80' : 'none',
            animation: connected ? 'eb-breathe 2.4s ease-in-out infinite' : 'none',
          }}
        />
        <span className="mono-num" style={{ fontSize: 11, color: 'rgba(255,255,255,.62)' }}>
          {connected ? (pingMs != null ? `live · ${pingMs}ms` : 'live') : 'reconnecting'}
        </span>
      </div>

      {onOpenSettings && (
        <button className="gbtn gbtn--ghost gbtn--sm" onClick={onOpenSettings} disabled={settingsDisabled}>Settings</button>
      )}
      {rightSlot}
    </header>
  );
}
