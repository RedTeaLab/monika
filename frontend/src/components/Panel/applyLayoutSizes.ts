import type { DockviewApi } from 'dockview'

const SESSION_WIDTH = 220
const CHAT_RATIO = 0.55
const PREVIEW_RATIO = 0.7

export function applyLayoutSizes(api: DockviewApi) {
  // Safety-net adjustments — DEFAULT_LAYOUT already has correct proportional
  // pixel sizes, but different window sizes need these recalculated.

  function adjust() {
    const session = api.getPanel('session')
    const chat = api.getPanel('chat')
    const preview = api.getPanel('preview')
    const files = api.getPanel('files')
    const changes = api.getPanel('changes')

    if (session) {
      session.api.setSize({ width: SESSION_WIDTH, height: session.api.height })
    }

    if (chat && preview) {
      const remaining = api.width - SESSION_WIDTH
      if (remaining > 0) {
        chat.api.setSize({ width: Math.floor(remaining * CHAT_RATIO), height: chat.api.height })
        preview.api.setSize({ width: Math.floor(remaining * (1 - CHAT_RATIO)), height: preview.api.height })
      }
    }

    if (preview && files && changes) {
      const totalH = preview.api.height + files.api.height
      if (totalH > 0) {
        preview.api.setSize({ width: preview.api.width, height: Math.floor(totalH * PREVIEW_RATIO) })
      }
    }

    if (files && changes) {
      const totalW = files.api.width + changes.api.width
      if (totalW > 0) {
        const half = Math.floor(totalW / 2)
        files.api.setSize({ width: half, height: files.api.height })
        changes.api.setSize({ width: half, height: changes.api.height })
      }
    }
  }

  setTimeout(adjust, 0)
  setTimeout(adjust, 80)
  setTimeout(adjust, 250)
}