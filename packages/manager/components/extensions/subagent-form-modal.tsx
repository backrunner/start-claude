'use client'

import type { ReactNode } from 'react'
import type { SubagentDefinition } from '@/config/types'
import { Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/use-toast'

interface SubagentFormModalProps {
  open: boolean
  onClose: () => void
  onSave: (subagent: SubagentDefinition) => Promise<void>
  initialData?: SubagentDefinition
  existingIds: string[]
}

export function SubagentFormModal({
  open,
  onClose,
  onSave,
  initialData,
  existingIds,
}: SubagentFormModalProps): ReactNode {
  const t = useTranslations('extensions.subagents.form')
  const isEdit = !!initialData

  const [formData, setFormData] = useState<SubagentDefinition>(
    initialData || {
      id: '',
      name: '',
      description: '',
      systemPrompt: '',
      tools: undefined,
      model: undefined,
    },
  )

  const [toolsText, setToolsText] = useState<string>(
    initialData?.tools ? initialData.tools.join(', ') : '',
  )

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { toast } = useToast()

  const generateId = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Name is required
    if (!formData.name.trim()) {
      newErrors.name = t('validation.nameRequired')
    }
    else {
      // Validate name format (lowercase, hyphens only)
      const nameRegex = /^[a-z0-9-]+$/
      if (!nameRegex.test(formData.name)) {
        newErrors.name = t('validation.nameFormat')
      }
    }

    // Check name uniqueness (only for new subagents or if name changed)
    const generatedId = generateId(formData.name)
    if (!isEdit || generatedId !== initialData?.id) {
      if (existingIds.includes(generatedId)) {
        newErrors.name = t('validation.nameExists')
      }
    }

    // Description is required
    if (!formData.description.trim()) {
      newErrors.description = t('validation.descriptionRequired')
    }

    // System prompt is required
    if (!formData.systemPrompt.trim()) {
      newErrors.systemPrompt = t('validation.systemPromptRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async (): Promise<void> => {
    if (!validateForm())
      return

    try {
      setSaving(true)

      // Parse tools
      const tools = toolsText.trim()
        ? toolsText.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : undefined

      const subagent: SubagentDefinition = {
        ...formData,
        id: isEdit ? formData.id : generateId(formData.name),
        name: formData.name.trim(),
        description: formData.description.trim(),
        systemPrompt: formData.systemPrompt.trim(),
        tools,
        model: formData.model || undefined,
      }

      await onSave(subagent)

      toast({
        title: isEdit ? t('saveSuccess') : t('addSuccess'),
        description: isEdit ? t('saveSuccessDescription') : t('addSuccessDescription'),
      })

      onClose()
    }
    catch (error) {
      console.error('Failed to save subagent:', error)
      toast({
        title: t('saveError'),
        description: t('saveErrorDescription'),
        variant: 'destructive',
      })
    }
    finally {
      setSaving(false)
    }
  }

  const handleSaveClick = (): void => {
    void handleSave()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('addTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('editDescription') : t('addDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              {t('name')}
              {' '}
              *
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('namePlaceholder')}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name
              ? (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )
              : (
                  <p className="text-sm text-muted-foreground">{t('nameHint')}</p>
                )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              {t('description')}
              {' '}
              *
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('descriptionPlaceholder')}
              rows={2}
              className={errors.description ? 'border-destructive' : ''}
            />
            {errors.description
              ? (
                  <p className="text-sm text-destructive">{errors.description}</p>
                )
              : (
                  <p className="text-sm text-muted-foreground">{t('descriptionHint')}</p>
                )}
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">
              {t('systemPrompt')}
              {' '}
              *
            </Label>
            <Textarea
              id="systemPrompt"
              value={formData.systemPrompt}
              onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
              placeholder={t('systemPromptPlaceholder')}
              rows={12}
              className={`font-mono text-sm ${errors.systemPrompt ? 'border-destructive' : ''}`}
            />
            {errors.systemPrompt
              ? (
                  <p className="text-sm text-destructive">{errors.systemPrompt}</p>
                )
              : (
                  <p className="text-sm text-muted-foreground">{t('systemPromptHint')}</p>
                )}
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model">{t('model')}</Label>
            <Select
              value={formData.model || 'inherit'}
              onValueChange={(value: 'sonnet' | 'opus' | 'haiku' | 'inherit') =>
                setFormData({ ...formData, model: value === 'inherit' ? undefined : value })}
            >
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">{t('modelInherit')}</SelectItem>
                <SelectItem value="sonnet">{t('modelSonnet')}</SelectItem>
                <SelectItem value="opus">{t('modelOpus')}</SelectItem>
                <SelectItem value="haiku">{t('modelHaiku')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{t('modelHint')}</p>
          </div>

          {/* Tools */}
          <div className="space-y-2">
            <Label htmlFor="tools">{t('tools')}</Label>
            <Input
              id="tools"
              value={toolsText}
              onChange={e => setToolsText(e.target.value)}
              placeholder={t('toolsPlaceholder')}
            />
            <p className="text-sm text-muted-foreground">{t('toolsHint')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSaveClick} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
