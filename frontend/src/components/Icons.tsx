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
    CircleDot,
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
    Pin,
    Inbox,
    Plug,
    Copy,
    Zap,
    RefreshCw,
    Info,
    Eye,
    Search,
    FilePlus,
    FolderPlus,
    ClipboardPaste,
    Files,
    PencilLine,
    ExternalLink,
    Check,
    Send,
    Maximize2,
    Minimize2,
    CheckCircle,
    XCircle,
    HardDrive,
    FolderUp,
    BookOpen,
    Play,
    Pause,
    ListOrdered,
    SkipForward,
    Clock,
    Film,
    ImageIcon,
    Paperclip,
    FileText,
    CornerDownLeft,
    Music,
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

export function IconFolder({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return <Folder size={size || 16} strokeWidth={1.5} className={className} style={style} />
}

export function IconFile({ size }: { size?: number }) {
    return <File size={size || 16} strokeWidth={1.5} />
}

export function IconCircle({ size, filled, className, style }: { size?: number; filled?: boolean; className?: string; style?: React.CSSProperties }) {
    return <Circle size={size || 16} strokeWidth={1.5} fill={filled ? 'currentColor' : 'none'} className={className} style={style} />
}

export function IconCircleDot({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return <CircleDot size={size || 16} strokeWidth={1.5} className={className} style={style} />
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

export function IconPin({ size, filled }: { size?: number; filled?: boolean }) {
    return <Pin size={size || 16} strokeWidth={1.5} fill={filled ? 'currentColor' : 'none'} />
}

export function IconInbox({ size }: { size?: number }) {
    return <Inbox size={size || 16} strokeWidth={1.5} />
}

export function IconStar({ size, filled }: { size?: number; filled?: boolean }) {
    return <Star size={size || 16} strokeWidth={1.5} fill={filled ? 'currentColor' : 'none'} />
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

export function IconInfo({ size }: { size?: number }) {
    return <Info size={size || 16} strokeWidth={1.5} />
}

export function IconEye({ size }: { size?: number }) {
    return <Eye size={size || 16} strokeWidth={1.5} />
}

export function IconSearch({ size }: { size?: number }) {
    return <Search size={size || 16} strokeWidth={1.5} />
}

export function IconFilePlus({ size }: { size?: number }) {
    return <FilePlus size={size || 16} strokeWidth={1.5} />
}

export function IconFolderPlus({ size }: { size?: number }) {
    return <FolderPlus size={size || 16} strokeWidth={1.5} />
}

export function IconClipboardPaste({ size }: { size?: number }) {
    return <ClipboardPaste size={size || 16} strokeWidth={1.5} />
}

export function IconFiles({ size }: { size?: number }) {
    return <Files size={size || 16} strokeWidth={1.5} />
}

export function IconPencilLine({ size }: { size?: number }) {
    return <PencilLine size={size || 16} strokeWidth={1.5} />
}

export function IconExternalLink({ size }: { size?: number }) {
    return <ExternalLink size={size || 16} strokeWidth={1.5} />
}

export function IconCheck({ size }: { size?: number }) {
    return <Check size={size || 16} strokeWidth={1.5} />
}

export function IconSend({ size }: { size?: number }) {
    return <Send size={size || 16} strokeWidth={1.5} />
}

export function IconMaximize2({ size }: { size?: number }) {
    return <Maximize2 size={size || 16} strokeWidth={1.5} />
}

export function IconMinimize2({ size }: { size?: number }) {
    return <Minimize2 size={size || 16} strokeWidth={1.5} />
}

export function IconCheckCircle({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return <CheckCircle size={size || 16} strokeWidth={1.5} className={className} style={style} />
}

export function IconXCircle({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return <XCircle size={size || 16} strokeWidth={1.5} className={className} style={style} />
}

export function IconHardDrive({ size }: { size?: number }) {
    return <HardDrive size={size || 16} strokeWidth={1.5} />
}

export function IconFolderUp({ size }: { size?: number }) {
    return <FolderUp size={size || 16} strokeWidth={1.5} />
}

export function IconBookOpen({ size }: { size?: number }) {
    return <BookOpen size={size || 16} strokeWidth={1.5} />
}

export function IconPlay({ size }: { size?: number }) {
    return <Play size={size || 16} strokeWidth={1.5} />
}

export function IconPause({ size }: { size?: number }) {
    return <Pause size={size || 16} strokeWidth={1.5} />
}

export function IconListOrdered({ size }: { size?: number }) {
    return <ListOrdered size={size || 16} strokeWidth={1.5} />
}

export function IconSkipForward({ size }: { size?: number }) {
    return <SkipForward size={size || 16} strokeWidth={1.5} />
}

export function IconClock({ size }: { size?: number }) {
    return <Clock size={size || 16} strokeWidth={1.5} />
}

export function IconVideo({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return <Film size={size || 16} strokeWidth={1.5} className={className} style={style} />
}

export function IconImage({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return <ImageIcon size={size || 16} strokeWidth={1.5} className={className} style={style} />
}

export function IconPaperclip({ size }: { size?: number }) {
    return <Paperclip size={size || 16} strokeWidth={1.5} />
}

export function IconFileText({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return <FileText size={size || 16} strokeWidth={1.5} className={className} style={style} />
}

export function IconMusic({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return <Music size={size || 16} strokeWidth={1.5} className={className} style={style} />
}

export function IconCornerDownLeft({ size }: { size?: number }) {
    return <CornerDownLeft size={size || 16} strokeWidth={1.5} />
}
