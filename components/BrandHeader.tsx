// Reserved slot for the company logo — currently empty. Drop the asset into
// /public/brand/ and swap the placeholder <div> below for an <img>.
export function BrandHeader() {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 24px' }}>
      <div
        aria-label="Company logo placeholder"
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          color: 'var(--text-disabled)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}
      >
        LOGO
      </div>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'var(--text-2xl)',
          letterSpacing: 'var(--tracking-tight)',
          backgroundImage: 'var(--gradient-text-spectrum)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        Qurious
      </span>
    </header>
  );
}
