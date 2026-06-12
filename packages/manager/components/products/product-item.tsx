'use client'

import type { ExternalProductConfig, ExternalProductDefinition } from '@start-claude/cli/src/products/types'
import type { ReactNode } from 'react'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { Copy, Edit, GripVertical, KeyRound, Star, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ProductItemProps {
  product: ExternalProductDefinition
  config: ExternalProductConfig
  onEdit: (config: ExternalProductConfig) => void
  onDelete: (name: string) => void
  onToggleEnabled: (name: string, enabled: boolean) => void
  onSetDefault: (name: string) => void
  onDuplicate: (config: ExternalProductConfig) => void
  dragDisabled?: boolean
}

export function ProductItem({
  product,
  config,
  onEdit,
  onDelete,
  onToggleEnabled,
  onSetDefault,
  onDuplicate,
  dragDisabled = false,
}: ProductItemProps): ReactNode {
  const t = useTranslations('productItem')
  const sortableId = config.id || config.name
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId, disabled: dragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isDefault = config.isDefault ?? false
  const isEnabled = config.enabled ?? true
  const redactedKey = config.apiKey ? `******${config.apiKey.slice(-4)}` : undefined

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <Card className={`group relative overflow-hidden transition-all duration-200 hover:shadow-lg ${isEnabled ? 'border-l-4 border-l-primary' : 'opacity-60'}`}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              {...attributes}
              {...(dragDisabled ? {} : listeners)}
              className={`p-2 rounded-lg transition-colors hidden sm:flex ${dragDisabled ? 'cursor-default opacity-40' : 'cursor-grab active:cursor-grabbing hover:bg-accent'}`}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold truncate">{config.name}</h3>
                {isDefault && (
                  <Badge variant="default" className="gap-1">
                    <Star className="h-3 w-3 fill-current" />
                    {t('default')}
                  </Badge>
                )}
                <Badge variant="outline">
                  {t(`authModes.${config.authMode || 'api-key'}`)}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <code className="rounded bg-muted px-2 py-1 font-mono text-muted-foreground">
                  {config.model || product.defaultModel}
                </code>
                {config.baseUrl && (
                  <code className="rounded bg-muted px-2 py-1 font-mono text-muted-foreground">
                    {cleanUrl(config.baseUrl)}
                  </code>
                )}
                {redactedKey && (
                  <code className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-muted-foreground">
                    <KeyRound className="h-3 w-3" />
                    {redactedKey}
                  </code>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 sm:border-t-0 sm:pt-0">
              <Switch
                checked={isEnabled}
                onCheckedChange={checked => onToggleEnabled(config.name, checked)}
              />
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => onSetDefault(config.name)}>
                    <Star className={`h-4 w-4 ${isDefault ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('setDefault')}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => onEdit(config)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('edit')}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => onDuplicate(config)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('duplicate')}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(config.name)} className="text-muted-foreground hover:text-destructive">
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

function cleanUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
