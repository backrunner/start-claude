'use client'

import type { ReactNode } from 'react'
import type { ExternalProductId } from '@start-claude/cli/src/products/types'
import { Bot, Code2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type ManagerMode = 'claude' | ExternalProductId

interface ModeSwitcherProps {
  activeMode: ManagerMode
}

const modes: Array<{
  id: ManagerMode
  path: string
  icon: typeof Bot
  labelKey: string
}> = [
  { id: 'claude', path: '/', icon: Bot, labelKey: 'modeClaude' },
  { id: 'codex', path: '/codex', icon: Code2, labelKey: 'modeCodex' },
  { id: 'gemini', path: '/gemini', icon: Sparkles, labelKey: 'modeGemini' },
]

export function ModeSwitcher({ activeMode }: ModeSwitcherProps): ReactNode {
  const t = useTranslations('header')
  const router = useRouter()

  return (
    <div className="inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-border bg-background p-1">
      {modes.map(({ id, path, icon: Icon, labelKey }) => {
        const active = activeMode === id
        return (
          <button
            key={id}
            type="button"
            onClick={active ? undefined : () => router.push(path)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
            title={t(labelKey)}
          >
            <Icon className="h-4 w-4 mr-1.5" />
            {t(labelKey)}
          </button>
        )
      })}
    </div>
  )
}
