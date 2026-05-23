import { useEffect, useRef } from 'react'
import { App as MonikaApp } from '../../bindings/monika'
import { useStore } from '../store'

export function useChangeWatcher(projectPath: string, fileTreeVersion: number) {
  const setChangeStats = useStore((s) => s.setChangeStats)
  const prevChangedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!projectPath) return
    prevChangedRef.current = new Set()
    let cancelled = false
    useStore.getState().setChangeStats({ loading: true })
    MonikaApp.ListChangeStats(projectPath)
      .then((stats) => {
        if (cancelled) return
        const statsList = Array.isArray(stats) ? stats : []
        setChangeStats({ stats: statsList, loading: false })

        const changedPaths = new Set(statsList.map((s) => s.path))
        const prevChanged = prevChangedRef.current
        prevChangedRef.current = changedPaths

        if (prevChanged.size > 0) {
          const state = useStore.getState()
          if (state.preview.mode === 'diff' && state.preview.filePath) {
            const wasChanged = prevChanged.has(state.preview.filePath)
            const isChanged = changedPaths.has(state.preview.filePath)
            if (wasChanged && !isChanged) {
              state.clearPreview()
            }
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          useStore.getState().setChangeStats({ stats: [], loading: false, error: 'Failed to load changes' })
        }
      })
    return () => { cancelled = true }
  }, [projectPath, fileTreeVersion])
}