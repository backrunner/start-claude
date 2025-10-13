'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Edit, GripVertical, Shield, Star, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VSCodeStartButton } from '@/components/vscode/vscode-start-button'

interface ConfigItemProps {
  config: ClaudeConfig
  onEdit: (config: ClaudeConfig) => void
  onDelete: (name: string) => void
  onToggleEnabled: (name: string, enabled: boolean) => void
  onSetDefault: (name: string) => void
}

export function ConfigItem({ config, onEdit, onDelete, onToggleEnabled, onSetDefault }: ConfigItemProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Helper function to clean baseUrl by removing /anthropic path
  const getCleanBaseUrl = (baseUrl?: string): string | undefined => {
    if (!baseUrl)
      return undefined
    let clean = baseUrl.replace(/^https?:\/\//, '')
    clean = clean.replace(/\/v1\/anthropic\/?$/, '').replace(/\/anthropic\/?$/, '')
    return clean || undefined
  }

  const cleanBaseUrl = getCleanBaseUrl(config.baseUrl)
  const isEnabled = config.enabled ?? false
  const isDefault = config.isDefault ?? false

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <Card className={`group relative overflow-hidden transition-all duration-200 hover:shadow-lg ${isEnabled ? 'border-l-4 border-l-primary shadow-sm' : ''}`}>
        <CardContent className="p-4 sm:p-5">
          {/* Mobile Layout */}
          <div className="flex flex-col gap-3 sm:hidden">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-accent rounded-lg transition-colors absolute top-3 right-3"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="flex items-start gap-4 pr-12">
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center font-bold text-sm border-2">
                  {(config.order ?? 0) || 1}
                </div>
                {isDefault && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                    <Star className="h-2.5 w-2.5 text-white fill-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold mb-1 truncate">{config.name}</h3>
                <Badge variant="outline" className="text-xs">
                  {config.profileType === 'official' && <Shield className="h-3 w-3 mr-1" />}
                  {config.profileType === 'official' ? 'Official' : 'Custom'}
                </Badge>
              </div>
            </div>

            {(cleanBaseUrl || config.model) && (
              <div className="flex flex-col gap-1.5">
                {cleanBaseUrl && (
                  <code className="text-xs px-2 py-1 rounded bg-muted/70 font-mono text-muted-foreground truncate">
                    {cleanBaseUrl}
                  </code>
                )}
                {config.model && (
                  <code className="text-xs px-2 py-1 rounded bg-primary/10 font-mono text-primary truncate">
                    {config.model}
                  </code>
                )}
              </div>
            )}

            {(config.permissionMode ?? 'default') !== 'default' && (
              <Badge variant="secondary" className="text-xs w-fit">
                {config.permissionMode === 'acceptEdits' && '✓ Accept Edits'}
                {config.permissionMode === 'plan' && '📋 Plan'}
                {config.permissionMode === 'bypassPermissions' && '⚡ Bypass'}
              </Badge>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <div className="flex items-center gap-1.5">
                <Switch
                  id={`enabled-${config.name}`}
                  checked={isEnabled}
                  onCheckedChange={(checked: boolean) => onToggleEnabled(config.name, checked)}
                />
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => onSetDefault(config.name)} className="h-8 w-8">
                      <Star className={`h-4 w-4 ${isDefault ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Set default</p></TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => onEdit(config)} className="h-8 w-8">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Edit</p></TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(config.name)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Delete</p></TooltipContent>
                </Tooltip>
              </div>
              <VSCodeStartButton configName={config.name} className="text-xs px-3 h-8" />
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden sm:flex items-center gap-4 pl-6">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-2 hover:bg-accent rounded-lg transition-colors absolute left-2 top-1/2 -translate-y-1/2"
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center font-bold text-lg border-2">
                {(config.order ?? 0) || 1}
              </div>
              {isDefault && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
                  <Star className="h-3 w-3 text-white fill-white" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold truncate">{config.name}</h3>
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {config.profileType === 'official' && <Shield className="h-3 w-3 mr-1" />}
                  {config.profileType === 'official' ? 'Official Account' : 'Custom API'}
                </Badge>
                {(config.permissionMode ?? 'default') !== 'default' && (
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {config.permissionMode === 'acceptEdits' && '✓ Accept Edits'}
                    {config.permissionMode === 'plan' && '📋 Plan Mode'}
                    {config.permissionMode === 'bypassPermissions' && '⚡ Bypass'}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {cleanBaseUrl && (
                  <code className="text-xs px-2.5 py-1 rounded bg-muted/70 font-mono text-muted-foreground truncate max-w-md">
                    {cleanBaseUrl}
                  </code>
                )}
                {config.model && (
                  <code className="text-xs px-2.5 py-1 rounded bg-primary/10 font-mono text-primary truncate max-w-sm">
                    {config.model}
                  </code>
                )}
                <VSCodeStartButton configName={config.name} className="text-xs" />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Switch
                id={`enabled-${config.name}`}
                checked={isEnabled}
                onCheckedChange={(checked: boolean) => onToggleEnabled(config.name, checked)}
              />
              <div className="flex items-center gap-1">
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => onSetDefault(config.name)} className="h-9 w-9">
                      <Star className={`h-4 w-4 ${isDefault ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Set as default</p></TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => onEdit(config)} className="h-9 w-9">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Edit</p></TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(config.name)} className="h-9 w-9 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Delete</p></TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
