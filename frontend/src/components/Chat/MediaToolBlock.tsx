import React, { useEffect, useState } from 'react'
import MarkdownBlock from './MarkdownBlock'
import { IconVideo, IconImage, IconFileText, IconMusic, IconChevronDown, IconChevronRight, IconClock, IconPlay } from '../Icons'
import { Call } from '@wailsio/runtime'
import { useStore } from '../../store'

interface ToolCall {
    id?: string
    name: string
    input: string
    output?: string
    status: 'running' | 'done' | 'error'
}

interface VideoResult {
    filePath?: string
    fileName?: string
    duration_seconds?: number
    frame_count?: number
    frame_interval_seconds?: number
    question?: string
    summary?: string
    timeline?: { t: number; what: string }[]
    key_moments?: { t: number; title: string; description: string }[]
    thumbnails?: { t: number; url: string }[]
    // image_understand uses these instead of thumbnails[]/timeline
    mimeType?: string
    size?: number
    thumbnail?: string
    error?: string
}

// Header style mirrors the existing ToolBlock badge conventions so media tools
// feel native alongside the other tool outputs in the chat stream.
const MEDIA_STYLE: Record<string, { color: string; label: string }> = {
    video_understand: { color: 'var(--purple)', label: 'video' },
    image_understand: { color: 'var(--blue)', label: 'image' },
    pdf_understand: { color: 'var(--yellow)', label: 'pdf' },
    audio_understand: { color: 'var(--green)', label: 'audio' },
}

const HEADER_BG = 'var(--bg-sidebar)'
const BORDER = '1px solid var(--border)'

interface MediaToolBlockProps {
    tool: ToolCall
    onOpenMedia?: (filePath: string, fileName: string, mime: string) => void
}

function formatDuration(seconds?: number): string {
    if (!seconds || !isFinite(seconds)) return '—'
    if (seconds >= 60) {
        const m = Math.floor(seconds / 60)
        const s = Math.round(seconds % 60)
        return `${m}m ${s}s`
    }
    return `${seconds.toFixed(0)}s`
}

function formatTimestamp(t: number): string {
    const mm = Math.floor(t / 60)
    const ss = Math.floor(t % 60)
    return `${mm}:${ss.toString().padStart(2, '0')}`
}

