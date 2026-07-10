import { useState, useRef, useEffect, useCallback } from 'react'
import { KeyRound } from 'lucide-react'
import { useStore } from '../../store'
import type { CopilotLoginInfo, CopilotTokenResult } from '../../store'

type LoginState = 'idle' | 'connecting' | 'waiting' | 'success' | 'error'

interface Props {
    onToken: (accessToken: string, refreshToken: string, expiresIn: number) => void
    onError: (msg: string) => void
    existingToken?: string
}

function friendlyError(msg: string): string {
    const lower = msg.toLowerCase()
    if (lower.includes('context deadline exceeded') || lower.includes('timeout')) {
        return 'Connection timed out. Please check your network or configure a proxy in Settings > Network.'
    }
    if (lower.includes('dial tcp') || lower.includes('connectex') || lower.includes('no such host')) {
        return 'Cannot reach GitHub. If you need a proxy, configure it in Settings > Network.'
    }
    if (lower.includes('proxy')) {
        return 'Proxy connection failed. Check your proxy settings in Settings > Network.'
    }
    if (lower.includes('tls') || lower.includes('certificate')) {
        return 'TLS/certificate error. Check your system time and certificates.'
    }
    return msg
}

export function CopilotLoginSection({ onToken, onError, existingToken }: Props) {
    const [state, setState] = useState<LoginState>(existingToken ? 'success' : 'idle')
    const [loginInfo, setLoginInfo] = useState<CopilotLoginInfo | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const startCopilotLogin = useStore(s => s.startCopilotLogin)
    const pollCopilotLogin = useStore(s => s.pollCopilotLogin)

    const cleanup = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
    }, [])

    useEffect(() => cleanup, [cleanup])

    const handleLogin = useCallback(async () => {
        setState('connecting')
        setErrorMsg('')
        try {
            const info = await startCopilotLogin()
            setLoginInfo(info)
            setState('waiting')
            window.open(info.verification_uri, '_blank')

            let interval = info.interval

            const pollFn = async () => {
                try {
                    const result: CopilotTokenResult = await pollCopilotLogin(info.device_code)
                    if (result.status === 'success') {
                        cleanup()
                        setState('success')
                        onToken(result.access_token!, result.refresh_token!, result.expires_in!)
                    } else if (result.status === 'error') {
                        cleanup()
                        setState('error')
                        const msg = result.error || 'Unknown error'
                        setErrorMsg(friendlyError(msg))
                        onError(msg)
                    } else if (result.error === 'slow_down') {
                        cleanup()
                        interval += 5
                        timerRef.current = setInterval(pollFn, (interval + 1) * 1000)
                    }
                } catch {
                    // Network error on poll — keep polling silently
                }
            }

            timerRef.current = setInterval(pollFn, (interval + 1) * 1000)
        } catch (e) {
            setState('error')
            const raw = e instanceof Error ? e.message : (typeof e === 'string' ? e : 'Login failed')
            const msg = friendlyError(raw)
            setErrorMsg(msg)
            onError(msg)
        }
    }, [startCopilotLogin, pollCopilotLogin, onToken, onError, cleanup])

    if (state === 'idle') {
        return (
            <button
                onClick={handleLogin}
                className="w-full px-4 py-2.5 text-[12px] font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center gap-2"
            >
                <KeyRound size={13} strokeWidth={1.5} />
                <span>Login with GitHub</span>
            </button>
        )
    }

    if (state === 'connecting') {
        return (
            <div className="flex items-center justify-center gap-2 py-3">
                <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                <span className="text-[12px] text-[var(--text-dim)]">Connecting to GitHub...</span>
            </div>
        )
    }

    if (state === 'waiting' && loginInfo) {
        return (
            <div className="rounded-md border border-[var(--border)] p-4 space-y-2">
                <p className="text-[12px] text-[var(--text-secondary)] m-0">Enter this code on GitHub:</p>
                <div className="text-[18px] font-mono font-bold tracking-wider text-center py-2 rounded bg-[var(--bg-sidebar)]">
                    {loginInfo.user_code}
                </div>
                <p className="text-[11px] text-[var(--text-dim)] m-0 text-center">
                    Open <a href={loginInfo.verification_uri} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">{loginInfo.verification_uri}</a>
                </p>
                <div className="flex items-center justify-center gap-1.5 pt-1">
                    <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <span className="text-[11px] text-[var(--text-dim)]">Waiting for authorization...</span>
                </div>
            </div>
        )
    }

    if (state === 'success') {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--green)' }}>
                    <span>Logged in</span>
                </div>
                <button
                    onClick={handleLogin}
                    className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text-primary)] underline cursor-pointer bg-transparent border-none"
                >
                    Re-login
                </button>
            </div>
        )
    }

    // error
    return (
        <div className="space-y-2">
            <p className="text-[11px] text-[var(--red)] m-0">{errorMsg}</p>
            <button
                onClick={handleLogin}
                className="text-[11px] text-[var(--accent)] underline cursor-pointer bg-transparent border-none"
            >
                Try again
            </button>
        </div>
    )
}
