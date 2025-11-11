'use client'

import type { ReactNode } from 'react'
import { Languages } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getLocaleDisplayName, getLocaleFlag, locales, type Locale } from '@/lib/i18n'

export function LanguageSwitcher(): ReactNode {
  const currentLocale = useLocale() as Locale
  const router = useRouter()

  const handleLocaleChange = (locale: Locale) => {
    if (!locales.includes(locale)) {
      console.warn(`Invalid locale: ${locale}. Using current.`)
      return
    }

    try {
      // Save to localStorage
      localStorage.setItem('start-claude-locale', locale)

      // Save to cookie so the server can read it
      document.cookie = `start-claude-locale=${locale}; path=/; max-age=31536000; SameSite=Lax`

      // Use Next.js router to refresh the page without full reload
      router.refresh()
    }
    catch (error) {
      console.error('Error saving locale:', error)
    }
  }

  return (
    <DropdownMenu>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Languages className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Change Language</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {locales.map(locale => (
          <DropdownMenuItem
            key={locale}
            onClick={() => handleLocaleChange(locale)}
            className={currentLocale === locale ? 'bg-accent' : ''}
          >
            <span className="mr-2">{getLocaleFlag(locale)}</span>
            {getLocaleDisplayName(locale)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
