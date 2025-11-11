export const locales = ['en-US', 'zh-CN', 'ja-JP', 'zh-Hant'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en-US'

// Scoped localStorage key to avoid conflicts on localhost
const LOCALE_STORAGE_KEY = 'start-claude-locale'

/**
 * Detects the user's locale based on browser/system settings
 * Falls back to English if no match is found
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') {
    return defaultLocale
  }

  // Get browser languages in order of preference
  const languages = navigator.languages || [navigator.language]

  // Try to find a matching locale
  for (const lang of languages) {
    // Direct match
    if (locales.includes(lang as Locale)) {
      return lang as Locale
    }

    // Check for language-only match (e.g., 'zh' -> 'zh-CN')
    const langCode = lang.split('-')[0].toLowerCase()

    switch (langCode) {
      case 'zh': {
        // For Chinese, detect simplified vs traditional based on region
        const region = lang.split('-')[1]?.toUpperCase()
        if (region === 'TW' || region === 'HK' || region === 'MO' || lang.includes('Hant')) {
          return 'zh-Hant'
        }
        return 'zh-CN'
      }
      case 'ja':
        return 'ja-JP'
      case 'en':
        return 'en-US'
    }
  }

  return defaultLocale
}

/**
 * Gets the locale from localStorage or detects it
 */
export function getLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale
  }

  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && locales.includes(stored as Locale)) {
      return stored as Locale
    }
  }
  catch (error) {
    console.error('Error reading locale from localStorage:', error)
  }

  // Detect and store for future use
  const detected = detectLocale()
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, detected)
  }
  catch (error) {
    console.error('Error saving locale to localStorage:', error)
  }

  return detected
}

/**
 * Sets the locale and persists it to both localStorage and cookie
 */
export function setLocale(locale: Locale): void {
  if (!locales.includes(locale)) {
    console.warn(`Invalid locale: ${locale}. Using default.`)
    return
  }

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    // Also set a cookie so the server can read it
    document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`
    // Reload the page to apply the new locale
    window.location.reload()
  }
  catch (error) {
    console.error('Error saving locale:', error)
  }
}

/**
 * Gets locale display names
 */
export function getLocaleDisplayName(locale: Locale): string {
  const displayNames: Record<Locale, string> = {
    'en-US': 'English',
    'zh-CN': '简体中文',
    'ja-JP': '日本語',
    'zh-Hant': '繁體中文',
  }
  return displayNames[locale]
}

/**
 * Gets locale flag emoji
 */
export function getLocaleFlag(locale: Locale): string {
  const flags: Record<Locale, string> = {
    'en-US': '🇺🇸',
    'zh-CN': '🇨🇳',
    'ja-JP': '🇯🇵',
    'zh-Hant': '🇹🇼',
  }
  return flags[locale]
}
