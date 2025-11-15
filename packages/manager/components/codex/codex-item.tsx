'use client'

import type { CodexConfig } from '@start-claude/cli/src/codex/config/types'
import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Edit, GripVertical, Star, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VSCodeStartButton } from '@/components/vscode/vscode-start-button'

interface CodexItemProps {
  config: CodexConfig
  onEdit: (config: CodexConfig) => void
  onDelete: (name: string) => void
  onToggleEnabled: (name: string, enabled: boolean) => void
  onSetDefault: (name: string) => void
}

export function CodexItem({ config, onEdit, onDelete, onToggleEnabled, onSetDefault }: CodexItemProps): ReactNode {
  const t = useTranslations('codexItem')

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id! })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const getCleanBaseUrl = (baseUrl?: string): string | undefined => {
    if (!baseUrl)
      return undefined
    let clean = baseUrl.replace(/^https?:\/\//, '')
    clean = clean.replace(/\/$/, '')
    return clean || undefined
  }

  const cleanBaseUrl = getCleanBaseUrl(config.baseUrl)

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`mb-3 ${isDragging ? 'opacity-50' : ''} ${!config.enabled ? 'opacity-60' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-semibold truncate">{config.name}</h3>
                {config.isDefault && (
                  <Badge variant="default" className="flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    {t('default')}
                  </Badge>
                )}
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                {cleanBaseUrl && (
                  <div>
                    <span className="font-medium">
                      {t('baseUrl')}
                      :
                      {' '}
                    </span>
                    <span>{cleanBaseUrl}</span>
                  </div>
                )}
                {config.model && (
                  <div>
                    <span className="font-medium">
                      {t('model')}
                      :
                      {' '}
                    </span>
                    <span>{config.model}</span>
                  </div>
                )}
                {config.apiKey && (
                  <div>
                    <span className="font-medium">
                      {t('apiKey')}
                      :
                      {' '}
                    </span>
                    <span className="font-mono">
                      ••••••
                      {config.apiKey.slice(-4)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={checked => onToggleEnabled(config.name, checked)}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {config.enabled ? t('disableConfig') : t('enableConfig')}
                </TooltipContent>
              </Tooltip>

              {!config.isDefault && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onSetDefault(config.name)}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('setAsDefault')}</TooltipContent>
                </Tooltip>
              )}

              <VSCodeStartButton configName={config.name} />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(config)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('edit')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(config.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('delete')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
