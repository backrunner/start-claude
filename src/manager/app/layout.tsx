'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Note: metadata should be handled differently in client components
// This will be set via document.title in useEffect

export default function RootLayout({
  children,
}: {
  children: ReactNode
}): ReactNode {
  useEffect(() => {
    // Set document title
    document.title = 'Start Claude'

    // Apply dark mode based on system preference
    const applyTheme = (): void => {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', isDark)
    }

    // Apply initial theme
    applyTheme()

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', applyTheme)

    return () => {
      mediaQuery.removeEventListener('change', applyTheme)
    }
  }, [])

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased transition-colors duration-300">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
