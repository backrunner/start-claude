'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Edit, GripVertical, Star, Trash2, Settings, Globe, Shield, Brain, Activity } from 'lucide-react'
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

  const getProfileIcon = () => {
    switch (config.profileType) {
      case 'official':
        return <Shield className="h-4 w-4 text-primary" />
      default:
        return <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
    }
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <Card className={`transition-all duration-200 hover:shadow-md ${config.enabled ? 'border-primary/20' : 'border-muted'}`}>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div {...attributes} {...listeners} className="cursor-grab hover:cursor-grabbing p-2 rounded-lg hover:bg-muted transition-colors mt-1">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  {getProfileIcon()}
                  <CardTitle className="text-xl font-semibold truncate">{config.name}</CardTitle>
                </div>
                
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {config.isDefault && (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                      <Star className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                  <Badge
                    variant={config.enabled ? 'default' : 'secondary'}
                    className={
                      config.enabled
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    <Activity className="h-3 w-3 mr-1" />
                    {config.enabled ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {config.profileType === 'official' ? 'Official' : 'Custom'}
                  </Badge>
                </div>
                
                <CardDescription className="space-y-2">
                  {config.baseUrl && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate max-w-md">
                        {config.baseUrl}
                      </code>
                    </div>
                  )}
                  {config.model && (
                    <div className="flex items-center gap-2">
                      <Brain className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground font-mono">
                        {config.model}
                      </span>
                    </div>
                  )}
                  {config.permissionMode !== 'default' && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground capitalize">
                        {config.permissionMode.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </div>
                  )}
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(config)}
                className="hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(config.name)}
                className="hover:bg-destructive/10 hover:border-destructive/20 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 min-w-[120px]">
                <Label htmlFor={`enabled-${config.name}`} className="text-sm font-medium">
                  Enabled
                </Label>
                <Switch
                  id={`enabled-${config.name}`}
                  checked={config.enabled}
                  onCheckedChange={checked => onToggleEnabled(config.name, checked)}
                />
              </div>
              
              {!config.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetDefault(config.name)}
                  className="hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-200 dark:hover:border-amber-800 text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400"
                >
                  <Star className="h-4 w-4 mr-2" />
                  Set as Default
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
              <Settings className="h-3 w-3" />
              Order: {config.order ?? 0}
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