export function MediaToolBlock({ tool, onOpenMedia }: MediaToolBlockProps) {
    const isVideo = tool.name === 'video_understand'
    const isImage = tool.name === 'image_understand'
    const isPdf = tool.name === 'pdf_understand'
    const isAudio = tool.name === 'audio_understand'
    if (!isVideo && !isImage && !isPdf && !isAudio) return null

    const isRunning = tool.status === 'running'
    const isError = tool.status === 'error'
    const style = MEDIA_STYLE[tool.name] || MEDIA_STYLE.video_understand

    // Live progress text from the streaming tool. Empty when not running
    // or when no EventToolProgress has arrived yet for this tool id.
    const progress = useStore(s => (tool.id ? s.toolProgress[tool.id] : '') || '')

    let parsed: VideoResult | null = null
    if (tool.output && !isRunning) {
        try {
            parsed = JSON.parse(tool.output) as VideoResult
        } catch {
            parsed = null
        }
    }

    const handleOpenMedia = () => {
        if (!parsed?.filePath || !onOpenMedia) return
        // Fall back to a per-tool default only when parsed.mimeType
        // is missing entirely. The video tool currently reports
        // video/mp4 for everything (a known issue), so this still
        // works for the common cases (mp4, png, jpg, webp, gif);
        // webm/mov/heic get the right MIME from the upload path.
        const mime = parsed.mimeType || (isVideo ? 'video/mp4' : isPdf ? 'application/pdf' : isAudio ? 'audio/mpeg' : 'image/png')
        onOpenMedia(parsed.filePath, parsed.fileName || 'media', mime)
    }

    return (
        <div
            className="rounded-md overflow-hidden text-[13px]"
            style={{ background: HEADER_BG, border: BORDER }}
        >
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: isRunning || (parsed && !isError) ? BORDER : 'none' }}>
                {isVideo ? <IconVideo size={14} style={{ color: style.color }} /> : isPdf ? <IconFileText size={14} style={{ color: style.color }} /> : isAudio ? <IconMusic size={14} style={{ color: style.color }} /> : <IconImage size={14} style={{ color: style.color }} />}
                <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wide"
                    style={{ background: 'rgba(255,255,255,0.04)', color: style.color, border: `1px solid ${style.color}40` }}
                >
                    {style.label}
                </span>
                <span className="font-medium truncate flex-1" style={{ color: 'var(--text)' }}>
                    {parsed?.fileName || (isVideo ? 'Video' : isPdf ? 'PDF' : isAudio ? 'Audio' : 'Image')}
                </span>
                {parsed?.duration_seconds != null && isVideo && (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                        <IconClock size={11} />
                        {formatDuration(parsed.duration_seconds)}
                    </span>
                )}
                {parsed?.filePath && onOpenMedia && !isRunning && (
                    <button
                        type="button"
                        onClick={handleOpenMedia}
                        className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        style={{ color: 'var(--text-dim)', border: BORDER }}
                        title="Open in preview panel"
                    >
                        Open
                    </button>
                )}
                <span
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: isError ? 'var(--red)' : isRunning ? 'var(--yellow)' : 'var(--text-dim)' }}
                >
                    {isError ? 'error' : isRunning ? 'analyzing…' : 'done'}
                </span>
            </div>

            {(isRunning || isError || parsed || tool.output) && (
                <div className="px-3 py-2.5">
                    {isRunning && <RunningState isVideo={isVideo} parsed={parsed} progress={progress} />}
                    {isError && <ErrorState output={tool.output} />}
                    {!isRunning && !isError && parsed && (
                        <ResultState toolName={tool.name} parsed={parsed} onOpenMedia={onOpenMedia} />
                    )}
                    {!isRunning && !isError && !parsed && tool.output && (
                        <div className="text-[13px]" style={{ color: 'var(--text)' }}>
                            <MarkdownBlock content={tool.output} streaming={false} />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function RunningState({ isVideo, parsed, progress }: { isVideo: boolean; parsed: VideoResult | null; progress?: string }) {
    // When live progress messages arrive from the streaming tool, show
    // the most recent one instead of the generic phase text. Falls
    // back to the static phase until the first progress event lands.
    const phase = isVideo
        ? (progress || 'Sampling key frames and analyzing with vision model…')
        : (progress || 'Analyzing image…')
    return (
        <div className="flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
            <SpinnerDot />
            <span className="whitespace-pre-wrap">{phase}</span>
            {parsed?.frame_count != null && !isVideo && (
                <span className="text-[10px] ml-1" style={{ color: 'var(--text-faint, var(--text-dim))' }}>
                    ({parsed.frame_count} frames)
                </span>
            )}
        </div>
    )
}

function SpinnerDot() {
    return (
        <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: 'var(--accent)', animation: 'label-blink 1.4s ease-in-out infinite' }}
        />
    )
}

function ErrorState({ output }: { output?: string }) {
    let msg = output || 'Tool failed'
    try {
        const j = JSON.parse(output || '{}')
        if (j && typeof j.error === 'string') msg = j.error
    } catch { /* keep raw */ }
    return (
        <div className="text-[12px]" style={{ color: 'var(--red)' }}>
            {msg}
        </div>
    )
}

interface ResultStateProps {
    toolName: string
    parsed: VideoResult
    onOpenMedia?: (filePath: string, fileName: string, mime: string) => void
}

function ResultState({ toolName, parsed, onOpenMedia }: ResultStateProps) {
    if (toolName === 'image_understand') {
        return <ImageResult parsed={parsed} onOpenMedia={onOpenMedia} />
    }
    if (toolName === 'pdf_understand') {
        return <PdfResult parsed={parsed} onOpenMedia={onOpenMedia} />
    }
    if (toolName === 'audio_understand') {
        return <AudioResult parsed={parsed} onOpenMedia={onOpenMedia} />
    }
    return <VideoResultView parsed={parsed} onOpenMedia={onOpenMedia} />
}

function ImageResult({ parsed, onOpenMedia }: { parsed: VideoResult; onOpenMedia?: (filePath: string, fileName: string, mime: string) => void }) {
    // No need to fetch base64 — the /__media__ endpoint streams the file directly
    const thumb = parsed.filePath ? `/__media__?path=${encodeURIComponent(parsed.filePath)}` : null

    const handleClick = () => {
        if (parsed.filePath && onOpenMedia) {
            onOpenMedia(parsed.filePath, parsed.fileName || 'image', parsed.mimeType || 'image/png')
        }
    }
    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={handleClick}
                className="block w-full rounded overflow-hidden text-left"
                style={{ background: 'rgba(255,255,255,0.02)', maxHeight: 240, cursor: onOpenMedia ? 'zoom-in' : 'default', border: 0, padding: 0 }}
                disabled={!onOpenMedia}
            >
                {thumb && (
                    <img src={thumb} alt={parsed.fileName || 'image'} style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block' }} />
                )}
            </button>
            {parsed.summary && (
                <MarkdownBlock content={parsed.summary} streaming={false} />
            )}
        </div>
    )
}

function PdfResult({ parsed, onOpenMedia }: { parsed: VideoResult; onOpenMedia?: (filePath: string, fileName: string, mime: string) => void }) {
    return (
        <div className="space-y-2">
            {parsed.filePath && (
                <iframe
                    src={`/__media__?path=${encodeURIComponent(parsed.filePath)}`}
                    style={{ width: '100%', height: 400, border: BORDER, borderRadius: 4 }}
                    title={parsed.fileName || 'PDF'}
                />
            )}
            {parsed.summary && (
                <MarkdownBlock content={parsed.summary} streaming={false} />
            )}
        </div>
    )
}

function AudioResult({ parsed, onOpenMedia }: { parsed: VideoResult; onOpenMedia?: (filePath: string, fileName: string, mime: string) => void }) {
    return (
        <div className="space-y-2">
            {parsed.filePath && (
                <audio
                    controls
                    src={`/__media__?path=${encodeURIComponent(parsed.filePath)}`}
                    style={{ width: '100%' }}
                />
            )}
            {parsed.summary && (
                <MarkdownBlock content={parsed.summary} streaming={false} />
            )}
        </div>
    )
}

function VideoResultView({ parsed, onOpenMedia }: { parsed: VideoResult; onOpenMedia?: (filePath: string, fileName: string, mime: string) => void }) {
    return (
        <div className="space-y-3">
            <LazyThumbStrip
                filePath={parsed.filePath}
                fileName={parsed.fileName || 'video'}
                mime={parsed.mimeType || 'video/mp4'}
                onOpenMedia={onOpenMedia}
            />
            {parsed.summary && (
                <div>
                    <MarkdownBlock content={parsed.summary} streaming={false} />
                </div>
            )}
            {parsed.key_moments && parsed.key_moments.length > 0 && (
                <CollapsibleSection title={`Key moments (${parsed.key_moments.length})`} defaultOpen>
                    <ul className="space-y-2">
                        {parsed.key_moments.map((km, i) => (
                            <li key={i} className="flex gap-2 items-start text-[12px]">
                                <span
                                    className="font-mono text-[10px] px-1 py-0.5 rounded shrink-0 mt-0.5"
                                    style={{ background: 'rgba(135,123,181,0.08)', color: 'var(--purple)', border: '1px solid rgba(135,123,181,0.2)' }}
                                >
                                    {formatTimestamp(km.t)}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium" style={{ color: 'var(--text)' }}>{km.title}</div>
                                    {km.description && (
                                        <div style={{ color: 'var(--text-dim)' }}>{km.description}</div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </CollapsibleSection>
            )}
            {parsed.timeline && parsed.timeline.length > 0 && (
                <CollapsibleSection title={`Timeline (${parsed.timeline.length})`}>
                    <ul className="space-y-1">
                        {parsed.timeline.map((tl, i) => (
                            <li key={i} className="flex gap-2 items-baseline text-[12px]">
                                <span
                                    className="font-mono text-[10px] shrink-0"
                                    style={{ color: 'var(--text-faint, var(--text-dim))', minWidth: 38 }}
                                >
                                    {formatTimestamp(tl.t)}
                                </span>
                                <span style={{ color: 'var(--text-dim)' }}>{tl.what}</span>
                            </li>
                        ))}
                    </ul>
                </CollapsibleSection>
            )}
        </div>
    )
}

// LazyThumbStrip loads frame thumbnails via App.GetMediaThumbnails the
// first time the user expands the section, rather than embedding them
// in the LLM-facing tool result. This keeps the conversation cheap —
// each call would otherwise burn ~50-100k tokens of base64 JPEG noise
// the model has no use for.
function LazyThumbStrip({ filePath, fileName, mime, onOpenMedia }: {
    filePath?: string
    fileName: string
    mime: string
    onOpenMedia?: (filePath: string, fileName: string, mime: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [thumbs, setThumbs] = useState<{ t: number; url: string }[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const projectPath = useStore(s => s.projectPath)

    useEffect(() => {
        if (!open || thumbs !== null || !filePath) return
        if (!projectPath) {
            setError('No project open')
            return
        }
        setLoading(true)
        Call.ByName('monika/internal/api.App.GetMediaThumbnails', projectPath, filePath, 8)
            .then((res: any) => {
                if (Array.isArray(res)) {
                    setThumbs(res.map((r: any) => ({ t: r.t ?? 0, url: r.url ?? '' })))
                } else {
                    setThumbs([])
                }
            })
            .catch((e: any) => setError(e?.message || 'failed to load thumbnails'))
            .finally(() => setLoading(false))
    }, [open, thumbs, filePath, projectPath])

    if (!filePath) return null

    return (
        <div className="rounded" style={{ border: BORDER }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-dim)', background: 'rgba(255,255,255,0.02)', border: 0 }}
            >
                {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                Thumbnails
            </button>
            {open && (
                <div className="px-2 py-2">
                    {loading && <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>Loading…</span>}
                    {error && <span className="text-[11px]" style={{ color: 'var(--red)' }}>{error}</span>}
                    {thumbs && thumbs.length > 0 && (
                        <ThumbStrip
                            thumbs={thumbs}
                            onOpen={() => onOpenMedia && onOpenMedia(filePath, fileName, mime)}
                        />
                    )}
                    {thumbs && thumbs.length === 0 && !loading && !error && (
                        <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>No frames sampled.</span>
                    )}
                </div>
            )}
        </div>
    )
}

function ThumbStrip({ thumbs, onOpen }: { thumbs: { t: number; url: string }[]; onOpen: () => void }) {
    return (
        <div
            className="flex gap-1.5 overflow-x-auto py-1"
            style={{ scrollbarWidth: 'thin' }}
        >
            {thumbs.map((th, i) => (
                <ThumbCell key={i} t={th.t} url={th.url} onOpen={onOpen} />
            ))}
        </div>
    )
}

function ThumbCell({ t, url, onOpen }: { t: number; url: string; onOpen: () => void }) {
    const [hover, setHover] = useState(false)
    return (
        <button
            type="button"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={onOpen}
            className="relative shrink-0 rounded overflow-hidden group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{
                width: 110, height: 64,
                background: 'rgba(255,255,255,0.04)',
                border: BORDER,
                cursor: 'pointer',
                padding: 0,
            }}
            title={`Open video (frame at ${formatTimestamp(t)})`}
        >
            <img src={url} alt={`Frame at ${formatTimestamp(t)}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span
                className="absolute bottom-0 left-0 right-0 text-[9px] font-mono text-center py-0.5"
                style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}
            >
                {formatTimestamp(t)}
            </span>
            {hover && (
                <span
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ background: 'rgba(0,0,0,0.4)' }}
                >
                    <IconPlay size={18} />
                </span>
            )}
        </button>
    )
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="rounded" style={{ border: BORDER }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-dim)', background: 'rgba(255,255,255,0.02)', border: 0 }}
            >
                {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                {title}
            </button>
            {open && <div className="px-2 py-2">{children}</div>}
        </div>
    )
}

export default MediaToolBlock
