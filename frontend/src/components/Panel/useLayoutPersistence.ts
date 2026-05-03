import { useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'
import { DEFAULT_LAYOUT } from './defaultLayout'

const STORAGE_PREFIX = 'monika_layout_'

export function useLayoutPersistence(
  api: DockviewApi | null,
  projectPath: string,
) {
  const savingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Restore saved layout or use default on first mount
  useEffect(() => {
    if (!api) return

    const key = STORAGE_PREFIX + (projectPath || 'default')
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        api.fromJSON(JSON.parse(saved))
        return
      }
    } catch {
      // Corrupted — fall through to default
    }
    api.fromJSON(DEFAULT_LAYOUT)
  }, [api, projectPath])

  // Save layout on changes (debounced 500ms)
  useEffect(() => {
    if (!api) return

    const disp = api.onDidLayoutChange(() => {
      if (savingRef.current) return
      if (timerRef.current) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        const key = STORAGE_PREFIX + (projectPath || 'default')
        try {
          savingRef.current = true
          const json = api.toJSON()
          localStorage.setItem(key, JSON.stringify(json))
        } catch {
          // Silently fail — layout will reset next time
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
