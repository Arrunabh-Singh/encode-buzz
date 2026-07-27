// Fixed behind every screen. ponytail: skips the prototype's SVG noise-turbulence
// overlay (mix-blend-mode over a full-screen filter) — expensive on mobile GPUs
// for a barely-visible grain layer; the drifting orbs carry the look on their own.
export function Backdrop() {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none' }} aria-hidden="true">
      <div
        style={{
          position: 'absolute', top: '-18vh', left: '-10vw', width: '62vw', height: '62vw', borderRadius: '50%',
          background: 'radial-gradient(circle, var(--color-teal) 0%, transparent 62%)',
          filter: 'blur(90px)', opacity: 0.42, animation: 'eb-drift-a 26s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute', bottom: '-24vh', right: '-12vw', width: '58vw', height: '58vw', borderRadius: '50%',
          background: 'radial-gradient(circle, var(--color-cyan) 0%, transparent 62%)',
          filter: 'blur(100px)', opacity: 0.34, animation: 'eb-drift-b 32s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute', top: '30vh', left: '38vw', width: '40vw', height: '40vw', borderRadius: '50%',
          background: 'radial-gradient(circle, var(--color-magenta) 0%, transparent 60%)',
          filter: 'blur(110px)', opacity: 0.24, animation: 'eb-drift-c 24s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 30%, transparent 100%)',
        }}
      />
    </div>
  );
}
