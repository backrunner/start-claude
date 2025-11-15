'use client'

import type { ReactNode } from 'react'
import { Code2, Terminal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export function ModeSwitcher(): ReactNode {
  const t = useTranslations('header')
  const router = useRouter()
  const pathname = usePathname()

  const isCodex = pathname.startsWith('/codex')

  const handleSwitch = (): void => {
    if (isCodex) {
      router.push('/')
    }
    else {
      router.push('/codex')
    }
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-background p-1">
      <button
        type="button"
        onClick={!isCodex ? undefined : handleSwitch}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          !isCodex
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        )}
        title={t('modeClaude')}
      >
        <Terminal className="h-4 w-4 mr-1.5" />
        {t('modeClaude')}
      </button>
      <button
        type="button"
        onClick={isCodex ? undefined : handleSwitch}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isCodex
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        )}
        title={t('modeCodex')}
      >
        <Code2 className="h-4 w-4 mr-1.5" />
        {t('modeCodex')}
      </button>
    </div>
  )
}
