'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Edit, GripVertical, Settings, Shield, Star, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { VSCodeStartButton } from '@/components/vscode-start-button'

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

  const getProfileIcon = (): ReactNode => {
    switch (config.profileType) {
      case 'official':
        return <Shield className="h-4 w-4 text-primary" />
      case 'default':
      case undefined:
      default:
        return null // Remove icon for custom profile
    }
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <Card className={`transition-all duration-200 hover:shadow-md ${config.enabled ?? false ? 'border-primary/20' : 'border-muted'}`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-grab hover:cursor-grabbing p-2 rounded-lg hover:bg-muted transition-colors">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Title with Order on the left, followed by config name, base URL and model */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 font-semibold text-sm border border-zinc-200 dark:border-zinc-700">
                      {(config.order ?? 0) || 1}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground truncate">{config.name}</h3>
                    {(config.baseUrl || config.model) && (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {config.baseUrl && (
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate max-w-xs">
                            {config.baseUrl}
                          </code>
                        )}
                        {config.model && (
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate max-w-xs">
                            {config.model}
                          </code>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Configuration Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs flex items-center">
                    {getProfileIcon()}
                    <span className={config.profileType === 'official' ? 'ml-1' : ''}>
                      {config.profileType === 'official' ? 'Official Account' : 'Custom API'}
                    </span>
                  </Badge>
                  {(config.permissionMode ?? 'default') !== 'default' && (
                    <Badge variant="outline" className="text-xs">
                      {(() => {
                        switch (config.permissionMode ?? 'default') {
                          case 'acceptEdits':
                            return 'Accept Edits Permissions'
                          case 'plan':
                            return 'Plan Permissions'
                          case 'bypassPermissions':
                            return 'Bypass Permissions'
                          case 'default':
                          default:
                            return 'Default Permissions'
                        }
                      })()}
                    </Badge>
                  )}
                </div>
                
                {/* VSCode Start Button - only visible in VSCode plugin */}
                <VSCodeStartButton 
                  configName={config.name}
                  className="w-fit"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div>
                    <Switch
                      id={`enabled-${config.name}`}
                      checked={config.enabled ?? false}
                      onCheckedChange={(checked: boolean) => onToggleEnabled(config.name, checked)}
                      title={(config.enabled ?? false) ? 'Disable configuration' : 'Enable configuration'}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{(config.enabled ?? false) ? 'Disable configuration' : 'Enable configuration'}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSetDefault(config.name)}
                    title={(config.isDefault ?? false) ? 'Already default configuration' : 'Set as default configuration'}
                    className={`p-2 w-9 h-9 ${(config.isDefault ?? false)
                      ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:hover:bg-amber-900/30'
                      : 'hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-200 dark:hover:border-amber-800'
                    }`}
                  >
                    {(config.isDefault ?? false)
                      ? (
                          <Star className="h-4 w-4 text-amber-600 dark:text-amber-400 fill-current" />
                        )
                      : (
                          <Star className="h-4 w-4 text-muted-foreground" />
                        )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{(config.isDefault ?? false) ? 'Already default configuration' : 'Set as default configuration'}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(config)}
                    title="Edit configuration"
                    className="p-2 w-9 h-9 hover:bg-zinc-50 dark:hover:bg-zinc-900/20 hover:border-zinc-200 dark:hover:border-zinc-800"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Edit configuration</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(config.name)}
                    title="Delete configuration"
                    className="p-2 w-9 h-9 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Delete configuration</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface ConfigListProps {
  configs: ClaudeConfig[]
  onEdit: (config: ClaudeConfig) => void
  onDelete: (name: string) => void
  onToggleEnabled: (name: string, enabled: boolean) => void
  onSetDefault: (name: string) => void
}

export function ConfigList({ configs, onEdit, onDelete, onToggleEnabled, onSetDefault }: ConfigListProps): ReactNode {
  const sortedConfigs = [...configs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  if (configs.length === 0) {
    return (
      <Card className="border-dashed border-2 bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            <Settings className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-muted-foreground">No configurations</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first Claude configuration to get started.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {sortedConfigs.map(config => (
          <ConfigItem
            key={config.name}
            config={config}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleEnabled={onToggleEnabled}
            onSetDefault={onSetDefault}
          />
        ))}
      </div>
    </TooltipProvider>
  )
}
