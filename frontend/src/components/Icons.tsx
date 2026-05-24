import {
  X,
  Minus,
  Square,
  Plus,
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  Circle,
  Trash2,
  PanelLeft,
  MessageSquare,
  Columns2,
  Code,
  FolderOpen,
  Pencil,
  Server,
  Bot,
  ShieldCheck,
  Database,
  Star,
  Plug,
  Copy,
  Zap,
  RefreshCw,
} from 'lucide-react'

export function IconClose({ size }: { size?: number }) {
  return <X size={size || 16} strokeWidth={1.5} />
}

export function IconMinimize({ size }: { size?: number }) {
  return <Minus size={size || 16} strokeWidth={1.5} />
}

export function IconMaximize({ size }: { size?: number }) {
  return <Square size={size || 16} strokeWidth={1.5} />
}

export function IconPlus({ size }: { size?: number }) {
  return <Plus size={size || 16} strokeWidth={1.5} />
}

export function IconChevronRight({ size }: { size?: number }) {
  return <ChevronRight size={size || 16} strokeWidth={1.5} />
}

export function IconChevronDown({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return <ChevronDown size={size || 16} strokeWidth={1.5} className={className} style={style} />
}

export function IconFolder({ size }: { size?: number }) {
  return <Folder size={size || 16} strokeWidth={1.5} />
}

export function IconFile({ size }: { size?: number }) {
  return <File size={size || 16} strokeWidth={1.5} />
}

export function IconCircle({ size, filled }: { size?: number; filled?: boolean }) {
  return <Circle size={size || 16} strokeWidth={1.5} fill={filled ? 'currentColor' : 'none'} />
}

export function IconRestore({ size }: { size?: number }) {
  return <Copy size={size || 16} strokeWidth={1.5} />
}

export function IconTrash({ size }: { size?: number }) {
  return <Trash2 size={size || 16} strokeWidth={1.5} />
}

export function IconSidebar({ size }: { size?: number }) {
  return <PanelLeft size={size || 16} strokeWidth={1.5} />
}

export function IconChatLayout({ size }: { size?: number }) {
  return <MessageSquare size={size || 16} strokeWidth={1.5} />
}

export function IconSplitLayout({ size }: { size?: number }) {
  return <Columns2 size={size || 16} strokeWidth={1.5} />
}

export function IconCode({ size }: { size?: number }) {
  return <Code size={size || 16} strokeWidth={1.5} />
}

export function IconFilesLayout({ size }: { size?: number }) {
  return <FolderOpen size={size || 16} strokeWidth={1.5} />
}

export function IconEdit({ size }: { size?: number }) {
  return <Pencil size={size || 16} strokeWidth={1.5} />
}

export function IconServer({ size }: { size?: number }) {
  return <Server size={size || 16} strokeWidth={1.5} />
}

export function IconBot({ size }: { size?: number }) {
  return <Bot size={size || 16} strokeWidth={1.5} />
}

export function IconShield({ size }: { size?: number }) {
  return <ShieldCheck size={size || 16} strokeWidth={1.5} />
}

export function IconDatabase({ size }: { size?: number }) {
  return <Database size={size || 16} strokeWidth={1.5} />
}

export function IconStar({ size }: { size?: number }) {
  return <Star size={size || 16} strokeWidth={1.5} />
}

export function IconPlug({ size }: { size?: number }) {
  return <Plug size={size || 16} strokeWidth={1.5} />
}

export function IconZap({ size }: { size?: number }) {
  return <Zap size={size || 16} strokeWidth={1.5} />
}

export function IconRefresh({ size }: { size?: number }) {
  return <RefreshCw size={size || 16} strokeWidth={1.5} />
}
