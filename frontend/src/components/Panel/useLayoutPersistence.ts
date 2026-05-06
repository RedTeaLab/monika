import { useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'
import { DEFAULT_LAYOUT } from './defaultLayout'
import { applyLayoutSizes } from './applyLayoutSizes'
import { useStore } from '../../store'

const STORAGE_PREFIX = 'monika_layout_'
const LAYOUT_VERSION = 12

function extractSessionTabs(layout: any): { id: string; title: string }[] {
  const panels = layout?.panels || {}
  return Object.values(panels)
    .filter((p: any) => p.contentComponent === 'chat' && p.id !== 'chat')
    .map((p: any) => ({ id: p.id, title: p.title || 'Untitled' }))
}

export function useLayoutPersistence(
  api: DockviewApi | null,
  projectPath: string,
) {
  const savingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!api) return

    const baseKey = projectPath || 'default'
    const versionedKey = `${STORAGE_PREFIX}v${LAYOUT_VERSION}_${baseKey}`

    try {
      const saved = localStorage.getItem(versionedKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        api.fromJSON(parsed)

        // Restore session state for restored session panels
        const sessionTabs = extractSessionTabs(parsed)
        if (sessionTabs.length > 0 && projectPath) {
          setTimeout(() => {
            useStore.getState().restoreSessionTabs(sessionTabs)
          }, 100)
        }

        return
      }

      const oldKey = `${STORAGE_PREFIX}${baseKey}`
      if (localStorage.getItem(oldKey) !== null) {
        localStorage.removeItem(oldKey)
      }
    } catch {
      // Corrupted — fall through to default
    }
    api.fromJSON(DEFAULT_LAYOUT)
    applyLayoutSizes(api)
  }, [api, projectPath])

  useEffect(() => {
    if (!api) return

    const disp = api.onDidLayoutChange(() => {
      if (savingRef.current) return
      if (timerRef.current) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        const baseKey = projectPath || 'default'
        const versionedKey = `${STORAGE_PREFIX}v${LAYOUT_VERSION}_${baseKey}`
        try {
          savingRef.current = true
          const json = api.toJSON()
          localStorage.setItem(versionedKey, JSON.stringify(json))
        } catch {
          // Silently fail
        } finally {
          savingRef.current = false
        }
      }, 500)
    })

    return () => {
      disp.dispose()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [api, projectPath])
}
