import { useState } from 'react'
import TitleBar from './components/TitleBar/TitleBar'
import SessionList from './components/Sidebar/SessionList'
import ChatArea from './components/Chat/ChatArea'
import FileTree from './components/FileTree/FileTree'
import Console from './components/Console/Console'
import StatusBar from './components/StatusBar/StatusBar'

function App() {
  const [showConsole, setShowConsole] = useState(true)
  const [showFileTree, setShowFileTree] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(200)

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-primary)]">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 border-r border-[var(--color-border)] flex-shrink-0">
          <SessionList />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <ChatArea />
        </div>
        {showFileTree && (
          <div className="w-64 border-l border-[var(--color-border)] flex-shrink-0">
            <FileTree />
          </div>
        )}
      </div>
      {showConsole && (
        <div style={{ height: consoleHeight }} className="border-t border-[var(--color-border)]">
          <Console onResize={setConsoleHeight} />
        </div>
      )}
      <StatusBar
        showConsole={showConsole}
        showFileTree={showFileTree}
        onToggleConsole={() => setShowConsole(!showConsole)}
        onToggleFileTree={() => setShowFileTree(!showFileTree)}
      />
    </div>
  )
}

export default App
