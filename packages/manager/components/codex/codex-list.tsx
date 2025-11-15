'use client'

import type { CodexConfig, CodexSettings } from '@start-claude/cli/src/codex/config/types'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { CodexItem } from '@/components/codex/codex-item'
import { toast } from '@/lib/use-toast'

interface CodexListProps {
  configs: CodexConfig[]
  onEdit: (config: CodexConfig) => void
  onDelete: (name: string) => void
  isDragging: boolean
  settings: CodexSettings
  onSaveConfig: (config: CodexConfig) => Promise<void>
  refetchConfigs: () => Promise<void>
}

export function CodexList({
  configs,
  onEdit,
  onDelete,
  isDragging,
  onSaveConfig,
  refetchConfigs,
}: CodexListProps): ReactNode {
  const t = useTranslations('codexList')

  const handleToggleEnabled = async (name: string, enabled: boolean): Promise<void> => {
    const config = configs.find(c => c.name === name)
    if (!config)
      return

    try {
      await onSaveConfig({ ...config, enabled })
      toast({
        title: enabled ? t('enabled') : t('disabled'),
        description: t('statusChanged', { name }),
      })
      await refetchConfigs()
    }
    catch (error) {
      console.error('Failed to toggle config:', error)
      toast({
        title: t('error'),
        description: t('errorDescription'),
        variant: 'destructive',
      })
    }
  }

  const handleSetDefault = async (name: string): Promise<void> => {
    const config = configs.find(c => c.name === name)
    if (!config)
      return

    try {
      // Save the config with isDefault = true
      await onSaveConfig({ ...config, isDefault: true })

      toast({
        title: t('defaultSet'),
        description: t('defaultSetDescription', { name }),
      })
      await refetchConfigs()
    }
    catch (error) {
      console.error('Failed to set default config:', error)
      toast({
        title: t('error'),
        description: t('errorDescription'),
        variant: 'destructive',
      })
    }
  }

  if (configs.length === 0) {
    return null
  }

  return (
    <div className={`space-y-3 ${isDragging ? 'select-none' : ''}`}>
      {configs.map(config => (
        <CodexItem
          key={config.id}
          config={config}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleEnabled={(name, enabled) => {
            void handleToggleEnabled(name, enabled)
          }}
          onSetDefault={(name) => {
            void handleSetDefault(name)
          }}
        />
      ))}
    </div>
  )
}
