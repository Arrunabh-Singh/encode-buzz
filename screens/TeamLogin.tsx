'use client';

import { useState } from 'react';

export function TeamLogin({
  code,
  error,
  onSubmit,
  onBack,
}: {
  code: string;
  error: string;
  onSubmit: (pin: string) => Promise<boolean>;
  onBack: () => void;
}) {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (pin.length !== 4 || submitting) return;
    setSubmitting(true);
    const ok = await onSubmit(pin);
    setSubmitting(false);
    if (!ok) setPin('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 340, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-3xl)', margin: '0 0 8px',
              backgroundImage: 'var(--gradient-text-spectrum)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}
          >
            Team login
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
            Room <span className="pill pill-code" style={{ padding: '2px 8px' }}>{code}</span> — enter your team&rsquo;s 4-digit code
          </p>
        </div>

        {error && <div className="banner banner-error" role="alert">{error}</div>}

        <label htmlFor="team-pin" className="sr-only">Team PIN</label>
        <input
          id="team-pin"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="0000"
          maxLength={4}
          style={{
            borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
            padding: '18px', textAlign: 'center', fontSize: 'var(--text-3xl)', fontFamily: 'var(--font-mono)', letterSpacing: '0.4em',
            color: 'var(--text-primary)',
          }}
        />

        <button className="btn btn-primary btn-lg btn-full" disabled={pin.length !== 4 || submitting} onClick={submit}>
          {submitting ? '…' : 'Enter'}
        </button>

        <button className="btn btn-outline" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
