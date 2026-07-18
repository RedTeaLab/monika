import { useCallback, useEffect, useState } from 'react'
import { Window, Events } from '@wailsio/runtime'
import { useStore } from '../../store'
import { App } from '../../../bindings/monika'
import {
  IconMinimize, IconMaximize, IconClose, IconRestore,
  IconPlus,
} from '../Icons'
import { IconButton, AlertDialog } from '../ui'
import { ProjectDropdown } from './ProjectDropdown'
import { BranchDropdown } from './BranchDropdown'
import { CreateBranchPanel } from './CreateBranchPanel'
import { FileDialog } from './FileDialog'
import { buildDirtyGuardMessage } from './dropdownHelpers'

function TitleBar() {
  const {
    projectPath, branch, generatingSessionIds,
    resetProjectState, setProjectPath, setBranch,
    loadBranches, loadRecentProjects, loadProviders,
  } = useStore()
  const [isMaximised, setIsMaximised] = useState(false)

  const [showCreateBranch, setShowCreateBranch] = useState(false)
  const [fileDialogOpen, setFileDialogOpen] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; targetPath: string } | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  useEffect(() => {
    Window.IsMaximised().then(setIsMaximised)
    const un1 = Events.On('common:WindowMaximise', () => setIsMaximised(true))
    const un2 = Events.On('common:WindowUnMaximise', () => setIsMaximised(false))
    const un3 = Events.On('common:WindowRestore', () => setIsMaximised(false))
    return () => { un1(); un2(); un3() }
  }, [])

  const isGitRepo = projectPath && branch !== '—'

  const doSwitchProject = async (targetPath: string) => {
    const info = await App.OpenProject(targetPath)
    if (!info) {
      console.warn('[monika] OpenProject returned null, aborting switch')
      return
    }
    resetProjectState()
    setProjectPath(info.path)
    setBranch(info.branch)
    await Promise.all([loadBranches(), loadRecentProjects(), loadProviders()])
  }

  const handleProjectSelect = useCallback(async (targetPath: string) => {
    const isGenerating = generatingSessionIds.length > 0

    if (isGenerating) {
      const message = buildDirtyGuardMessage(0, isGenerating, 'projects');
      setPendingConfirm({ title: 'Switch Project', message, targetPath })
      return
    }

    await doSwitchProject(targetPath)
  }, [generatingSessionIds])

  return (
    <div
      className="flex items-center h-9 border-b border-[var(--border)] select-none"
      style={{
        '--wails-draggable': 'drag' as string,
        background: 'var(--bg-elevated)',
        paddingLeft: '12px',
        position: 'relative',
        zIndex: 10,
      } as React.CSSProperties}
    >
      {/* Interactive cluster — no-drag overrides the inherited drag region so
          the Combobox triggers and action buttons are clickable. The CSS
          variable inherits to all descendants, including the Combobox's
          internal trigger button. */}
      <div
        className="flex items-center gap-1 ml-3"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        <div className="w-[180px]">
          <ProjectDropdown onSelectProject={handleProjectSelect} />
        </div>
        <IconButton
          label="Open new project"
          size="sm"
          onClick={() => setFileDialogOpen(true)}
        >
          <IconPlus size={12} />
        </IconButton>
      </div>

      <div
        className="flex items-center gap-1 ml-2"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        <div className="w-[150px]">
          <BranchDropdown disabled={!isGitRepo} />
        </div>
        {isGitRepo && (
          <IconButton
            label="Create new branch"
            size="sm"
            onClick={() => setShowCreateBranch(true)}
          >
            <IconPlus size={12} />
          </IconButton>
        )}
      </div>

      <div className="flex-1" />

      {/* Window controls */}
      <div
        className="flex h-full"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        <IconButton
          label="Minimize"
          onClick={() => Window.Minimise()}
        >
          <IconMinimize size={14} />
        </IconButton>
        <IconButton
          label={isMaximised ? 'Restore' : 'Maximize'}
          onClick={() => Window.ToggleMaximise()}
        >
          {isMaximised ? <IconRestore size={13} /> : <IconMaximize size={13} />}
        </IconButton>
        <IconButton
          label="Close"
          onClick={() => Window.Close()}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--color-error)'
            e.currentTarget.style.color = 'white'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = ''
            e.currentTarget.style.color = ''
          }}
        >
          <IconClose size={14} />
        </IconButton>
      </div>

      {/* Create-new-branch modal */}
      {showCreateBranch && (
        <CreateBranchPanel
          onCancel={() => setShowCreateBranch(false)}
          onCreated={() => setShowCreateBranch(false)}
        />
      )}
      <AlertDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.message}
        confirmLabel="Discard"
        variant="destructive"
        loading={confirmLoading}
        error={confirmError}
        onConfirm={async () => {
          setConfirmError(''); setConfirmLoading(true)
          try {
            const target = pendingConfirm!.targetPath
            setPendingConfirm(null)
            await doSwitchProject(target)
          } catch (e) {
            setConfirmError(e instanceof Error ? e.message : 'Operation failed')
          } finally {
            setConfirmLoading(false)
          }
        }}
        onCancel={() => { setPendingConfirm(null); setConfirmError('') }}
      />
      <FileDialog
        isOpen={fileDialogOpen}
        onClose={() => setFileDialogOpen(false)}
        onOpen={(path) => { setFileDialogOpen(false); handleProjectSelect(path) }}
      />
    </div>
  )
}

export default TitleBar
