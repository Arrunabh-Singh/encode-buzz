export function BrandFooter({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <footer
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '20px 0',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        ...style,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Powered by
        <img src="/brand/halocon-mark.png" alt="HaloCon" style={{ height: 14, width: 'auto' }} />
      </span>
      <span>Made by Arrunabh Singh</span>
    </footer>
  );
}
