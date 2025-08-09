'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { Settings, Zap } from 'lucide-react'
import { useState } from 'react'
import { ConfigForm } from '@/components/config-form'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface ConfigFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config?: ClaudeConfig | null
  onSave: (config: ClaudeConfig) => void
  onCancel: () => void
}

export function ConfigFormModal({ open, onOpenChange, config, onSave, onCancel }: ConfigFormModalProps): ReactNode {
  const [transformerEnabled, setTransformerEnabled] = useState(false)

  const handleSave = (config: ClaudeConfig): void => {
    onSave(config)
    onOpenChange(false) // Close dialog after successful save
  }

  const handleCancel = (): void => {
    onCancel()
    onOpenChange(false) // Close dialog when cancelled
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-6 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-2xl font-semibold">
                  {config ? 'Edit Configuration' : 'Create Configuration'}
                </DialogTitle>
                <DialogDescription className="text-base mt-1">
                  {config ? 'Update your Claude configuration settings' : 'Set up a new Claude configuration'}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <Label htmlFor="transformer-switch" className="text-sm font-medium">
                  Transformer
                </Label>
                {transformerEnabled && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 text-xs">
                    Enabled
                  </Badge>
                )}
              </div>
              <Switch
                id="transformer-switch"
                checked={transformerEnabled}
                onCheckedChange={setTransformerEnabled}
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-6 px-1">
          <div className="pr-3">
            <ConfigForm
              config={config}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
