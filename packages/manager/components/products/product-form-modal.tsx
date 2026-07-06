'use client'

import type { ExternalAuthMode, ExternalProductConfig, ExternalProductDefinition } from '@start-claude/cli/src/products/types'
import type { ReactNode } from 'react'
import { Edit, KeyRound, Plus, Settings, Shield, Terminal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

interface ProductFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: ExternalProductDefinition
  config?: ExternalProductConfig | null
  mode?: 'create' | 'edit'
  onSave: (config: ExternalProductConfig) => Promise<void>
  onCancel: () => void
}

const sandboxModes: Array<NonNullable<ExternalProductConfig['sandboxMode']>> = [
  'read-only',
  'workspace-write',
  'danger-full-access',
]

const approvalPolicies: Array<NonNullable<ExternalProductConfig['approvalPolicy']>> = [
  'untrusted',
  'on-request',
  'on-failure',
  'never',
]

export function ProductFormModal({
  open,
  onOpenChange,
  product,
  config,
  mode,
  onSave,
  onCancel,
}: ProductFormModalProps): ReactNode {
  const t = useTranslations('productForm')
  const [formData, setFormData] = useState<ExternalProductConfig>(getDefaultFormData(product))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEditing = mode ? mode === 'edit' : Boolean(config)

  useEffect(() => {
    setFormData(config ? { ...getDefaultFormData(product), ...config } : getDefaultFormData(product))
    setErrors({})
  }, [config, open, product])

  const handleChange = <K extends keyof ExternalProductConfig>(field: K, value: ExternalProductConfig[K]): void => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleSubmit = async (): Promise<void> => {
    const validationErrors = validateForm(formData, {
      nameRequired: t('validation.nameRequired'),
      apiKeyRequired: t('validation.apiKeyRequired'),
      baseUrlInvalid: t('validation.baseUrlInvalid'),
    })
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setSaving(true)
    try {
      await onSave(normalizeFormData(formData))
      onOpenChange(false)
    }
    finally {
      setSaving(false)
    }
  }

  const handleCancel = (): void => {
    onCancel()
    onOpenChange(false)
  }

  const authMode = formData.authMode || 'api-key'
  const showApiKeyFields = authMode === 'api-key'
  const showVertexFields = authMode === 'vertex-ai'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-6 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent -mt-6 -mx-6 px-6 pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              {isEditing ? <Edit className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold">
                {isEditing ? t('editTitle', { product: product.shortTitle }) : t('createTitle', { product: product.shortTitle })}
              </DialogTitle>
              <DialogDescription className="text-base mt-1.5 text-muted-foreground">
                {t('description', { product: product.shortTitle })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-6 px-1">
          <div className="space-y-6 pr-3">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{t('basic.title')}</CardTitle>
                    <CardDescription>{t('basic.description')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('basic.name')} *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={event => handleChange('name', event.target.value)}
                    placeholder={t('basic.namePlaceholder', { product: product.shortTitle })}
                    className={errors.name ? 'border-destructive' : ''}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="authMode">{t('basic.authMode')}</Label>
                    <Select
                      value={authMode}
                      onValueChange={value => handleChange('authMode', value as ExternalAuthMode)}
                    >
                      <SelectTrigger id="authMode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {product.authModes.map(mode => (
                          <SelectItem key={mode} value={mode}>{t(`authModes.${mode}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model">{t('basic.model')}</Label>
                    <Input
                      id="model"
                      value={formData.model || ''}
                      onChange={event => handleChange('model', event.target.value)}
                      placeholder={product.defaultModel}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label htmlFor="isDefault">{t('basic.default')}</Label>
                    <p className="text-sm text-muted-foreground">{t('basic.defaultDescription', { product: product.shortTitle })}</p>
                  </div>
                  <Switch
                    id="isDefault"
                    checked={formData.isDefault ?? false}
                    onCheckedChange={checked => handleChange('isDefault', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{t('auth.title')}</CardTitle>
                    <CardDescription>{t('auth.description')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showApiKeyFields && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="apiKey">{t('auth.apiKey')}</Label>
                        <Input
                          id="apiKey"
                          type="password"
                          value={formData.apiKey || ''}
                          onChange={event => handleChange('apiKey', event.target.value)}
                          placeholder={product.id === 'codex' ? 'sk-...' : 'AIza...'}
                          className={errors.apiKey ? 'border-destructive' : ''}
                        />
                        {errors.apiKey && <p className="text-sm text-destructive">{errors.apiKey}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="apiKeyEnvVar">{t('auth.apiKeyEnvVar')}</Label>
                        <Input
                          id="apiKeyEnvVar"
                          value={formData.apiKeyEnvVar || product.defaultApiKeyEnvVar}
                          onChange={event => handleChange('apiKeyEnvVar', event.target.value)}
                        />
                      </div>
                    </div>

                  </>
                )}

                {showVertexFields && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="googleCloudProject">{t('auth.googleCloudProject')}</Label>
                      <Input
                        id="googleCloudProject"
                        value={formData.googleCloudProject || ''}
                        onChange={event => handleChange('googleCloudProject', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="googleCloudLocation">{t('auth.googleCloudLocation')}</Label>
                      <Input
                        id="googleCloudLocation"
                        value={formData.googleCloudLocation || ''}
                        onChange={event => handleChange('googleCloudLocation', event.target.value)}
                        placeholder="us-central1"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="googleApplicationCredentials">{t('auth.googleApplicationCredentials')}</Label>
                      <Input
                        id="googleApplicationCredentials"
                        value={formData.googleApplicationCredentials || ''}
                        onChange={event => handleChange('googleApplicationCredentials', event.target.value)}
                        placeholder="/path/to/service-account.json"
                      />
                    </div>
                  </div>
                )}

                {product.supportsBaseUrl && (
                  <div className="space-y-2">
                    <Label htmlFor="baseUrl">{t('auth.baseUrl')}</Label>
                    <Input
                      id="baseUrl"
                      value={formData.baseUrl || ''}
                      onChange={event => handleChange('baseUrl', event.target.value)}
                      placeholder={product.id === 'codex' ? 'https://api.openai.com/v1' : 'https://my-gemini-proxy.example.com'}
                      className={errors.baseUrl ? 'border-destructive' : ''}
                    />
                    {errors.baseUrl && <p className="text-sm text-destructive">{errors.baseUrl}</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                    <Terminal className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{t('advanced.title')}</CardTitle>
                    <CardDescription>{t('advanced.description')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {product.supportsSandbox && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="sandboxMode">{t('advanced.sandboxMode')}</Label>
                      <Select
                        value={formData.sandboxMode || 'workspace-write'}
                        onValueChange={value => handleChange('sandboxMode', value as ExternalProductConfig['sandboxMode'])}
                      >
                        <SelectTrigger id="sandboxMode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sandboxModes.map(mode => (
                            <SelectItem key={mode} value={mode}>{t(`sandboxModes.${mode}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="approvalPolicy">{t('advanced.approvalPolicy')}</Label>
                      <Select
                        value={formData.approvalPolicy || 'on-request'}
                        onValueChange={value => handleChange('approvalPolicy', value as ExternalProductConfig['approvalPolicy'])}
                      >
                        <SelectTrigger id="approvalPolicy">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {approvalPolicies.map(policy => (
                            <SelectItem key={policy} value={policy}>{t(`approvalPolicies.${policy}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="env">{t('advanced.env')}</Label>
                  <Textarea
                    id="env"
                    value={envToText(formData.env)}
                    onChange={event => handleChange('env', textToEnv(event.target.value))}
                    placeholder="KEY=value"
                    className="min-h-28 font-mono"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="enabled">{t('advanced.enabled')}</Label>
                      <p className="text-sm text-muted-foreground">{t('advanced.enabledDescription')}</p>
                    </div>
                  </div>
                  <Switch
                    id="enabled"
                    checked={formData.enabled !== false}
                    onCheckedChange={checked => handleChange('enabled', checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="pt-6 border-t bg-muted/20 flex-shrink-0 -mb-6 -mx-6 px-6 pb-6">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? t('saving') : isEditing ? t('update') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getDefaultFormData(product: ExternalProductDefinition): ExternalProductConfig {
  return {
    name: '',
    authMode: 'api-key',
    apiKey: '',
    apiKeyEnvVar: product.defaultApiKeyEnvVar,
    baseUrl: product.id === 'codex' ? 'https://api.openai.com/v1' : '',
    model: product.defaultModel,
    wireApi: 'responses',
    approvalPolicy: 'on-request',
    sandboxMode: product.supportsSandbox ? 'workspace-write' : undefined,
    isDefault: false,
    enabled: true,
    env: {},
  }
}

function validateForm(config: ExternalProductConfig, messages: {
  nameRequired: string
  apiKeyRequired: string
  baseUrlInvalid: string
}): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!config.name.trim()) {
    errors.name = messages.nameRequired
  }
  if ((config.authMode || 'api-key') === 'api-key' && !config.apiKey?.trim() && !config.apiKeyEnvVar?.trim()) {
    errors.apiKey = messages.apiKeyRequired
  }
  if (config.baseUrl?.trim()) {
    try {
      void new URL(config.baseUrl)
    }
    catch {
      errors.baseUrl = messages.baseUrlInvalid
    }
  }
  return errors
}

function normalizeFormData(config: ExternalProductConfig): ExternalProductConfig {
  return {
    ...config,
    apiKey: config.apiKey?.trim(),
    baseUrl: config.baseUrl?.trim(),
    model: config.model?.trim(),
    apiKeyEnvVar: config.apiKeyEnvVar?.trim(),
    googleCloudProject: config.googleCloudProject?.trim(),
    googleCloudLocation: config.googleCloudLocation?.trim(),
    googleApplicationCredentials: config.googleApplicationCredentials?.trim(),
  }
}

function envToText(env: Record<string, string> | undefined): string {
  return Object.entries(env || {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function textToEnv(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split('=')
        return [key.trim(), rest.join('=').trim()]
      })
      .filter(([key]) => key),
  )
}
