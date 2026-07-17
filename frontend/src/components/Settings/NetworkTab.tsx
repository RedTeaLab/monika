import { useState, useEffect, useCallback } from 'react'
import { Call } from '@wailsio/runtime'
import { useStore } from '../../store'
import type { ProxyConfig } from '../../store'
import { Input, Switch, Button } from '../ui'
import { SettingsTabHeader } from './shared'

const labelCls = 'block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5'
export default function NetworkTab() {
    const loadProxyConfig = useStore(s => s.loadProxyConfig)
    const saveProxyConfig = useStore(s => s.saveProxyConfig)

    const [enabled, setEnabled] = useState(false)
    const [url, setUrl] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

    useEffect(() => {
        loadProxyConfig().then((cfg: ProxyConfig) => {
            setEnabled(cfg.enabled || false)
            setUrl(cfg.url || '')
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [loadProxyConfig])

    const handleSave = useCallback(async () => {
        setSaving(true)
        setError('')
        setSaved(false)
        setTestResult(null)
        try {
            await saveProxyConfig({ enabled, url: url.trim() })
            setSaved(true)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save')
        } finally {
            setSaving(false)
        }
    }, [enabled, url, saveProxyConfig])

    const handleTest = useCallback(async () => {
        setTesting(true)
        setTestResult(null)
        try {
            const result = await Call.ByName('monika/internal/api.App.TestProxyConnection') as string
            setTestResult({ ok: true, msg: result })
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Connection failed'
            setTestResult({ ok: false, msg })
        } finally {
            setTesting(false)
        }
    }, [])

    if (loading) {
        return <div className="text-[12px] text-[var(--text-dim)]">Loading...</div>
    }


    return (
        <div>
            <SettingsTabHeader
                title="Network"
                description="Configure proxy and connection settings"
            />

            <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--bg-card)' }}>
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">Enable Proxy</span>
                        <p className="text-[11px] text-[var(--text-dim)] m-0 mt-0.5">Route all HTTP requests through a proxy server.</p>
                    </div>
                    <Switch checked={enabled} onChange={setEnabled} aria-label="Toggle proxy" />
                </div>

                {enabled && (
                    <div>
                        <label className={labelCls}>Proxy URL</label>
                        <Input
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            placeholder="http://127.0.0.1:10808"
                        />
                        <p className="text-[10px] text-[var(--text-dim)] m-0 mt-1">
                            HTTP proxy (CONNECT). Example: http://127.0.0.1:10808
                        </p>
                    </div>
                )}

                {error && <p className="text-[11px] text-[var(--red)] m-0">{error}</p>}
                {saved && !testResult && <p className="text-[11px] m-0" style={{ color: 'var(--green)' }}>Proxy settings saved.</p>}

                {testResult && (
                    <p className="text-[11px] m-0" style={{ color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
                        {testResult.msg}
                    </p>
                )}

                <div className="flex justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTest}
                        disabled={testing}
                    >
                        {testing ? 'Testing...' : 'Test Connection'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
