import { useState, useEffect, useCallback } from 'react'
import { useStore, SkillInfo } from '../../store'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'
import { IconStar, IconPlus, IconTrash } from '../Icons'
import { Button, IconButton, Input, Switch, Tabs, AlertDialog } from '../ui'
import { SettingsTabHeader, SettingsCardList, SettingsCard, SettingsEmptyState, SettingsScopeToggle } from './shared'

const SOURCE_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  'project-opencode': { label: 'Project', color: 'var(--accent)', bg: 'var(--accent-muted)' },
  'project-claude': { label: 'Claude', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'project-agents': { label: 'Agents', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  'global-monika': { label: 'Global', color: 'var(--green)', bg: 'rgba(34,197,94,0.1)' },
  'global-claude': { label: 'Claude', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'global-agents': { label: 'Agents', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  manual: { label: 'Manual', color: 'var(--text-dim)', bg: 'var(--bg-sidebar)' },
}

function SourceBadge({ source }: { source: string }) {
  const s = SOURCE_STYLES[source] || SOURCE_STYLES.manual
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  )
}

function SkillCard({
  skill,
  expanded,
  content,
  contentLoading,
  onUninstall,
  onOpenDir,
  onToggleEnabled,
  onClick,
}: {
  skill: SkillInfo
  expanded: boolean
  content: { content: string; files: string[] } | null
  contentLoading: boolean
  onUninstall: () => void
  onOpenDir: () => void
  onToggleEnabled: () => void
  onClick: () => void
}) {
  return (
    <SettingsCard
      interactive
      className="select-none"
      style={{ opacity: skill.enabled === false ? 0.5 : 1 }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="shrink-0 mt-0.5" style={{ color: 'var(--text-dim)' }}>
          <IconStar size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">{skill.name}</span>
            <SourceBadge source={skill.source} />
          </div>
          <p className="text-[11px] text-[var(--text-dim)] m-0 leading-snug">{skill.description}</p>
          <span
            className="inline-block font-mono truncate text-[10px] text-[var(--text-dim)] mt-1.5 underline decoration-[var(--text-dim)] underline-offset-2 hover:text-[var(--text-primary)] hover:decoration-[var(--text-primary)] cursor-pointer max-w-full"
            title={skill.path}
            onClick={(e) => { e.stopPropagation(); onOpenDir() }}
          >
            {skill.path}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Switch
              checked={skill.enabled !== false}
              onChange={onToggleEnabled}
              aria-label={skill.enabled !== false ? `Disable ${skill.name}` : `Enable ${skill.name}`}
            />
          </span>
          <IconButton
            label={`Uninstall ${skill.name}`}
            size="sm"
            variant="ghost"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onUninstall() }}
            className="text-[var(--text-dim)] hover:text-[var(--red)]"
          >
            <IconTrash size={13} />
          </IconButton>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          {contentLoading ? (
            <div className="text-[11px] text-[var(--text-dim)]">Loading...</div>
          ) : content ? (
            <>
              <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap m-0 max-h-[300px] overflow-y-auto font-mono leading-relaxed">
                {content.content}
              </pre>
              {content.files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {content.files.map((f) => (
                    <span key={f} className="text-[10px] text-[var(--text-dim)] px-1.5 py-0.5 rounded bg-[var(--bg-sidebar)] font-mono">
                      {f.split(/[/\\]/).pop()}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-[var(--text-dim)]">Failed to load content</div>
          )}
        </div>
      )}
    </SettingsCard>
  )
}

export default function SkillsTab() {
  const skills = useStore((s) => s.skills)
  const loadSkills = useStore((s) => s.loadSkills)
  const loadSkillContent = useStore((s) => s.loadSkillContent)
  const installSkillFromURL = useStore((s) => s.installSkillFromURL)
  const installSkillFromZip = useStore((s) => s.installSkillFromZip)
  const uninstallSkill = useStore((s) => s.uninstallSkill)
  const openInFileManager = useStore((s) => s.openInFileManager)
  const setSkillEnabled = useStore((s) => s.setSkillEnabled)

  const [showInstallModal, setShowInstallModal] = useState(false)
  const [installTab, setInstallTab] = useState<'github' | 'zip'>('github')
  const [installScope, setInstallScope] = useState<'project' | 'global'>('project')
  const [githubURL, setGithubURL] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')
  const [installResult, setInstallResult] = useState<string[]>([])

  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [skillContents, setSkillContents] = useState<Record<string, { content: string; files: string[] } | null>>({})
  const [loadingContents, setLoadingContents] = useState<Record<string, boolean>>({})
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null)
  const [uninstallLoading, setUninstallLoading] = useState(false)
  const [uninstallError, setUninstallError] = useState('')

  useEffect(() => { loadSkills() }, [loadSkills])

  const handleExpand = useCallback(async (name: string) => {
    if (expandedSkill === name) {
      setExpandedSkill(null)
      return
    }
    setExpandedSkill(name)
    if (!skillContents[name]) {
      setLoadingContents((prev) => ({ ...prev, [name]: true }))
      try {
        const result = await loadSkillContent(name)
        setSkillContents((prev) => ({ ...prev, [name]: result }))
      } catch {
        setSkillContents((prev) => ({ ...prev, [name]: null }))
      } finally {
        setLoadingContents((prev) => ({ ...prev, [name]: false }))
      }
    }
  }, [expandedSkill, skillContents, loadSkillContent])

  const handleInstall = useCallback(async () => {
    setInstallError('')
    setInstallResult([])
    if (installTab === 'github') {
      if (!githubURL.trim()) { setInstallError('URL is required'); return }
      setInstalling(true)
      try {
        const names = await installSkillFromURL(githubURL.trim(), installScope)
        setInstallResult(names)
        if (names.length === 0) setInstallError('No valid skills found in the repository')
      } catch (e: any) {
        setInstallError(e?.message || 'Failed to install')
      } finally {
        setInstalling(false)
      }
    } else {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.zip'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        setInstalling(true)
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1]
          try {
            const names = await installSkillFromZip(base64, installScope)
            setInstallResult(names)
            if (names.length === 0) setInstallError('No valid skills found in the archive')
          } catch (e: any) {
            setInstallError(e?.message || 'Failed to install')
          } finally {
            setInstalling(false)
          }
        }
        reader.readAsDataURL(file)
      }
      input.click()
    }
  }, [installTab, githubURL, installScope, installSkillFromURL, installSkillFromZip])

  const handleUninstall = useCallback(async (name: string) => {
    await uninstallSkill(name)
    setExpandedSkill(null)
    setSkillContents((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [uninstallSkill])

  const handleToggle = useCallback(async (name: string) => {
    await setSkillEnabled(name)
  }, [setSkillEnabled])



  return (
    <div>
      <SettingsTabHeader
        title="Skills"
        description="Discover and manage agent skills"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowInstallModal(true)
              setInstallError('')
              setInstallResult([])
              setGithubURL('')
            }}
          >
            <IconPlus size={12} /> Add
          </Button>
        }
      />

      {skills.length === 0 ? (
        <SettingsEmptyState
          icon={<IconStar size={32} />}
          title="No skills discovered."
          description='Click "Add" to add skills.'
        />
      ) : (
        <SettingsCardList>
          {skills.map((s) => (
            <SkillCard
              key={s.name}
              skill={s}
              expanded={expandedSkill === s.name}
              content={skillContents[s.name] || null}
              contentLoading={!!loadingContents[s.name]}
              onUninstall={() => setConfirmUninstall(s.name)}
              onOpenDir={() => openInFileManager(s.path)}
              onToggleEnabled={() => handleToggle(s.name)}
              onClick={() => handleExpand(s.name)}
            />
          ))}
        </SettingsCardList>
      )}

      {showInstallModal && (
        <Modal onClose={() => setShowInstallModal(false)} loading={installing} width={480}>
          <ModalHeader icon={<IconStar size={15} />}>
            <h4 className="text-[14px] font-semibold m-0">Install Skills</h4>
          </ModalHeader>
          <ModalBody>
            {/* Scope toggle */}
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-2">Scope</label>
              <SettingsScopeToggle value={installScope} onChange={setInstallScope} />
            </div>

            {/* Source tabs */}
            <div className="mb-4">
              <Tabs
                items={[{ id: 'github', label: 'GitHub URL' }, { id: 'zip', label: 'Upload ZIP' }]}
                value={installTab}
                onChange={(id) => { setInstallTab(id as 'github' | 'zip'); setInstallError(''); setInstallResult([]) }}
                variant="pills"
              />
            </div>

            {installTab === 'github' && (
              <div>
                <Input
                  placeholder="https://github.com/user/skill-repo"
                  value={githubURL}
                  onChange={(e) => setGithubURL(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {installTab === 'zip' && (
              <p className="text-[11px] text-[var(--text-dim)] m-0">Click "Select ZIP File" to browse for a skill archive.</p>
            )}

            {installError && <p className="text-[11px] text-[var(--red)] m-0 mt-3">{installError}</p>}
            {installResult.length > 0 && (
              <p className="text-[11px] m-0 mt-3" style={{ color: 'var(--green)' }}>
                Installed: {installResult.join(', ')}
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" size="sm" onClick={() => setShowInstallModal(false)} disabled={installing}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleInstall} disabled={installing || (installTab === 'github' && !githubURL.trim())} loading={installing}>
              {installing ? 'Installing...' : installTab === 'zip' ? 'Select ZIP File' : 'Install'}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      <AlertDialog
        open={!!confirmUninstall}
        title="Uninstall Skill"
        description={confirmUninstall ? `Are you sure you want to uninstall "${confirmUninstall}"?` : ''}
        confirmLabel="Uninstall"
        icon={<IconTrash size={15} />}
        variant="destructive"
        loading={uninstallLoading}
        error={uninstallError}
        onConfirm={async () => {
          if (!confirmUninstall) return
          setUninstallError('')
          setUninstallLoading(true)
          try {
            await handleUninstall(confirmUninstall)
            setSkillContents((prev) => { const next = { ...prev }; delete next[confirmUninstall]; return next })
            setExpandedSkill(null)
            setConfirmUninstall(null)
          } catch (e) {
            setUninstallError(e instanceof Error ? e.message : 'Failed to uninstall')
          } finally {
            setUninstallLoading(false)
          }
        }}
        onCancel={() => { setConfirmUninstall(null); setUninstallError('') }}
      />
    </div>
  )
}
