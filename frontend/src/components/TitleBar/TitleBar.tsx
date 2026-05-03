import { useCallback, useEffect, useRef, useState } from 'react'
import { Window, Events } from '@wailsio/runtime'
import { useStore } from '../../store'
import { App } from '../../../bindings/monika'
import {
  IconMinimize, IconMaximize, IconClose, IconRestore,
  IconChevronDown,
} from '../Icons'
import { ProjectDropdown } from './ProjectDropdown'
import { BranchDropdown } from './BranchDropdown'
import { CreateBranchPanel } from './CreateBranchPanel'
import { FileDialog } from './FileDialog'
import ConfirmModal from '../Chat/ConfirmModal'
import { buildDirtyGuardMessage } from './dropdownHelpers'

function TitleBar() {
  const {
    projectPath, branch, openFiles, generatingSessionId,
    resetProjectState, setProjectPath, setBranch,
    loadBranches, loadRecentProjects, loadProviders,
  } = useStore()
  const [isMaximised, setIsMaximised] = useState(false)

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const [showCreateBranch, setShowCreateBranch] = useState(false)
  const [fileDialogOpen, setFileDialogOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; targetPath: string } | null>(null)
  const projectTriggerRef = useRef<HTMLSpanElement>(null)
  const branchTriggerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    Window.IsMaximised().then(setIsMaximised)
    const un1 = Events.On('common:WindowMaximise', () => setIsMaximised(true))
    const un2 = Events.On('common:WindowUnMaximise', () => setIsMaximised(false))
    const un3 = Events.On('common:WindowRestore', () => setIsMaximised(false))
    return () => { un1(); un2(); un3() }
  }, [])

  const projectName = projectPath ? projectPath.split(/[/\\]/).pop() || projectPath : ''
  const isGitRepo = projectPath && branch !== '—'

  const doSwitchProject = async (targetPath: string) => {
    console.log('[monika] doSwitchProject: starting, targetPath:', targetPath)
    const info = await App.OpenProject(targetPath)
    console.log('[monika] doSwitchProject: OpenProject returned:', JSON.stringify(info))
    if (!info) {
      console.warn('[monika] doSwitchProject: OpenProject returned null/undefined, aborting')
      return
    }
    console.log('[monika] doSwitchProject: calling resetProjectState')
    resetProjectState()
    console.log('[monika] doSwitchProject: setting projectPath:', info.path, 'branch:', info.branch)
    setProjectPath(info.path)
    setBranch(info.branch)
    console.log('[monika] doSwitchProject: loading branches and recent projects')
    await Promise.all([loadBranches(), loadRecentProjects(), loadProviders()])
    console.log('[monika] doSwitchProject: complete')
  }

  const handleProjectSelect = useCallback(async (targetPath: string) => {
    console.log('[monika] handleProjectSelect: targetPath:', targetPath)
    const dirtyCount = openFiles.filter(f => f.isDirty).length
    const isGenerating = generatingSessionId !== ''
    console.log('[monika] handleProjectSelect: dirtyCount:', dirtyCount, 'isGenerating:', isGenerating)

    if (dirtyCount > 0 || isGenerating) {
      console.log('[monika] handleProjectSelect: showing confirm modal (dirty/generating)')
      const message = buildDirtyGuardMessage(dirtyCount, isGenerating, 'projects');
      setConfirmModal({ title: 'Switch Project', message, targetPath })
      return
    }

    await doSwitchProject(targetPath)
  }, [openFiles, generatingSessionId])

  return (
    <div
      className="flex items-center h-[32px] backdrop-blur-md border-b border-[var(--border)] select-none"
      style={{
        '--wails-draggable': 'drag' as string,
        background: 'var(--glass-strong)',
        paddingLeft: '12px',
        position: 'relative',
        zIndex: 10,
      } as React.CSSProperties}
    >
      <span className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight">Monika</span>

      <span
        ref={projectTriggerRef}
        onClick={() => { setProjectDropdownOpen(!projectDropdownOpen); setBranchDropdownOpen(false) }}
        style={{
          fontSize: 11,
          color: projectDropdownOpen ? 'var(--accent)' : 'var(--text-dim)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          padding: '2px 4px',
          borderRadius: 2,
          marginLeft: 12,
          WebkitAppRegion: 'no-drag',
          background: projectDropdownOpen ? 'rgba(91,141,239,0.08)' : 'transparent',
        } as React.CSSProperties}
      >
        {projectName || 'project'}
        <span style={{ display: 'inline-flex', transform: projectDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <IconChevronDown size={10} />
        </span>
      </span>

      <span
        ref={branchTriggerRef}
        onClick={() => {
          if (!isGitRepo) return
          setBranchDropdownOpen(!branchDropdownOpen)
          setProjectDropdownOpen(false)
          setShowCreateBranch(false)
        }}
        title={isGitRepo ? undefined : 'Not a git repository'}
        style={{
          fontSize: 11,
          color: branchDropdownOpen ? 'var(--accent)' : 'var(--text-dim)',
          cursor: isGitRepo ? 'pointer' : 'default',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          padding: '2px 4px',
          borderRadius: 2,
          marginLeft: 6,
          WebkitAppRegion: 'no-drag',
          background: branchDropdownOpen ? 'rgba(91,141,239,0.08)' : 'transparent',
          opacity: isGitRepo ? 1 : 0.5,
        } as React.CSSProperties}
      >
        {isGitRepo ? branch : '—'}
        {isGitRepo && (
          <span style={{ display: 'inline-flex', transform: branchDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <IconChevronDown size={10} />
          </span>
        )}
      </span>

      <div className="flex-1" />
      <div style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties} className="flex h-full">
        <button
          onClick={() => Window.Minimise()}
          className="w-[40px] h-full flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors"
          aria-label="Minimize"
        >
          <IconMinimize size={14} />
        </button>
        <button
          onClick={() => Window.ToggleMaximise()}
          className="w-[40px] h-full flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors"
          aria-label={isMaximised ? 'Restore' : 'Maximize'}
        >
          {isMaximised ? <IconRestore size={13} /> : <IconMaximize size={13} />}
        </button>
        <button
          onClick={async () => { await Window.Close(); await App.QuitApp() }}
          className="w-[40px] h-full flex items-center justify-center text-[var(--text-dim)] hover:text-white hover:bg-[var(--red)] transition-colors"
          aria-label="Close"
        >
          <IconClose size={14} />
        </button>
      </div>

      <ProjectDropdown
        isOpen={projectDropdownOpen}
        onClose={() => setProjectDropdownOpen(false)}
        onOpenFileDialog={() => { setProjectDropdownOpen(false); setFileDialogOpen(true) }}
        onSelectProject={handleProjectSelect}
        triggerRef={projectTriggerRef}
      />

      <BranchDropdown
        isOpen={branchDropdownOpen && !showCreateBranch}
        onClose={() => { setBranchDropdownOpen(false); setShowCreateBranch(false) }}
        onNewBranch={() => setShowCreateBranch(true)}
        triggerRef={branchTriggerRef}
      />

      {branchDropdownOpen && showCreateBranch && (
        <div style={{
          position: 'fixed',
          top: (branchTriggerRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
          left: branchTriggerRef.current?.getBoundingClientRect().left ?? 0,
          minWidth: 280,
          background: 'var(--bg-sidebar)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 1000,
        }}>
          <CreateBranchPanel
            onCancel={() => setShowCreateBranch(false)}
            onCreated={() => { setShowCreateBranch(false); setBranchDropdownOpen(true) }}
          />
        </div>
      )}

      <FileDialog
        isOpen={fileDialogOpen}
        onClose={() => setFileDialogOpen(false)}
        onOpen={(dirPath) => { setFileDialogOpen(false); handleProjectSelect(dirPath) }}
      />

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel="Discard"
          onConfirm={async () => {
            const target = confirmModal.targetPath
            setConfirmModal(null)
            await doSwitchProject(target)
          }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}

export default TitleBar
