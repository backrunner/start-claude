'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { Settings } from 'lucide-react'
import { ConfigItem } from './config-item'
import { Card, CardContent } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'

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