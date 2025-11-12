'use client'

import type { ReactNode } from 'react'
import type { SkillDefinition } from '@/config/types'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/use-toast'

interface SkillFormModalProps {
  open: boolean
  onClose: () => void
  onSave: (skill: SkillDefinition) => Promise<void>
  initialData?: SkillDefinition
  existingIds: string[]
}

export function SkillFormModal({
  open,
  onClose,
  onSave,
  initialData,
  existingIds,
}: SkillFormModalProps): ReactNode {
  const t = useTranslations('extensions.skills.form')
  const isEdit = !!initialData

  const [formData, setFormData] = useState<SkillDefinition>(
    initialData || {
      id: '',
      name: '',
      description: '',
      content: '',
      allowedTools: undefined,
    },
  )

  const [allowedToolsText, setAllowedToolsText] = useState<string>(
    initialData?.allowedTools ? initialData.allowedTools.join(', ') : '',
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

    // Check name uniqueness (only for new skills or if name changed)
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

    // Content is required
    if (!formData.content.trim()) {
      newErrors.content = t('validation.contentRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async (): Promise<void> => {
    if (!validateForm())
      return

    try {
      setSaving(true)

      // Parse allowed tools
      const allowedTools = allowedToolsText.trim()
        ? allowedToolsText.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : undefined

      const skill: SkillDefinition = {
        ...formData,
        id: isEdit ? formData.id : generateId(formData.name),
        name: formData.name.trim(),
        description: formData.description.trim(),
        content: formData.content.trim(),
        allowedTools,
      }

      await onSave(skill)

      toast({
        title: isEdit ? t('saveSuccess') : t('addSuccess'),
        description: isEdit ? t('saveSuccessDescription') : t('addSuccessDescription'),
      })

      onClose()
    }
    catch (error) {
      console.error('Failed to save skill:', error)
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
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          {/* Content (SKILL.md) */}
          <div className="space-y-2">
            <Label htmlFor="content">
              {t('content')}
              {' '}
              *
            </Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={e => setFormData({ ...formData, content: e.target.value })}
              placeholder={t('contentPlaceholder')}
              rows={12}
              className={`font-mono text-sm ${errors.content ? 'border-destructive' : ''}`}
            />
            {errors.content
              ? (
                  <p className="text-sm text-destructive">{errors.content}</p>
                )
              : (
                  <p className="text-sm text-muted-foreground">{t('contentHint')}</p>
                )}
          </div>

          {/* Allowed Tools */}
          <div className="space-y-2">
            <Label htmlFor="allowedTools">{t('allowedTools')}</Label>
            <Input
              id="allowedTools"
              value={allowedToolsText}
              onChange={e => setAllowedToolsText(e.target.value)}
              placeholder={t('allowedToolsPlaceholder')}
            />
            <p className="text-sm text-muted-foreground">{t('allowedToolsHint')}</p>
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
