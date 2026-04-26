import { Window } from '@wailsio/runtime'

function TitleBar() {
  return (
    <div
      className="flex items-center h-[30px] bg-[var(--bg-titlebar)] border-b border-[var(--border)] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 text-[13px] font-normal text-[var(--text-primary)]">Monika</div>
      <div className="px-2 text-[11px] text-[var(--text-secondary)]">project</div>
      <div className="px-2 text-[11px] text-[var(--text-secondary)]">branch</div>
      <div className="flex-1" />
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex h-full">
        <button
          onClick={() => Window.Minimise()}
          className="w-[46px] h-full flex items-center justify-center hover:bg-[#3e3e40] text-[13px] text-[var(--text-primary)]"
        >─</button>
        <button
          onClick={() => Window.Maximise()}
          className="w-[46px] h-full flex items-center justify-center hover:bg-[#3e3e40] text-[13px] text-[var(--text-primary)]"
        >□</button>
        <button
          onClick={() => Window.Close()}
          className="w-[46px] h-full flex items-center justify-center hover:bg-[#e81123] text-[13px] text-[var(--text-primary)] hover:text-white"
        >✕</button>
      </div>
    </div>
  )
}

export default TitleBar
