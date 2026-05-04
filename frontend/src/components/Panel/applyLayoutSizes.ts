import type { DockviewApi } from 'dockview'

const SESSION_WIDTH = 180
const FILETREE_WIDTH = 180
const CONSOLE_HEIGHT = 120

export function applyLayoutSizes(api: DockviewApi) {
  // Dockview fromJSON doesn't reliably apply leaf sizes, so we force them via setSize.
  // Use two passes: first set fixed panels, then equalize flex panels.
  setTimeout(() => {
    const sessionPanel = api.getPanel('session')
    const filetreePanel = api.getPanel('filetree')
    const consolePanel = api.getPanel('console')
    const chatPanel = api.getPanel('chat')
    const editorPanel = api.getPanel('editor')

    // Pass 1: set fixed sizes
    if (sessionPanel) {
      sessionPanel.api.setSize({ width: SESSION_WIDTH, height: sessionPanel.api.height })
    }
    if (filetreePanel) {
      filetreePanel.api.setSize({ width: FILETREE_WIDTH, height: filetreePanel.api.height })
    }
    if (consolePanel) {
      consolePanel.api.setSize({ width: consolePanel.api.width, height: CONSOLE_HEIGHT })
    }

    // Pass 2: split remaining width 70/30 between chat and editor
    if (chatPanel && editorPanel) {
      setTimeout(() => {
        const totalWidth = api.width
        const remaining = totalWidth - SESSION_WIDTH - FILETREE_WIDTH
        if (remaining > 0) {
          chatPanel.api.setSize({ width: Math.floor(remaining * 0.6), height: chatPanel.api.height })
          editorPanel.api.setSize({ width: Math.floor(remaining * 0.4), height: editorPanel.api.height })
        }
      }, 50)
    }
  }, 0)
}
