import { useCallback, useEffect } from 'react'
import { DockviewReact, type DockviewApi, IDockviewPanelProps } from 'dockview'
import TitleBar from './components/TitleBar/TitleBar'
import SessionList from './components/Sidebar/SessionList'
import ChatArea from './components/Chat/ChatArea'
import FileTree from './components/FileTree/FileTree'
import PreviewPanel from './components/Preview/PreviewPanel'
import StatusBar from './components/StatusBar/StatusBar'
import SettingsPage from './components/Settings/SettingsPage'
import { ChatTab } from './components/Panel/ChatTab'
import { SessionTab } from './components/Panel/SessionTab'
import ChangesList from './components/ChangesList/ChangesList'
import { DefaultTab } from './components/Panel/DefaultTab'
import { useLayoutPersistence } from './components/Panel/useLayoutPersistence'
import { useChangeWatcher } from './hooks/useChangeWatcher'
import { ToastContainer } from './components/Toast/ToastContainer'
import { useStore } from './store'

const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  chat: ChatArea,
  preview: PreviewPanel,
  files: FileTree,
  changes: ChangesList,
  session: SessionList,
}

const tabComponents = {
  'chat-tab': ChatTab,
  'session-tab': SessionTab,
  'default-tab': DefaultTab,
}

function App() {
  const projectPath = useStore((s) => s.projectPath)
  const fileTreeVersion = useStore((s) => s.fileTreeVersion)
  const dockviewApi = useStore((s) => s.dockviewApi)
  const setDockviewApi = useStore((s) => s.setDockviewApi)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const toggleSettings = useStore((s) => s.toggleSettings)
  const loadSkills = useStore((s) => s.loadSkills)

  // Load skills on startup so / command autocomplete works
  useEffect(() => { loadSkills() }, [loadSkills])

  useChangeWatcher(projectPath, fileTreeVersion)
  useLayoutPersistence(dockviewApi, projectPath)

  // Sync dockview active panel changes to store (so session list highlights correctly)
  useEffect(() => {
    if (!dockviewApi) return
    const disp = dockviewApi.onDidActivePanelChange((panel) => {
      if (!panel) return
      const id = panel.id

      // Redirect placeholder tab if it has siblings (e.g. activated via keyboard)
      if ((id === 'chat') && panel.group && panel.group.panels.length > 1) {
        const other = panel.group.panels.find((p) => p.id !== id)
        if (other) {
          other.api.setActive()
          return
        }
      }

      const state = useStore.getState()
      if (id !== state.activeSessionId && state.openSessions.some((s) => s.id === id)) {
        state.switchSessionTab(id)
      }
    })
    return () => { disp.dispose() }
  }, [dockviewApi])

  // Sync dockview panel removal back to store.
  // Must distinguish panel close from panel move between groups —
  // dockview fires onDidRemovePanel for both. A microtask delay lets
  // onDidAddPanel fire first if the panel was just moved.
  useEffect(() => {
    if (!dockviewApi) return
    const removedIds = new Set<string>()

    const removeDisp = dockviewApi.onDidRemovePanel((panel) => {
      removedIds.add(panel.id)
      setTimeout(() => {
        if (!removedIds.has(panel.id)) return
        removedIds.delete(panel.id)
        // Panel still gone after tick — it was closed, not moved
        const state = useStore.getState()
        if (state.openSessions.some((s) => s.id === panel.id)) {
          state.closeSessionTab(panel.id)
        }
      }, 0)
    })

    const addDisp = dockviewApi.onDidAddPanel((panel) => {
      removedIds.delete(panel.id)
    })

    return () => {
      removeDisp.dispose()
      addDisp.dispose()
    }
  }, [dockviewApi])

  const handleReady = useCallback((event: { api: DockviewApi }) => {
    setDockviewApi(event.api)
  }, [setDockviewApi])

  return (
    <div className="flex flex-col h-full bg-[var(--bg-root)] overflow-hidden">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        <DockviewReact
          components={components}
          tabComponents={tabComponents}
          defaultTabComponent={DefaultTab}
          onReady={handleReady}
          className="h-full"
          disableDnd={true}
        />
      </div>
      <StatusBar />
      <ToastContainer />
      {settingsOpen && <SettingsPage onClose={toggleSettings} />}
    </div>
  )
}

export default App