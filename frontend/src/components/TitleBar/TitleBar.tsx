function TitleBar() {
  return (
    <div
      className="flex items-center h-8 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 text-sm font-bold text-[var(--color-accent)]">Monika</div>
      <div className="px-2 text-xs text-[var(--color-text-dim)]">project</div>
      <div className="px-2 text-xs text-[var(--color-text-dim)]">branch</div>
      <div className="flex-1" />
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex">
        <button className="w-8 h-8 flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] text-xs text-[var(--color-text-dim)]">−</button>
        <button className="w-8 h-8 flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] text-xs text-[var(--color-text-dim)]">□</button>
        <button className="w-8 h-8 flex items-center justify-center hover:bg-[var(--color-accent-red)] text-xs text-[var(--color-text-dim)]">✕</button>
      </div>
    </div>
  )
}

export default TitleBar
