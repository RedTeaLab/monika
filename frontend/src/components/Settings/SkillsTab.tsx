import { useState, useEffect, useCallback } from 'react'
import { useStore, SkillInfo } from '../../store'
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalButton } from '../ui/Modal'
import ConfirmModal from '../Chat/ConfirmModal'
import { IconStar, IconPlus, IconTrash } from '../Icons'

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
    <div
      className="rounded-lg border border-[var(--border)] px-4 py-3 w-full cursor-pointer select-none"
      style={{ background: 'var(--bg-card)', opacity: skill.enabled === false ? 0.5 : 1 }}
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
          <button
            onClick={(e) => { e.stopPropagation(); onToggleEnabled() }}
            className="relative w-8 h-[18px] rounded-full border-none cursor-pointer transition-colors"
            style={{ background: skill.enabled !== false ? 'var(--accent)' : 'var(--border)' }}
          >
            <span
              className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
              style={{ left: skill.enabled !== false ? '14px' : '2px' }}
            />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onUninstall() }}
            className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] px-1 cursor-pointer bg-transparent border-none rounded transition-colors"
            aria-label={`Uninstall ${skill.name}`}
          >
            <IconTrash size={13} />
          </button>
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
    </div>
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Skills</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Discover and manage agent skills</p>
        </div>
        <button
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
          onClick={() => {
            setShowInstallModal(true)
            setInstallError('')
            setInstallResult([])
            setGithubURL('')
          }}
        >
          <IconPlus size={12} /> Add
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
          <IconStar size={32} />
          <span className="text-[13px] mt-3">No skills discovered.</span>
          <span className="text-[11px] mt-1">Click "Add" to add skills.</span>
        </div>
      ) : (
        <div className="space-y-3">
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
        </div>
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
              <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
                {(['project', 'global'] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setInstallScope(scope)}
                    className="px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-colors border-none"
                    style={{
                      background: installScope === scope ? 'var(--accent-muted)' : 'transparent',
                      color: installScope === scope ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {scope.charAt(0).toUpperCase() + scope.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Source tabs */}
            <div className="mb-4">
              <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
                {(['github', 'zip'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setInstallTab(tab); setInstallError(''); setInstallResult([]) }}
                    className="px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-colors border-none"
                    style={{
                      background: installTab === tab ? 'var(--accent-muted)' : 'var(--bg-card)',
                      color: installTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {tab === 'github' ? 'GitHub URL' : 'Upload ZIP'}
                  </button>
                ))}
              </div>
            </div>

            {installTab === 'github' && (
              <div>
                <input
                  className="w-full px-3 py-2 text-[12px] rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] form-input-glow transition-colors duration-150"
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
            <ModalButton onClick={() => setShowInstallModal(false)} disabled={installing}>Cancel</ModalButton>
            <ModalButton variant="primary" onClick={handleInstall} disabled={installing || (installTab === 'github' && !githubURL.trim())}>
              {installing ? 'Installing...' : installTab === 'zip' ? 'Select ZIP File' : 'Install'}
            </ModalButton>
          </ModalFooter>
        </Modal>
      )}

      {confirmUninstall && (
        <ConfirmModal
          title="Uninstall Skill"
          message={`Are you sure you want to uninstall "${confirmUninstall}"?`}
          confirmLabel="Uninstall"
          icon={<IconTrash size={15} />}
          onConfirm={async () => {
            await handleUninstall(confirmUninstall)
            setSkillContents((prev) => { const next = { ...prev }; delete next[confirmUninstall]; return next })
            setExpandedSkill(null)
            setConfirmUninstall(null)
          }}
          onCancel={() => setConfirmUninstall(null)}
        />
      )}
    </div>
  )
}
