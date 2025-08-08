'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/types/config'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Edit, GripVertical, Star, Trash2 } from 'lucide-react'

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
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div {...attributes} {...listeners} className="cursor-grab hover:cursor-grabbing">
                <GripVertical className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <CardTitle className="text-lg">{config.name}</CardTitle>
                  {config.isDefault && (
                    <Badge variant="secondary" className="flex items-center space-x-1">
                      <Star className="h-3 w-3" />
                      <span>Default</span>
                    </Badge>
                  )}
                  <Badge variant={config.enabled ? 'default' : 'secondary'}>
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <CardDescription>
                  {config.baseUrl && (
                    <span className="block">{config.baseUrl}</span>
                  )}
                  {config.model && (
                    <span className="block text-xs">
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
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(config.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id={`enabled-${config.name}`}
                  checked={config.enabled}
                  onCheckedChange={checked => onToggleEnabled(config.name, checked)}
                />
                <Label htmlFor={`enabled-${config.name}`}>Enabled</Label>
              </div>
              {!config.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetDefault(config.name)}
                >
                  <Star className="h-4 w-4 mr-2" />
                  Set as Default
                </Button>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
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
    <div>
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