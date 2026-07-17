import { useState, useEffect, useCallback } from 'react'
import { App } from '../../../bindings/monika'
import { IconDatabase, IconRefresh, IconZap, IconPlus, IconChevronDown, IconChevronRight } from '../Icons'
import { Button, IconButton, Select, Input, StatusDot, Badge } from '../ui'
import type { StatusColor } from '../ui'
import { SettingsTabHeader, SettingsCardList, SettingsCard, SettingsEmptyState } from './shared'

type DBConn = {
  name: string
  driver: string
  source: string
  status: string
  error?: string
}

const DRIVERS = ['postgres', 'mysql', 'sqlite', 'redis', 'mongo']

function statusDotColor(status: string): StatusColor {
  if (status === 'connected') return 'success'
  if (status === 'error' || status === 'unavailable') return 'error'
  return 'warning'
}

function statusBadgeVariant(status: string): 'success' | 'error' | 'warning' {
  if (status === 'connected') return 'success'
  if (status === 'error' || status === 'unavailable') return 'error'
  return 'warning'
}

function statusLabel(status: string): string {
  if (status === 'connected') return 'connected'
  if (status === 'error') return 'error'
  if (status === 'unavailable') return 'unavailable'
  return 'available'
}

function ConnectionCard({ conn, onTest, testState }: {
  conn: DBConn
  onTest: () => void
  testState: { loading: boolean; result?: string; error?: string }
}) {
  return (
    <SettingsCard
      hoverActions={
        <IconButton
          label={`Test ${conn.name}`}
          size="sm"
          onClick={onTest}
          disabled={testState.loading}
        >
          {testState.loading ? <IconRefresh size={12} /> : <IconZap size={12} />}
        </IconButton>
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0" style={{ color: 'var(--text-dim)' }}>
          <IconDatabase size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-[14px] font-semibold text-[var(--text-primary)]">{conn.name}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
              }}
            >
              {conn.driver}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px]">
              <StatusDot color={statusDotColor(conn.status)} />
              <Badge variant={statusBadgeVariant(conn.status)} size="sm">{statusLabel(conn.status)}</Badge>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-dim)]">
            <span className="font-mono text-[11px]">{conn.source}</span>
          </div>
          {conn.error && (
            <div className="mt-1 text-[10px] text-[var(--red)]">{conn.error}</div>
          )}
          {testState.result && (
            <div className="mt-1 text-[10px] text-[var(--green)]">{testState.result}</div>
          )}
          {testState.error && (
            <div className="mt-1 text-[10px] text-[var(--red)]">{testState.error}</div>
          )}
        </div>
      </div>
    </SettingsCard>
  )
}

export default function DatabasesTab() {
  const [connections, setConnections] = useState<DBConn[]>([])
  const [loading, setLoading] = useState(false)
  const [testStates, setTestStates] = useState<Record<string, { loading: boolean; result?: string; error?: string }>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDriver, setAddDriver] = useState('postgres')
  const [addDSN, setAddDSN] = useState('')
  const [addError, setAddError] = useState('')

  const loadConnections = useCallback(async () => {
    try {
      const conns = await App.ListDatabaseConnections() as unknown as DBConn[]
      setConnections(conns || [])
    } catch {
      setConnections([])
    }
  }, [])

  useEffect(() => { loadConnections() }, [loadConnections])

  const handleRescan = useCallback(async () => {
    setLoading(true)
    try {
      const conns = await App.RescanDatabases() as unknown as DBConn[]
      setConnections(conns || [])
    } catch (e: any) {
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTest = useCallback(async (name: string) => {
    setTestStates((s) => ({ ...s, [name]: { loading: true } }))
    try {
      await App.TestDatabaseConnection(JSON.stringify({ Name: name }))
      setTestStates((s) => ({ ...s, [name]: { loading: false, result: 'Connection OK' } }))
    } catch (e: any) {
      setTestStates((s) => ({ ...s, [name]: { loading: false, error: e?.message || 'Connection failed' } }))
    }
  }, [])

  return (
    <div>
      <SettingsTabHeader
        title="Databases"
        description="Discovered database connections"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRescan}
              disabled={loading}
            >
              <IconRefresh size={12} />
              {loading ? 'Scanning...' : 'Rescan'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdd((v) => !v)}
            >
              {showAdd ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
              Add
            </Button>
          </>
        }
      />

      {showAdd && (
        <div
          className="rounded-lg px-4 py-3 mb-4 space-y-3"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <Input
              value={addName}
              onChange={(e) => { setAddName(e.target.value); setAddError('') }}
              placeholder="Connection name"
              className="flex-1 font-mono"
            />
            <Select
              value={addDriver}
              onChange={(e) => setAddDriver(e.target.value)}
              className="w-auto"
            >
              {DRIVERS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Input
              value={addDSN}
              onChange={(e) => { setAddDSN(e.target.value); setAddError('') }}
              placeholder="DSN (e.g. postgres://user:pass@localhost:5432/dbname)"
              className="flex-1 font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Manual connections coming soon"
            >
              <IconPlus size={12} />
              Add
            </Button>
            <span className="text-[10px] text-[var(--text-dim)] self-center italic">Coming soon</span>
          </div>
          {addError && (
            <p className="text-[11px] text-[var(--red)] m-0">{addError}</p>
          )}
        </div>
      )}

      {connections.length === 0 ? (
        <SettingsEmptyState
          icon={<IconDatabase size={32} />}
          title="No databases discovered."
          description='Click "Rescan" to detect databases.'
        />
      ) : (
        <SettingsCardList>
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.name}
              conn={conn}
              onTest={() => handleTest(conn.name)}
              testState={testStates[conn.name] || { loading: false }}
            />
          ))}
        </SettingsCardList>
      )}
    </div>
  )
}
