import { useCallback } from 'react'
import { DockviewReact, type DockviewApi, IDockviewPanelProps } from 'dockview'
import TitleBar from './components/TitleBar/TitleBar'
import SessionList from './components/Sidebar/SessionList'
import ChatArea from './components/Chat/ChatArea'
import FileTree from './components/FileTree/FileTree'
import FileEditor from './components/FileTree/FileEditor'
import Console from './components/Console/Console'
import StatusBar from './components/StatusBar/StatusBar'
import SettingsPage from './components/Settings/SettingsPage'
import { ChatTab } from './components/Panel/ChatTab'
import { EditorTab } from './components/Panel/EditorTab'
import { SessionTab } from './components/Panel/SessionTab'
import ChangesList from './components/ChangesList/ChangesList'
import { DefaultTab } from './components/Panel/DefaultTab'
import { useLayoutPersistence } from './components/Panel/useLayoutPersistence'
import { useStore } from './store'

const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  chat: ChatArea,
  editor: FileEditor,
  filetree: FileTree,
  changes: ChangesList,
  session: SessionList,
  console: Console,
}

const tabComponents = {
  'chat-tab': ChatTab,
  'editor-tab': EditorTab,
  'session-tab': SessionTab,
  'default-tab': DefaultTab,
  'changes-tab': DefaultTab,
}

function App() {
  const projectPath = useStore((s) => s.projectPath)
  const dockviewApi = useStore((s) => s.dockviewApi)
  const setDockviewApi = useStore((s) => s.setDockviewApi)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const toggleSettings = useStore((s) => s.toggleSettings)

  const handleReady = useCallback((event: { api: DockviewApi }) => {
    setDockviewApi(event.api)
  }, [setDockviewApi])

  useLayoutPersistence(dockviewApi, projectPath)

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
        />
      </div>
      <StatusBar />
      {settingsOpen && <SettingsPage onClose={toggleSettings} />}
    </div>
  )
}

export default App
