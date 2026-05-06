function Icon({ children, size = 16, className, style }: { children: React.ReactNode; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

export function IconClose({ size }: { size?: number }) {
  return <Icon size={size}><path d="M4 4l8 8M12 4l-8 8" /></Icon>
}

export function IconMinimize({ size }: { size?: number }) {
  return <Icon size={size}><path d="M3 8h10" /></Icon>
}

export function IconMaximize({ size }: { size?: number }) {
  return <Icon size={size}><rect x="3.5" y="3.5" width="9" height="9" rx="1" /></Icon>
}

export function IconPlus({ size }: { size?: number }) {
  return <Icon size={size}><path d="M8 3v10M3 8h10" /></Icon>
}

export function IconChevronRight({ size }: { size?: number }) {
  return <Icon size={size}><path d="M6 4l4 4-4 4" /></Icon>
}

export function IconChevronDown({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return <Icon size={size} className={className}><path d="M4 6l4 4 4-4" /></Icon>
}

export function IconFolder({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 4.5A1.5 1.5 0 013.5 3h2.4l1.2 1.2h4.4a1.5 1.5 0 011.5 1.5v5.8a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 012 11.5V4.5z" />
    </Icon>
  )
}

export function IconFile({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M4.5 2h4l4 4v6.5a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 013 12.5V3.5A1.5 1.5 0 014.5 2z" />
      <path d="M8.5 2v4.5H13" />
    </Icon>
  )
}

export function IconCircle({ size, filled }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size || 16} height={size || 16} viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5" />
    </svg>
  )
}

export function IconRestore({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="4.5" y="5.5" width="7" height="7" rx="1" />
      <path d="M6.5 5.5V4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-1" />
    </Icon>
  )
}

export function IconTrash({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M6 3V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V3" />
      <path d="M3 4h10" />
      <path d="M5 4l.5 8.5a1 1 0 001 .9h3a1 1 0 001-.9L11 4" />
      <path d="M7 6v4M9 6v4" />
    </Icon>
  )
}

export function IconSidebar({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="2.5" y="3" width="4.5" height="10" rx="0.5" />
      <rect x="9" y="3" width="4.5" height="10" rx="0.5" />
    </Icon>
  )
}

export function IconConsole({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M3 4l3 3-3 3M8 10h5" />
    </Icon>
  )
}

export function IconChatLayout({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" />
      <path d="M5 6h6M5 8.5h4" />
    </Icon>
  )
}

export function IconSplitLayout({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="2" y="2" width="5" height="12" rx="1" />
      <rect x="9" y="2" width="5" height="12" rx="1" />
    </Icon>
  )
}

export function IconCode({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M5.5 3.5L2.5 8l3 4.5" />
      <path d="M10.5 3.5l3 4.5-3 4.5" />
      <path d="M10 2l-3 11.5" />
    </Icon>
  )
}

export function IconFilesLayout({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 3.5A1.5 1.5 0 013.5 2h2l1.2 1.2h5.8a1.5 1.5 0 011.5 1.5v7.8a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" />
      <path d="M5 8h3M5 10.5h2" />
    </Icon>
  )
}
