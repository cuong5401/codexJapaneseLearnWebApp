import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import { ThemeProvider } from './theme/ThemeProvider'
import { TooltipProvider } from '../components/ui/tooltip'
import { useEffect } from 'react'

export function App() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    void Promise.all([import('../db/initialization'), import('../db/diagnostics/dev-tools')]).then(([initialization, diagnostics]) => {
      diagnostics.registerDevelopmentTools()
      if (import.meta.env.VITE_REFERENCE_SOURCE !== 'static') void initialization.initializeDevelopmentData()
    })
  }, [])
  return <ThemeProvider><TooltipProvider><RouterProvider router={router} /></TooltipProvider></ThemeProvider>
}
