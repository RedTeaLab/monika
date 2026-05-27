import { Orientation, type SerializedDockview } from 'dockview'

// Grid defaults to 1400×900. Sizes below are proportional within that frame.
// When restored at different window sizes, dockview scales them.
const CHAT_W = 649   // 55% of (1400 - 220)
const PREVIEW_H = 630 // 70% of 900
const FS_CH_W = 265  // 50% of (1400 - 220 - 649)

export const DEFAULT_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          data: [
            {
              type: 'leaf',
              size: 220,
              data: { id: 'session-group', views: ['session'], activeView: 'session' },
            },
            {
              type: 'leaf',
              size: CHAT_W,
              data: { id: 'chat-group', views: ['chat'], activeView: 'chat' },
            },
            {
              type: 'branch',
              size: undefined,
              data: [
                {
                  type: 'leaf',
                  size: PREVIEW_H,
                  data: { id: 'preview-group', views: ['preview'], activeView: 'preview' },
                },
                {
                  type: 'branch',
                  size: undefined,
                  data: [
                    {
                      type: 'leaf',
                      size: FS_CH_W,
                      data: { id: 'files-group', views: ['files'], activeView: 'files' },
                    },
                    {
                      type: 'leaf',
                      size: FS_CH_W,
                      data: { id: 'changes-group', views: ['changes'], activeView: 'changes' },
                    },
                  ],
                },
              ],
            },
          ],
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
    preview: {
      id: 'preview',
      contentComponent: 'preview',
      tabComponent: 'session-tab',
      title: 'PREVIEW',
      renderer: 'always',
    },
    files: {
      id: 'files',
      contentComponent: 'files',
      tabComponent: 'session-tab',
      title: 'FILES',
      renderer: 'always',
    },
    changes: {
      id: 'changes',
      contentComponent: 'changes',
      tabComponent: 'session-tab',
      title: 'CHANGES',
      renderer: 'always',
    },
  },
  activeGroup: 'chat-group',
}