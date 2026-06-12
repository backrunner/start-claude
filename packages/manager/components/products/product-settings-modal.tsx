'use client'

import type { ExternalProductDefinition, ExternalProductSettings } from '@start-claude/cli/src/products/types'
import type { ReactNode } from 'react'
import { Cloud, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface ProductSettingsModalProps {
  open: boolean
  onClose: () => void
  product: ExternalProductDefinition
  settings: ExternalProductSettings
  onSave: (settings: ExternalProductSettings) => Promise<void>
}

export function ProductSettingsModal({
  open,
  onClose,
  product,
  settings,
  onSave,
}: ProductSettingsModalProps): ReactNode {
  const t = useTranslations('productSettings')
  const [formData, setFormData] = useState<ExternalProductSettings>(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFormData(settings)
  }, [settings, open])

  const sync = formData.sync || {
    enabled: false,
    provider: 'icloud' as const,
    linkedAt: new Date().toISOString(),
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(formData)
      onClose()
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onClose()
      }
    }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t('title', { product: product.shortTitle })}</DialogTitle>
              <DialogDescription>{t('description', { product: product.shortTitle })}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="product-sync-enabled">{t('sync.enabled')}</Label>
                  <p className="text-sm text-muted-foreground">{t('sync.enabledDescription')}</p>
                </div>
              </div>
              <Switch
                id="product-sync-enabled"
                checked={sync.enabled}
                onCheckedChange={(enabled) => {
                  setFormData(prev => ({
                    ...prev,
                    sync: {
                      ...sync,
                      enabled,
                      linkedAt: sync.linkedAt || new Date().toISOString(),
                    },
                  }))
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('sync.provider')}</Label>
                <Select
                  value={sync.provider}
                  onValueChange={(provider: 'icloud' | 'onedrive' | 'custom') => {
                    setFormData(prev => ({
                      ...prev,
                      sync: {
                        ...sync,
                        provider,
                        linkedAt: sync.linkedAt || new Date().toISOString(),
                      },
                    }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="icloud">iCloud</SelectItem>
                    <SelectItem value="onedrive">OneDrive</SelectItem>
                    <SelectItem value="custom">{t('sync.custom')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-sync-path">{t('sync.path')}</Label>
                <Input
                  id="product-sync-path"
                  value={sync.customPath || sync.cloudPath || ''}
                  onChange={(event) => {
                    setFormData(prev => ({
                      ...prev,
                      sync: {
                        ...sync,
                        customPath: event.target.value,
                        cloudPath: event.target.value,
                        linkedAt: sync.linkedAt || new Date().toISOString(),
                      },
                    }))
                  }}
                  placeholder="/path/to/sync/folder"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
