'use client';

// Structural, not SafePress/HostPress specifically — the board only ever
// reads these four fields, and HostConsole feeds it the richer HostPress
// (which lacks SafePress's lockEpoch) while the other screens feed SafePress.
interface PressLike {
  playerName: string;
  elapsedMs: number;
  rank: number;
  falseStart: boolean;
}

export function PressBoard({
  presses,
  history = [],
  title = 'Press order',
}: {
  presses: PressLike[];
  history?: { label: string; sub?: string }[];
  title?: string;
}) {
  const active = [...presses].filter((p) => !p.falseStart).sort((a, b) => a.elapsedMs - b.elapsedMs);
  const falseStarts = presses.filter((p) => p.falseStart);
  const fastest = active[0]?.elapsedMs ?? 0;

  return (
    <aside className="glass room-aside room-aside--wide eb-rise">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="micro">{title}</span>
        {falseStarts.length > 0 && (
          <span className="mono-num" style={{ fontSize: 11, color: 'var(--color-berry)' }}>{falseStarts.length} false start{falseStarts.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {active.length === 0 ? (
        <div style={{ padding: '26px 16px', borderRadius: 16, border: '1px dashed rgba(255,255,255,.14)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', lineHeight: 1.6 }}>Nothing yet.<br />Press times land here the instant the server clocks them.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {active.map((p, i) => {
            const delta = p.elapsedMs - fastest;
            const barWidth = Math.max(20, 100 - i * 18);
            return (
              <div
                key={p.playerName}
                className="press-row"
                style={{ background: i === 0 ? 'rgba(6,182,212,.1)' : 'rgba(255,255,255,.035)', border: `1px solid ${i === 0 ? 'rgba(6,182,212,.3)' : 'rgba(255,255,255,.08)'}` }}
              >
                <div className="press-bar" style={{ width: `${barWidth}%` }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span className="mono-num" style={{ fontSize: 15, fontWeight: 800, color: i === 0 ? 'var(--color-cyan)' : 'rgba(255,255,255,.5)', width: 26 }}>{p.rank}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono-num" style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{p.elapsedMs}ms</div>
                    <div className="mono-num" style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>{i === 0 ? 'fastest' : `+${delta}ms`}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div>
        <div className="micro" style={{ marginBottom: 10 }}>Round winners</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>No rounds played yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {history.map((h, i) => (
              <div key={i} className="history-row">
                <span className="mono-num" style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', width: 22 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,.82)' }}>{h.label}</span>
                {h.sub && <span className="mono-num" style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{h.sub}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
