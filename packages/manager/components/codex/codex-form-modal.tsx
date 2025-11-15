'use client'

import type { CodexConfig } from '@start-claude/cli/src/codex/config/types'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface CodexFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: CodexConfig) => Promise<void>
  config: CodexConfig | null
}

export function CodexFormModal({ isOpen, onClose, onSave, config }: CodexFormModalProps): ReactNode {
  const t = useTranslations('codexForm')
  const [formData, setFormData] = useState<Partial<CodexConfig>>({
    name: '',
    apiKey: '',
    baseUrl: '',
    model: '',
    isDefault: false,
    enabled: true,
  })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (config) {
      setFormData(config)
    }
    else {
      setFormData({
        name: '',
        apiKey: '',
        baseUrl: '',
        model: '',
        isDefault: false,
        enabled: true,
      })
    }
  }, [config, isOpen])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    if (!formData.name || !formData.apiKey) {
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        ...formData,
        id: config?.id,
        order: config?.order ?? 0,
      } as CodexConfig)
    }
    finally {
      setIsSaving(false)
    }
  }

  const handleChange = (field: keyof CodexConfig, value: any): void => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{config ? t('editTitle') : t('addTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(e)
          }}
        >
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">{t('tabs.basic')}</TabsTrigger>
              <TabsTrigger value="advanced">{t('tabs.advanced')}</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  {t('name.label')}
                  {' '}
                  *
                </Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder={t('name.placeholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  {t('apiKey.label')}
                  {' '}
                  *
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey || ''}
                  onChange={e => handleChange('apiKey', e.target.value)}
                  placeholder={t('apiKey.placeholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseUrl">{t('baseUrl.label')}</Label>
                <Input
                  id="baseUrl"
                  value={formData.baseUrl || ''}
                  onChange={e => handleChange('baseUrl', e.target.value)}
                  placeholder={t('baseUrl.placeholder')}
                />
                <p className="text-xs text-muted-foreground">{t('baseUrl.help')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">{t('model.label')}</Label>
                <Input
                  id="model"
                  value={formData.model || ''}
                  onChange={e => handleChange('model', e.target.value)}
                  placeholder={t('model.placeholder')}
                />
                <p className="text-xs text-muted-foreground">{t('model.help')}</p>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isDefault">{t('isDefault.label')}</Label>
                  <p className="text-xs text-muted-foreground">{t('isDefault.help')}</p>
                </div>
                <Switch
                  id="isDefault"
                  checked={formData.isDefault || false}
                  onCheckedChange={checked => handleChange('isDefault', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enabled">{t('enabled.label')}</Label>
                  <p className="text-xs text-muted-foreground">{t('enabled.help')}</p>
                </div>
                <Switch
                  id="enabled"
                  checked={formData.enabled !== false}
                  onCheckedChange={checked => handleChange('enabled', checked)}
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !formData.name || !formData.apiKey}>
              {isSaving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
