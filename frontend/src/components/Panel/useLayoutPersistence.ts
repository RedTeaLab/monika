import { useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'
import { DEFAULT_LAYOUT } from './defaultLayout'
import { applyLayoutSizes } from './applyLayoutSizes'

const STORAGE_PREFIX = 'monika_layout_'
const LAYOUT_VERSION = 15

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
    // Save the adjusted layout as default so subsequent loads get the correct sizes
    setTimeout(() => {
      try {
        const versionedKey = `${STORAGE_PREFIX}v${LAYOUT_VERSION}_${baseKey}`
        if (!localStorage.getItem(versionedKey)) {
          const json = api.toJSON()
          localStorage.setItem(versionedKey, JSON.stringify(json))
        }
      } catch { /* ignore */ }
    }, 400)
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