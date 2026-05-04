import { Orientation, type SerializedDockview } from 'dockview'

export const DEFAULT_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          size: undefined,
          data: [
            {
              type: 'leaf',
              size: 180,
              data: { id: 'session-group', views: ['session'], activeView: 'session' },
            },
            {
              type: 'leaf',
              size: undefined,
              data: { id: 'chat-group', views: ['chat'], activeView: 'chat' },
            },
            {
              type: 'leaf',
              size: undefined,
              data: { id: 'editor-group', views: ['editor'], activeView: 'editor' },
            },
            {
              type: 'leaf',
              size: 180,
              data: { id: 'filetree-group', views: ['filetree', 'changes'], activeView: 'filetree' },
            },
          ],
        },
        {
          type: 'leaf',
          size: 120,
          data: { id: 'console-group', views: ['console'], activeView: 'console' },
        },
      ],
    },
    orientation: Orientation.VERTICAL,
    width: 1400,
    height: 900,
  },
  panels: {
    session: {
      id: 'session',
      contentComponent: 'session',
      tabComponent: 'session-tab',
      title: 'SESSIONS',
      renderer: 'always',
    },
    chat: {
      id: 'chat',
      contentComponent: 'chat',
      tabComponent: 'chat-tab',
      title: 'CHAT',
      renderer: 'always',
    },
    editor: {
      id: 'editor',
      contentComponent: 'editor',
      tabComponent: 'editor-tab',
      title: 'EDITOR',
      renderer: 'always',
    },
    filetree: {
      id: 'filetree',
      contentComponent: 'filetree',
      tabComponent: 'default-tab',
      title: 'FILES',
      renderer: 'always',
    },
    changes: {
      id: 'changes',
      contentComponent: 'changes',
      tabComponent: 'changes-tab',
      title: 'CHANGES',
      renderer: 'always',
    },
    console: {
      id: 'console',
      contentComponent: 'console',
      tabComponent: 'default-tab',
      title: 'CONSOLE',
      renderer: 'always',
    },
  },
  activeGroup: 'chat-group',
}
