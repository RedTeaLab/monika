import { useState } from 'react'
import TitleBar from './components/TitleBar/TitleBar'
import SessionList from './components/Sidebar/SessionList'
import ChatArea from './components/Chat/ChatArea'
import FileTree from './components/FileTree/FileTree'
import FileEditor from './components/FileTree/FileEditor'
import Console from './components/Console/Console'
import StatusBar from './components/StatusBar/StatusBar'
import DragDivider from './components/DragDivider/DragDivider'
import { useStore } from './store'

function App() {
  const [showConsole, setShowConsole] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showFileTree, setShowFileTree] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(200)

  const layoutMode = useStore((s) => s.layoutMode)
  const splitRatio = useStore((s) => s.splitRatio)
  const setSplitRatio = useStore((s) => s.setSplitRatio)

  const showChat = layoutMode === 'chat' || layoutMode === 'split'
  const showFiles = layoutMode === 'files' || layoutMode === 'split'
  const showDivider = layoutMode === 'split'

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {showChat && (
          <div
            className="flex flex-shrink-0 overflow-hidden"
            style={{
              width: layoutMode === 'split' ? `${splitRatio * 100}%` : '100%',
              minWidth: 0,
            }}
          >
            {showSidebar && (
              <div className="w-56 border-r border-[var(--border)] flex-shrink-0">
                <SessionList />
              </div>
            )}
            <div className="flex-1 flex flex-col min-w-0">
              <ChatArea />
            </div>
          </div>
        )}
        {showDivider && (
          <DragDivider ratio={splitRatio} onRatioChange={setSplitRatio} />
        )}
        {showFiles && (
          <div
            className="flex flex-shrink-0 overflow-hidden"
            style={{
              width: layoutMode === 'split' ? `${(1 - splitRatio) * 100}%` : '100%',
              minWidth: 0,
            }}
          >
            <div className="flex-1 flex flex-col min-w-0">
              <FileEditor />
            </div>
            {showFileTree && (
              <div className="w-56 border-l border-[var(--border)] flex-shrink-0">
                <FileTree />
              </div>
            )}
          </div>
        )}
      </div>
      {showConsole && (
        <div style={{ height: consoleHeight }} className="border-t border-[var(--border)]">
          <Console onResize={setConsoleHeight} />
        </div>
      )}
      <StatusBar
        showConsole={showConsole}
        showFileTree={showFileTree}
        showSidebar={showSidebar}
        onToggleConsole={() => setShowConsole(!showConsole)}
        onToggleFileTree={() => setShowFileTree(!showFileTree)}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
      />
    </div>
  )
}

export default App
