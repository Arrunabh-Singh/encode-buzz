'use client';

import { RefObject, useState } from 'react';

let ripId = 0;

export function Buzzer({
  label,
  sub,
  labelSize,
  disabled,
  buttonRef,
  onPointerDown,
  onClick,
  size,
}: {
  label: string;
  sub: string;
  labelSize?: string;
  disabled: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onPointerDown: () => void;
  onClick: () => void;
  size?: 'xl';
}) {
  const [ripples, setRipples] = useState<{ id: number }[]>([]);

  const spawnRipple = () => {
    const id = ++ripId;
    setRipples((r) => [...r, { id }]);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 900);
  };

  return (
    <div className={`buzzer-wrap${size === 'xl' ? ' buzzer-wrap--xl' : ''}`}>
      <div className="buzzer-halo" />
      <div className="buzzer-ring" />
      <div className="buzzer-ring buzzer-ring--delay" />
      {ripples.map((r) => (
        <div key={r.id} className="buzzer-ripple" />
      ))}
      <button
        ref={buttonRef}
        onPointerDown={() => {
          spawnRipple();
          onPointerDown();
        }}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="buzzer-btn"
      >
        <div className="buzzer-face" style={{ fontSize: labelSize ?? 'clamp(28px,10cqw,48px)' }}>{label}</div>
        <div className="buzzer-sub">{sub}</div>
      </button>
    </div>
  );
}
