'use client'

import type { ReactNode } from 'react'
import type { ShutdownCoordinator } from '@/lib/shutdown-coordinator'
import { Blocks, Plus, RefreshCw, Settings } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { ModeSwitcher } from '@/components/ui/mode-switcher'

interface HeaderProps {
  title?: string
  isVSCode?: boolean
  shutdownCoordinator?: ShutdownCoordinator | null
  onAddConfig?: () => void
  onOpenSettings: () => void
  onOpenExtensions?: () => void
  mode?: 'claude' | 'codex'
}

export function Header({
  title,
  isVSCode,
  shutdownCoordinator,
  onAddConfig,
  onOpenSettings,
  onOpenExtensions,
  mode = 'claude',
}: HeaderProps): ReactNode {
  const t = useTranslations('header')

  // Update document title based on mode
  useEffect(() => {
    const baseTitle = mode === 'codex' ? 'Start Codex Manager' : 'Start Claude Manager'
    document.title = baseTitle
  }, [mode])

  const displayTitle = title || (mode === 'codex' ? 'Start Codex' : 'Start Claude')
  const subtitle = mode === 'codex' ? t('subtitleCodex') : t('subtitle')

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {displayTitle}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <ModeSwitcher />
        </div>
        {isVSCode && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (shutdownCoordinator) {
                shutdownCoordinator.markAsReload()
              }
              window.location.reload()
            }}
            className="rounded-full"
            title={t('reloadPage')}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <LanguageSwitcher />

        {onOpenExtensions && mode === 'claude' && (
          <Button
            variant="outline"
            onClick={onOpenExtensions}
            className="flex-1 sm:flex-none"
          >
            <Blocks className="h-4 w-4 mr-2" />
            {t('extensions')}
          </Button>
        )}

        <Button
          variant="outline"
          onClick={onOpenSettings}
          className="flex-1 sm:flex-none"
        >
          <Settings className="h-4 w-4 mr-2" />
          {t('settings')}
        </Button>

        {onAddConfig && (
          <Button
            onClick={onAddConfig}
            className="flex-1 sm:flex-none"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('addConfig')}
          </Button>
        )}
      </div>
    </div>
  )
}
