'use client';

export function Toast({
  show,
  rank = '1',
  name,
  time,
  title = 'First buzz',
}: {
  show: boolean;
  rank?: string | number;
  name: string;
  time?: string;
  title?: string;
}) {
  if (!show) return null;
  return (
    <div className="toast shimmer-sweep">
      <div className="toast-rank">{rank}</div>
      <div style={{ position: 'relative' }}>
        <div className="micro">{title}</div>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>{name}{time ? ` · ${time}` : ''}</div>
      </div>
    </div>
  );
}
