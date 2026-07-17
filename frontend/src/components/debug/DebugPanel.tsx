import React, { useCallback } from 'react'
import { Call } from '@wailsio/runtime'
import { useDebugState } from './useDebugState'
import { IconButton } from '../ui'

function AccordionSection({
    label,
    count,
    expanded,
    onToggle,
    children,
}: {
    label: string
    count?: number
    expanded: boolean
    onToggle: () => void
    children: React.ReactNode
}) {
    return (
        <div style={{ borderBottom: '1px solid var(--border)' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    background: 'var(--bg-sidebar)',
                }}
                onClick={onToggle}
            >
                <span style={{
                    fontSize: '10px',
                    marginRight: '5px',
                    transition: 'transform 0.15s',
                    transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    display: 'inline-block',
                }}>
                    ▸
                </span>
                {label}
                {count !== undefined && (
                    <span style={{ marginLeft: '6px', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {count}
                    </span>
                )}
            </div>
            {expanded && (
                <div style={{ overflow: 'auto', maxHeight: '280px' }}>
                    {children}
                </div>
            )}
        </div>
    )
}

const dimText: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
}

export default function DebugPanel() {
    const {
        activeSession,
        activeSessionId,
        frames,
        variables,
        breakpoints,
        threads,
        activeFrameId,
        setActiveFrame,
        refreshState,
    } = useDebugState()

    const noSession = !activeSession || activeSession.status === 'terminated'

    const handleContinue = useCallback(async () => {
        if (!activeSessionId) return
        try {
            await Call.ByName('monika/internal/api.App.DebugContinue', activeSessionId)
            await refreshState()
        } catch { }
    }, [activeSessionId, refreshState])

    const handleStepOver = useCallback(async () => {
        if (!activeSessionId) return
        try {
            await Call.ByName('monika/internal/api.App.DebugStepOver', activeSessionId)
            await refreshState()
        } catch { }
    }, [activeSessionId, refreshState])

    const handleStepIn = useCallback(async () => {
        if (!activeSessionId) return
        try {
            await Call.ByName('monika/internal/api.App.DebugStepIn', activeSessionId)
            await refreshState()
        } catch { }
    }, [activeSessionId, refreshState])

    const handleStepOut = useCallback(async () => {
        if (!activeSessionId) return
        try {
            await Call.ByName('monika/internal/api.App.DebugStepOut', activeSessionId)
            await refreshState()
        } catch { }
    }, [activeSessionId, refreshState])

    const handleStop = useCallback(async () => {
        if (!activeSessionId) return
        try {
            await Call.ByName('monika/internal/api.App.DebugStop', activeSessionId)
            await refreshState()
        } catch { }
    }, [activeSessionId, refreshState])

    const handleRemoveBreakpoint = useCallback(async (file: string, line: number) => {
        if (!activeSessionId) return
        try {
            await Call.ByName('monika/internal/api.App.DebugRemoveBreakpoint', activeSessionId, file, line)
        } catch { }
    }, [activeSessionId])

    const isStopped = activeSession?.status === 'stopped'
    const isRunning = activeSession?.status === 'running'

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Toolbar */}
            {!noSession && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: 'var(--bg-card)',
                    borderBottom: '1px solid var(--border)',
                    flexWrap: 'wrap',
                }}>
                    <span style={{
                        color: isStopped ? '#f0c040' : isRunning ? '#4ec94e' : 'var(--text-dim)',
                        fontSize: '10px',
                        fontWeight: 600,
                        marginRight: '4px',
                    }}>
                        {activeSession.status}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '10px', marginRight: 'auto' }}>
                        {activeSession.adapter}
                    </span>

                    <IconButton label="Continue" size="sm" disabled={!isStopped} onClick={handleContinue}>▶</IconButton>
                    <IconButton label="Step Over" size="sm" disabled={!isStopped} onClick={handleStepOver}>↘</IconButton>
                    <IconButton label="Step In" size="sm" disabled={!isStopped} onClick={handleStepIn}>↓</IconButton>
                    <IconButton label="Step Out" size="sm" disabled={!isStopped} onClick={handleStepOut}>↑</IconButton>
                    <IconButton label="Stop" size="sm" variant="destructive" onClick={handleStop}>■</IconButton>
                </div>
            )}

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                {noSession ? (
                    <div style={{
                        padding: '16px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                    }}>
                        No active debug session
                    </div>
                ) : (
                    <>
                        {/* Stop location */}
                        {activeSession.stopReason && (
                            <div style={{
                                padding: '3px 10px',
                                fontSize: '10px',
                                color: 'var(--text-dim)',
                                borderBottom: '1px solid var(--border)',
                                background: 'var(--bg-hover)',
                            }}>
                                {activeSession.stopReason}
                                {activeSession.source && (
                                    <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>
                                        {(activeSession.source.name || activeSession.source.path?.split('/').pop())}:{activeSession.line}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Variables */}
                        <AccordionSection
                            label="VARIABLES"
                            count={variables.length}
                            expanded={true}
                            onToggle={() => { }}
                        >
                            {variables.length === 0 ? (
                                <div style={dimText}>(no variables)</div>
                            ) : (
                                variables.map((v, i) => (
                                    <div key={`v-${i}`} style={{
                                        display: 'flex',
                                        alignItems: 'baseline',
                                        padding: '1px 10px',
                                        fontSize: '11px',
                                        fontFamily: 'var(--font-mono)',
                                        gap: '8px',
                                    }}>
                                        <span style={{
                                            color: 'var(--accent)',
                                            minWidth: '60px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>{v.name}</span>
                                        <span style={{
                                            color: 'var(--text-primary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            flex: 1,
                                            whiteSpace: 'nowrap',
                                        }}>{v.value}</span>
                                        {v.type && <span style={{ color: 'var(--text-dim)', fontSize: '9px' }}>{v.type}</span>}
                                    </div>
                                ))
                            )}
                        </AccordionSection>

                        {/* Call Stack */}
                        <AccordionSection
                            label="CALL STACK"
                            count={frames.length}
                            expanded={true}
                            onToggle={() => { }}
                        >
                            {frames.length === 0 ? (
                                <div style={dimText}>(no frames)</div>
                            ) : (
                                frames.map((frame) => {
                                    const isActive = frame.id === activeFrameId
                                    const loc = frame.source
                                        ? `${frame.source.name || frame.source.path?.split('/').pop() || '?'}:${frame.line}`
                                        : `:${frame.line}`
                                    return (
                                        <div
                                            key={frame.id}
                                            onClick={() => setActiveFrame(frame.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '2px 10px',
                                                fontSize: '11px',
                                                fontFamily: 'var(--font-mono)',
                                                cursor: 'pointer',
                                                background: isActive ? 'var(--bg-active)' : 'transparent',
                                            }}
                                            title={`${frame.name} — ${frame.source?.path || ''}:${frame.line}`}
                                        >
                                            <span style={{
                                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>{frame.name}</span>
                                            <span style={{
                                                color: 'var(--text-dim)',
                                                fontSize: '10px',
                                                marginLeft: '8px',
                                                whiteSpace: 'nowrap',
                                            }}>{loc}</span>
                                        </div>
                                    )
                                })
                            )}
                        </AccordionSection>

                        {/* Breakpoints */}
                        <AccordionSection
                            label="BREAKPOINTS"
                            count={breakpoints.length}
                            expanded={breakpoints.length > 0}
                            onToggle={() => { }}
                        >
                            {breakpoints.length === 0 ? (
                                <div style={dimText}>(no breakpoints)</div>
                            ) : (
                                breakpoints.map((bp, i) => {
                                    const fileName = bp.file.split('/').pop() || bp.file
                                    return (
                                        <div
                                            key={`bp-${i}`}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '1px 10px',
                                                fontSize: '11px',
                                                fontFamily: 'var(--font-mono)',
                                                gap: '4px',
                                            }}
                                        >
                                            <span style={{
                                                color: bp.verified ? '#e51400' : 'var(--text-dim)',
                                                fontSize: '10px',
                                            }}>
                                                {bp.verified ? '●' : '○'}
                                            </span>
                                            <span style={{
                                                color: bp.verified ? '#e51400' : 'var(--text-secondary)',
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {fileName}:{bp.line}
                                            </span>
                                            <IconButton
                                                label="Remove breakpoint"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleRemoveBreakpoint(bp.file, bp.line)
                                                }}
                                            >✕</IconButton>
                                        </div>
                                    )
                                })
                            )}
                        </AccordionSection>

                        {/* Threads */}
                        {threads.length > 0 && (
                            <AccordionSection
                                label="THREADS"
                                count={threads.length}
                                expanded={false}
                                onToggle={() => { }}
                            >
                                {threads.map((t) => (
                                    <div key={t.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '1px 10px',
                                        fontSize: '11px',
                                        fontFamily: 'var(--font-mono)',
                                        gap: '6px',
                                    }}>
                                        <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>#{t.id}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{t.name}</span>
                                    </div>
                                ))}
                            </AccordionSection>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
