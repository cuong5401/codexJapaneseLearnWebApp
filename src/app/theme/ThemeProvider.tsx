import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeContext } from './theme-context'
import type { Theme } from './theme-context'

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('kotoba-theme')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolvedTheme = theme === 'system' ? (colorScheme.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolvedTheme
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#171b18' : '#f7f8f6')
    }
    applyTheme()
    if (theme === 'system') colorScheme.addEventListener('change', applyTheme)
    try {
      localStorage.setItem('kotoba-theme', theme)
    } catch {
      // The app remains usable when browser storage is unavailable.
    }
    return () => colorScheme.removeEventListener('change', applyTheme)
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
