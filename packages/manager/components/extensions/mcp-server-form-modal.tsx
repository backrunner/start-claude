'use client'

import type { ReactNode } from 'react'
import type { McpServerDefinition } from '@/config/types'
import { Save, X } from 'lucide-react'
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

interface McpServerFormModalProps {
  open: boolean
  onClose: () => void
  onSave: (server: McpServerDefinition) => Promise<void>
  initialData?: McpServerDefinition
  existingIds: string[]
}

export function McpServerFormModal({
  open,
  onClose,
  onSave,
  initialData,
  existingIds,
}: McpServerFormModalProps): ReactNode {
  const t = useTranslations('extensions.mcp.form')
  const isEdit = !!initialData

  const [formData, setFormData] = useState<McpServerDefinition>(
    initialData || {
      id: '',
      name: '',
      description: '',
      type: 'stdio',
      command: '',
      args: [],
      env: {},
    },
  )

  const [envVars, setEnvVars] = useState<Array<{ key: string, value: string }>>(
    initialData?.env
      ? Object.entries(initialData.env).map(([key, value]) => ({ key, value }))
      : [{ key: '', value: '' }],
  )

  const [headers, setHeaders] = useState<Array<{ key: string, value: string }>>(
    initialData?.headers
      ? Object.entries(initialData.headers).map(([key, value]) => ({ key, value }))
      : [{ key: '', value: '' }],
  )

  const [argsText, setArgsText] = useState<string>(
    initialData?.args ? initialData.args.join(' ') : '',
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

    // Check name uniqueness (only for new servers or if name changed)
    const generatedId = generateId(formData.name)
    if (!isEdit || generatedId !== initialData?.id) {
      if (existingIds.includes(generatedId)) {
        newErrors.name = t('validation.nameExists')
      }
    }

    // Type-specific validation
    if (formData.type === 'stdio') {
      if (!formData.command?.trim()) {
        newErrors.command = t('validation.commandRequired')
      }
    }
    else if (formData.type === 'http') {
      if (!formData.url?.trim()) {
        newErrors.url = t('validation.urlRequired')
      }
      else {
        // Validate URL format
        try {
          void new URL(formData.url)
        }
        catch {
          newErrors.url = t('validation.urlInvalid')
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async (): Promise<void> => {
    if (!validateForm())
      return

    try {
      setSaving(true)

      // Build the final server object
      const server: McpServerDefinition = {
        ...formData,
        id: isEdit ? formData.id : generateId(formData.name),
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
      }

      if (formData.type === 'stdio') {
        server.command = formData.command?.trim() || ''
        server.args = argsText.trim()
          ? argsText.trim().split(/\s+/)
          : []

        // Build env object from envVars array
        const envObj: Record<string, string> = {}
        for (const { key, value } of envVars) {
          if (key.trim() && value.trim()) {
            envObj[key.trim()] = value.trim()
          }
        }
        server.env = Object.keys(envObj).length > 0 ? envObj : undefined

        // Remove http-specific fields
        delete server.url
        delete server.headers
      }
      else {
        server.url = formData.url?.trim() || ''

        // Build headers object from headers array
        const headersObj: Record<string, string> = {}
        for (const { key, value } of headers) {
          if (key.trim() && value.trim()) {
            headersObj[key.trim()] = value.trim()
          }
        }
        server.headers = Object.keys(headersObj).length > 0 ? headersObj : undefined

        // Remove stdio-specific fields
        delete server.command
        delete server.args
        delete server.env
      }

      await onSave(server)

      toast({
        title: isEdit ? t('saveSuccess') : t('addSuccess'),
        description: isEdit ? t('saveSuccessDescription') : t('addSuccessDescription'),
      })

      onClose()
    }
    catch (error) {
      console.error('Failed to save MCP server:', error)
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

  const handleTypeChange = (type: 'stdio' | 'http'): void => {
    setFormData({ ...formData, type })
    setErrors({}) // Clear errors when switching types
  }

  const handleAddEnvVar = (): void => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }

  const handleRemoveEnvVar = (index: number): void => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }

  const handleEnvVarChange = (index: number, field: 'key' | 'value', value: string): void => {
    const updated = [...envVars]
    updated[index][field] = value
    setEnvVars(updated)
  }

  const handleAddHeader = (): void => {
    setHeaders([...headers, { key: '', value: '' }])
  }

  const handleRemoveHeader = (index: number): void => {
    setHeaders(headers.filter((_, i) => i !== index))
  }

  const handleHeaderChange = (index: number, field: 'key' | 'value', value: string): void => {
    const updated = [...headers]
    updated[index][field] = value
    setHeaders(updated)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onEscapeKeyDown={(e) => {
          // Prevent ESC from bubbling to parent dialog
          e.stopPropagation()
        }}
      >
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
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('description')}</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('descriptionPlaceholder')}
              rows={2}
            />
          </div>

          {/* Transport Type */}
          <div className="space-y-2">
            <Label htmlFor="type">
              {t('type')}
              {' '}
              *
            </Label>
            <Select
              value={formData.type}
              onValueChange={(value: 'stdio' | 'http') => handleTypeChange(value)}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">{t('typeStdio')}</SelectItem>
                <SelectItem value="http">{t('typeHttp')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {formData.type === 'stdio' ? t('typeStdioHint') : t('typeHttpHint')}
            </p>
          </div>

          {/* Stdio-specific fields */}
          {formData.type === 'stdio' && (
            <>
              {/* Command */}
              <div className="space-y-2">
                <Label htmlFor="command">
                  {t('command')}
                  {' '}
                  *
                </Label>
                <Input
                  id="command"
                  value={formData.command || ''}
                  onChange={e => setFormData({ ...formData, command: e.target.value })}
                  placeholder={t('commandPlaceholder')}
                  className={errors.command ? 'border-destructive' : ''}
                />
                {errors.command && (
                  <p className="text-sm text-destructive">{errors.command}</p>
                )}
              </div>

              {/* Args */}
              <div className="space-y-2">
                <Label htmlFor="args">{t('args')}</Label>
                <Input
                  id="args"
                  value={argsText}
                  onChange={e => setArgsText(e.target.value)}
                  placeholder={t('argsPlaceholder')}
                />
                <p className="text-sm text-muted-foreground">{t('argsHint')}</p>
              </div>

              {/* Environment Variables */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('envVars')}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddEnvVar}>
                    {t('addEnvVar')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {envVars.map((envVar, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={envVar.key}
                        onChange={e => handleEnvVarChange(index, 'key', e.target.value)}
                        placeholder={t('envKeyPlaceholder')}
                        className="flex-1"
                      />
                      <Input
                        value={envVar.value}
                        onChange={e => handleEnvVarChange(index, 'value', e.target.value)}
                        placeholder={t('envValuePlaceholder')}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveEnvVar(index)}
                        disabled={envVars.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* HTTP-specific fields */}
          {formData.type === 'http' && (
            <>
              {/* URL */}
              <div className="space-y-2">
                <Label htmlFor="url">
                  {t('url')}
                  {' '}
                  *
                </Label>
                <Input
                  id="url"
                  value={formData.url || ''}
                  onChange={e => setFormData({ ...formData, url: e.target.value })}
                  placeholder={t('urlPlaceholder')}
                  className={errors.url ? 'border-destructive' : ''}
                />
                {errors.url && (
                  <p className="text-sm text-destructive">{errors.url}</p>
                )}
              </div>

              {/* Headers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('headers')}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddHeader}>
                    {t('addHeader')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {headers.map((header, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={header.key}
                        onChange={e => handleHeaderChange(index, 'key', e.target.value)}
                        placeholder={t('headerKeyPlaceholder')}
                        className="flex-1"
                      />
                      <Input
                        value={header.value}
                        onChange={e => handleHeaderChange(index, 'value', e.target.value)}
                        placeholder={t('headerValuePlaceholder')}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveHeader(index)}
                        disabled={headers.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
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
