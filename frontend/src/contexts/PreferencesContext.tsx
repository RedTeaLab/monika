import { createContext, useContext, ReactNode } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'

export type Theme = 'light' | 'dark' | 'system'

interface Preferences {
  theme: Theme
  soundEnabled: boolean
  hapticEnabled: boolean
  compactMode: boolean
}

interface PreferencesContextValue {
  preferences: Preferences
  setTheme: (theme: Theme) => void
  setSoundEnabled: (enabled: boolean) => void
  setHapticEnabled: (enabled: boolean) => void
  setCompactMode: (enabled: boolean) => void
}

const defaultPreferences: Preferences = {
  theme: 'system',
  soundEnabled: true,
  hapticEnabled: true,
  compactMode: false,
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useLocalStorage<Preferences>('monika_preferences', defaultPreferences)

  const setTheme = (theme: Theme) => {
    setPreferences(prev => ({ ...prev, theme }))
    applyTheme(theme)
  }

  const setSoundEnabled = (enabled: boolean) => {
    setPreferences(prev => ({ ...prev, soundEnabled: enabled }))
  }

  const setHapticEnabled = (enabled: boolean) => {
    setPreferences(prev => ({ ...prev, hapticEnabled: enabled }))
  }

  const setCompactMode = (enabled: boolean) => {
    setPreferences(prev => ({ ...prev, compactMode: enabled }))
  }

  return (
    <PreferencesContext.Provider value={{
      preferences,
      setTheme,
      setSoundEnabled,
      setHapticEnabled,
      setCompactMode,
    }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return context
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', systemDark)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}

export function initTheme() {
  const stored = localStorage.getItem('monika_preferences')
  if (stored) {
    try {
      const prefs = JSON.parse(stored) as Preferences
      applyTheme(prefs.theme)
    } catch {
      applyTheme('system')
    }
  } else {
    applyTheme('system')
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const stored = localStorage.getItem('monika_preferences')
    if (stored) {
      try {
        const prefs = JSON.parse(stored) as Preferences
        if (prefs.theme === 'system') {
          applyTheme('system')
        }
      } catch {
        // ignore
      }
    }
  })
}
