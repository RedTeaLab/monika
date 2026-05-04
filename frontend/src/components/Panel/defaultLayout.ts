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
              data: { id: 'filetree-group', views: ['filetree'], activeView: 'filetree' },
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
      tabComponent: 'default-tab',
      title: 'Sessions',
      renderer: 'always',
    },
    chat: {
      id: 'chat',
      contentComponent: 'chat',
      tabComponent: 'chat-tab',
      title: 'Chat',
      renderer: 'always',
    },
    editor: {
      id: 'editor',
      contentComponent: 'editor',
      tabComponent: 'editor-tab',
      title: 'Preview',
      renderer: 'always',
    },
    filetree: {
      id: 'filetree',
      contentComponent: 'filetree',
      tabComponent: 'default-tab',
      title: 'Files',
      renderer: 'always',
    },
    console: {
      id: 'console',
      contentComponent: 'console',
      tabComponent: 'default-tab',
      title: 'Console',
      renderer: 'always',
    },
  },
  activeGroup: 'chat-group',
}
