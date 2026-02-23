import { useState, useEffect } from 'react'

export type Theme = 'light' | 'dark' | 'high-contrast'

const STORAGE_KEY = 'theme'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (stored) return stored
    return 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'high-contrast')
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'high-contrast') {
      root.classList.add('dark', 'high-contrast')
    }
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  const toggleTheme = () => {
    setThemeState(prev => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'high-contrast'
      return 'light'
    })
  }

  const isHighContrast = theme === 'high-contrast'

  return {
    theme,
    setTheme,
    toggleTheme,
    isHighContrast,
  }
}
