'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { Settings } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfigForm } from './config-form'

interface ConfigFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config?: ClaudeConfig | null
  onSave: (config: ClaudeConfig) => Promise<void>
  onCancel: () => void
}

export function ConfigFormModal({ open, onOpenChange, config, onSave, onCancel }: ConfigFormModalProps): ReactNode {
  const [formData, setFormData] = useState<ClaudeConfig | null>(null)
  const [isValid, setIsValid] = useState<boolean>(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async (): Promise<void> => {
    if (!formData || !isValid)
      return

    setSaving(true)
    try {
      await onSave(formData)
      // Only close modal if the API call succeeds
      onOpenChange(false)
    }
    catch (error) {
      console.error('Error saving configuration:', error)
      // Don't close modal on error - let user see the error and retry
    }
    finally {
      setSaving(false)
    }
  }

  const handleFormSave = (config: ClaudeConfig): void => {
    // This is called when form is submitted via Enter key
    // Use void to ignore the promise return to satisfy linter
    void (async (): Promise<void> => {
      setSaving(true)
      try {
        await onSave(config)
        // Only close modal if the API call succeeds
        onOpenChange(false)
      }
      catch (error) {
        console.error('Error saving configuration:', error)
        // Don't close modal on error
      }
      finally {
        setSaving(false)
      }
    })()
  }

  const handleCancel = (): void => {
    onCancel()
    onOpenChange(false) // Close dialog when cancelled
  }

  const handleFormDataChange = useCallback((data: ClaudeConfig, valid: boolean) => {
    setFormData(data)
    setIsValid(valid)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-6 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent -mt-6 -mx-6 px-6 pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
              <Settings className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {config ? 'Edit Configuration' : 'Create Configuration'}
              </DialogTitle>
              <DialogDescription className="text-base mt-1.5 text-muted-foreground">
                {config ? 'Update your Claude configuration settings' : 'Set up a new Claude configuration'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-6 px-1">
          <div className="pr-3">
            <ConfigForm
              config={config}
              onSave={handleFormSave}
              onCancel={handleCancel}
              onFormDataChange={handleFormDataChange}
            />
          </div>
        </div>

        <DialogFooter className="pt-6 border-t bg-gradient-to-r from-muted/20 to-transparent flex-shrink-0 -mb-6 -mx-6 px-6 pb-6">
          <div className="flex items-center justify-end w-full gap-3">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
              className="min-w-[100px] h-11 font-medium hover:bg-muted/80 transition-colors"
            >
              Cancel
            </Button>
            <Button
              onClick={(): void => { void handleSave() }}
              disabled={saving || !formData || !isValid}
              className="min-w-[140px] h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 font-semibold transition-all duration-200"
            >
              {saving
                ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Saving...
                    </div>
                  )
                : (
                    config ? 'Update Configuration' : 'Create Configuration'
                  )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
