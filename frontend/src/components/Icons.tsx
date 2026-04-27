function Icon({ children, size = 16, className }: { children: React.ReactNode; size?: number; className?: string }) {
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

export function IconChevronDown({ size, className }: { size?: number; className?: string }) {
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

export function IconDots({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="4" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconTrash({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 4h10M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1M6 4v9.5a1 1 0 001 1h2a1 1 0 001-1V4" />
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
      <path d="M3 4l3 3-3 3M8 10h5" />
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
    </Icon>
  )
}
