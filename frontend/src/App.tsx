import { useState, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar/TitleBar'
import SessionList from './components/Sidebar/SessionList'
import TodoPanel from './components/TodoPanel/TodoPanel'
import ChatArea from './components/Chat/ChatArea'
import FileTree from './components/FileTree/FileTree'
import FileEditor from './components/FileTree/FileEditor'
import Console from './components/Console/Console'
import StatusBar from './components/StatusBar/StatusBar'
import DragDivider from './components/DragDivider/DragDivider'
import { useStore } from './store'

function PanelResizeHandle({ side, width, onWidthChange }: { side: 'left' | 'right'; width: number; onWidthChange: (w: number) => void }) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(width)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - startX.current
      const newWidth = side === 'right'
        ? Math.max(160, Math.min(480, startWidth.current + delta))
        : Math.max(160, Math.min(480, startWidth.current - delta))
      onWidthChange(newWidth)
    }

    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [width, side, onWidthChange])

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'var(--accent)'}
      onMouseLeave={(e) => { if (!dragging.current) (e.target as HTMLElement).style.background = 'var(--border)' }}
      style={{
        width: 1,
        flexShrink: 0,
        cursor: 'col-resize',
        background: 'var(--border)',
        transition: 'background 0.15s',
      }}
    />
  )
}

function App() {
  const [showConsole, setShowConsole] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showFileTree, setShowFileTree] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(200)
  const [sidebarWidth, setSidebarWidth] = useState(224)
  const [fileTreeWidth, setFileTreeWidth] = useState(224)

  const layoutMode = useStore((s) => s.layoutMode)
  const splitRatio = useStore((s) => s.splitRatio)
  const setSplitRatio = useStore((s) => s.setSplitRatio)

  const showChat = layoutMode === 'chat' || layoutMode === 'split'
  const showFiles = layoutMode === 'files' || layoutMode === 'split'
  const showDivider = layoutMode === 'split'

  return (
    <div className="flex flex-col h-full bg-[var(--bg-root)] overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {showChat && (
          <div
            className="flex flex-shrink-0 overflow-hidden"
            style={{
              width: layoutMode === 'split' ? `calc(${splitRatio * 100}% - 2px)` : '100%',
              minWidth: 0,
            }}
          >
            {showSidebar && (
              <>
                <div className="flex-shrink-0 overflow-hidden" style={{ width: sidebarWidth }}>
                  <SessionList />
                  <TodoPanel />
                </div>
                <PanelResizeHandle side="right" width={sidebarWidth} onWidthChange={setSidebarWidth} />
              </>
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
              width: layoutMode === 'split' ? `calc(${(1 - splitRatio) * 100}% - 2px)` : '100%',
              minWidth: 0,
            }}
          >
            <div className="flex-1 flex flex-col min-w-0">
              <FileEditor />
            </div>
            {showFileTree && (
              <>
                <PanelResizeHandle side="left" width={fileTreeWidth} onWidthChange={setFileTreeWidth} />
                <div className="flex-shrink-0 overflow-hidden" style={{ width: fileTreeWidth }}>
                  <FileTree />
                </div>
              </>
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
