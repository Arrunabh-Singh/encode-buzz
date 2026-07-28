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
    <div style={{ position: 'relative', minHeight: '100dvh', height: '100dvh', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(14px,4vw,24px)' }}>
      <div className="eb-rise" style={{ width: 400, maxWidth: '100%', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: -2, borderRadius: 30, background: 'linear-gradient(140deg, rgba(255,255,255,.5), rgba(255,255,255,0) 40%, rgba(255,255,255,.18))', opacity: .5, filter: 'blur(.5px)' }} />
        <div className="glass-strong shimmer-sweep" style={{ position: 'relative', padding: '40px 34px 30px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, position: 'relative' }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ margin: '0 0 8px', fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>Team login</h1>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,.5)' }}>
                Room <span className="pill pill-code" style={{ padding: '2px 8px' }}>{code}</span> — enter your team&rsquo;s 4-digit code
              </p>
            </div>

            {error && <div className="banner banner-error" style={{ width: '100%', boxSizing: 'border-box' }} role="alert">{error}</div>}

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
              className="ginput ginput--code"
              style={{ width: '100%' }}
            />

            <button className="gbtn gbtn--primary" style={{ width: '100%' }} disabled={pin.length !== 4 || submitting} onClick={submit}>
              {submitting ? '…' : 'Enter'}
            </button>

            <button className="gbtn gbtn--ghost" style={{ width: '100%' }} onClick={onBack}>Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}
