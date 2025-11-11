'use client'

import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

// Scoped localStorage key to avoid conflicts on localhost
const THEME_STORAGE_KEY = 'start-claude-theme'

/**
 * Gets the effective theme (resolves 'system' to actual theme)
 */
function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

/**
 * Applies the theme to the document
 */
function applyTheme(theme: Theme): void {
  const effectiveTheme = getEffectiveTheme(theme)
  const root = document.documentElement

  if (effectiveTheme === 'dark') {
    root.classList.add('dark')
  }
  else {
    root.classList.remove('dark')
  }
}

/**
 * Gets the stored theme or defaults to 'system'
 */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'system'
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  }
  catch (error) {
    console.error('Error reading theme from localStorage:', error)
  }

  return 'system'
}

/**
 * Sets and persists the theme
 */
export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    applyTheme(theme)
  }
  catch (error) {
    console.error('Error saving theme to localStorage:', error)
  }
}

/**
 * Hook to manage theme state
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const storedTheme = getStoredTheme()
    setTheme(storedTheme)
    applyTheme(storedTheme)

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setThemeWithStorage = (newTheme: Theme) => {
    setTheme(newTheme)
    setStoredTheme(newTheme)
  }

  const toggleTheme = () => {
    const effectiveTheme = getEffectiveTheme(theme)
    const newTheme: Theme = effectiveTheme === 'dark' ? 'light' : 'dark'
    setThemeWithStorage(newTheme)
  }

  return {
    theme,
    setTheme: setThemeWithStorage,
    toggleTheme,
    effectiveTheme: mounted ? getEffectiveTheme(theme) : 'light',
    mounted,
  }
}
