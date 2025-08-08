'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/types/config'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Edit, GripVertical, Star, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

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

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <Card className="mb-4 shadow-sm border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div {...attributes} {...listeners} className="cursor-grab hover:cursor-grabbing p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <GripVertical className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <CardTitle className="text-lg font-semibold">{config.name}</CardTitle>
                  {config.isDefault && (
                    <Badge variant="secondary" className="flex items-center space-x-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      <Star className="h-3 w-3" />
                      <span>Default</span>
                    </Badge>
                  )}
                  <Badge
                    variant={config.enabled ? 'default' : 'secondary'}
                    className={
                      config.enabled
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                    }
                  >
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <CardDescription className="text-sm">
                  {config.baseUrl && (
                    <span className="block font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded mb-1">
                      {config.baseUrl}
                    </span>
                  )}
                  {config.model && (
                    <span className="text-xs text-muted-foreground">
                      Model:
                      {' '}
                      {config.model}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(config)}
                className="hover:bg-blue-50 hover:border-blue-200 dark:hover:bg-blue-900/20"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(config.name)}
                className="hover:bg-red-50 hover:border-red-200 dark:hover:bg-red-900/20 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id={`enabled-${config.name}`}
                  checked={config.enabled}
                  onCheckedChange={checked => onToggleEnabled(config.name, checked)}
                />
                <Label htmlFor={`enabled-${config.name}`} className="text-sm font-medium">
                  Enabled
                </Label>
              </div>
              {!config.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetDefault(config.name)}
                  className="hover:bg-yellow-50 hover:border-yellow-200 dark:hover:bg-yellow-900/20"
                >
                  <Star className="h-4 w-4 mr-2" />
                  Set as Default
                </Button>
              )}
            </div>
            <div className="text-sm text-muted-foreground bg-slate-50 dark:bg-slate-700 px-3 py-1 rounded">
              Order:
              {' '}
              {config.order ?? 0}
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

  return (
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
  )
}
