'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { useTranslations } from 'next-intl'
import { AlertCircle, ArrowRightLeft, Brain, Globe, Key, Settings, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

interface ConfigFormProps {
  config?: ClaudeConfig | null
  onSave: (config: ClaudeConfig) => void
  onCancel: () => void
  onFormDataChange?: (formData: ClaudeConfig, isValid: boolean) => void
}

interface TransformerOption {
  value: string
  label: string
  description: string
}

interface ModelPreset {
  key: string
  model: string
  color: 'blue' | 'green' | 'purple' | 'orange' | 'teal'
}

const transformerTranslationKeys: Record<string, string> = {
  auto: 'auto',
  openai: 'openai',
  'openai-responses': 'openaiResponses',
  openrouter: 'openrouter',
  gemini: 'gemini',
}

const modelPresets: ModelPreset[] = [
  { key: 'claudeFable5', model: 'claude-fable-5', color: 'purple' },
  { key: 'claudeOpus5', model: 'claude-opus-5', color: 'purple' },
  { key: 'claudeSonnet5', model: 'claude-sonnet-5', color: 'purple' },
  { key: 'claudeHaiku45', model: 'claude-haiku-4-5-20251001', color: 'purple' },
  { key: 'gpt56Sol', model: 'gpt-5.6-sol', color: 'green' },
  { key: 'gpt56Terra', model: 'gpt-5.6-terra', color: 'green' },
  { key: 'gpt56Luna', model: 'gpt-5.6-luna', color: 'green' },
  { key: 'gemini31Pro', model: 'gemini-3.1-pro-preview', color: 'blue' },
  { key: 'deepseekV4Pro', model: 'deepseek-v4-pro', color: 'teal' },
  { key: 'deepseekV4Flash', model: 'deepseek-v4-flash', color: 'teal' },
  { key: 'glm52', model: 'glm-5.2', color: 'orange' },
  { key: 'kimiK27Code', model: 'kimi-k2.7-code', color: 'blue' },
  { key: 'kimiK27CodeHighspeed', model: 'kimi-k2.7-code-highspeed', color: 'blue' },
]

const modelPresetButtonClasses: Record<ModelPreset['color'], string> = {
  blue: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300',
  green: 'hover:bg-green-50 hover:text-green-700 hover:border-green-300 dark:hover:bg-green-950/30 dark:hover:text-green-300',
  purple: 'hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 dark:hover:bg-purple-950/30 dark:hover:text-purple-300',
  orange: 'hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 dark:hover:bg-orange-950/30 dark:hover:text-orange-300',
  teal: 'hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 dark:hover:bg-teal-950/30 dark:hover:text-teal-300',
}

const fallbackTransformers: TransformerOption[] = [
  {
    value: 'auto',
    label: 'Auto',
    description: 'Automatically detect transformer based on API endpoint domain',
  },
  {
    value: 'openai',
    label: 'OpenAI Chat Completions',
    description: 'Use /v1/chat/completions compatible request and response conversion',
  },
  {
    value: 'openai-responses',
    label: 'OpenAI Responses',
    description: 'Use /v1/responses compatible request and response conversion',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Use OpenRouter chat completions compatible conversion',
  },
  {
    value: 'gemini',
    label: 'Gemini',
    description: 'Use Google Gemini generateContent conversion',
  },
]

const permissionModeValues: Array<NonNullable<ClaudeConfig['permissionMode']>> = [
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'plan',
  'bypassPermissions',
]
const defaultPermissionMode: NonNullable<ClaudeConfig['permissionMode']> = 'default'
const oneMillionContextSuffix = '[1m]'
const oneMillionContextSuffixPattern = /(?:\[1m\])+\s*$/i
const claudeModelPattern = /(?:^|[/.:])claude(?:[-_.]|$)|^(?:fable|haiku|opus|sonnet)(?:[-_.]|$)/i

function hasOneMillionContextSuffix(value: string | undefined): boolean {
  return oneMillionContextSuffixPattern.test(value ?? '')
}

function removeOneMillionContextSuffix(value: string): string {
  return value.replace(oneMillionContextSuffixPattern, '')
}

function isClaudeModel(value: string): boolean {
  return claudeModelPattern.test(removeOneMillionContextSuffix(value).trim())
}

function getModelValue(value: string, oneMillionContextEnabled: boolean): string {
  const model = removeOneMillionContextSuffix(value)
  return oneMillionContextEnabled && model
    ? `${model}${oneMillionContextSuffix}`
    : model
}

function isPermissionMode(value: string): value is NonNullable<ClaudeConfig['permissionMode']> {
  return permissionModeValues.includes(value as NonNullable<ClaudeConfig['permissionMode']>)
}

function hasApiCredential(data: ClaudeConfig): boolean {
  return Boolean(data.authToken?.trim() || data.apiKey?.trim())
}

function isValidConfigFormData(data: ClaudeConfig): boolean {
  if (!data.name?.trim())
    return false
  if (data.profileType !== 'official' && !data.baseUrl?.trim())
    return false
  if (data.profileType !== 'official' && !hasApiCredential(data))
    return false

  if (
    data.claudeCodeMaxRetries !== undefined
    && (!Number.isInteger(data.claudeCodeMaxRetries) || data.claudeCodeMaxRetries < 0)
  ) {
    return false
  }

  if (data.baseUrl?.trim()) {
    try {
      void new URL(data.baseUrl)
    }
    catch {
      return false
    }
  }

  if (data.customHeaders?.trim()) {
    const lines = data.customHeaders.split('\n').filter(line => line.trim())
    for (const line of lines) {
      if (!line.includes(':')) {
        return false
      }
    }
  }

  return true
}

export function ConfigForm({ config, onSave, onFormDataChange }: ConfigFormProps): ReactNode {
  const t = useTranslations('configForm')
  const [formData, setFormData] = useState<ClaudeConfig>(
    config
      ? {
          ...config,
          permissionMode: config.permissionMode ?? defaultPermissionMode,
        }
      : {
          name: '',
          profileType: 'default',
          baseUrl: '',
          authToken: '', // Primary API Key (ANTHROPIC_AUTH_TOKEN)
          apiKey: '', // Legacy API Key (ANTHROPIC_API_KEY)
          model: '',
          permissionMode: defaultPermissionMode,
          transformerEnabled: false,
          transformer: 'auto',
          isDefault: false,
          enabled: true,
          authorization: '',
          claudeCodeDisableNonessentialTraffic: true,
          claudeCodeDisableExperimentalBetas: true,
          customHeaders: '',
        },
  )

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [transformers, setTransformers] = useState<TransformerOption[]>(fallbackTransformers)
  const [loadingTransformers, setLoadingTransformers] = useState(false)
  const [oneMillionContextEnabled, setOneMillionContextEnabled] = useState(
    config?.model ? hasOneMillionContextSuffix(config.model) : true,
  )
  const [lastNonBypassPermissionMode, setLastNonBypassPermissionMode] = useState<NonNullable<ClaudeConfig['permissionMode']>>(
    config?.permissionMode && config.permissionMode !== 'bypassPermissions'
      ? config.permissionMode
      : defaultPermissionMode,
  )

  // Fetch available transformers
  useEffect(() => {
    const fetchTransformers = async (): Promise<void> => {
      setLoadingTransformers(true)
      try {
        const response = await fetch('/api/transformers')
        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data.transformers) && data.transformers.length > 0) {
            setTransformers(data.transformers)
          }
        }
      }
      catch (error) {
        console.error('Failed to fetch transformers:', error)
      }
      finally {
        setLoadingTransformers(false)
      }
    }
    void fetchTransformers()
  }, [])

  useEffect(() => {
    if (config) {
      const configWithDefaults = {
        ...config,
        permissionMode: config.permissionMode ?? defaultPermissionMode,
      }
      setLastNonBypassPermissionMode(
        configWithDefaults.permissionMode !== 'bypassPermissions'
          ? configWithDefaults.permissionMode
          : defaultPermissionMode,
      )
      setOneMillionContextEnabled(hasOneMillionContextSuffix(configWithDefaults.model))
      setFormData(configWithDefaults)
      // Call onFormDataChange with initial data
      if (onFormDataChange) {
        const isValid = isValidConfigFormData(configWithDefaults)
        onFormDataChange(configWithDefaults, isValid)
      }
    }
    else {
      setOneMillionContextEnabled(true)
      if (onFormDataChange) {
        // Call with default form data
        const defaultData = {
          name: '',
          profileType: 'default' as const,
          baseUrl: '',
          authToken: '', // Primary API Key (ANTHROPIC_AUTH_TOKEN)
          apiKey: '', // Legacy API Key (ANTHROPIC_API_KEY)
          model: '',
          permissionMode: defaultPermissionMode,
          transformerEnabled: false,
          transformer: 'auto',
          isDefault: false,
          enabled: true,
          claudeCodeDisableNonessentialTraffic: true,
          claudeCodeDisableExperimentalBetas: true,
        }
        const isValid = isValidConfigFormData(defaultData)
        onFormDataChange(defaultData, isValid)
      }
    }
  }, [config, onFormDataChange])

  const handleChange = (field: keyof ClaudeConfig, value: string | boolean | number | undefined): void => {
    const newFormData = { ...formData, [field]: value }
    setFormData(newFormData)
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }

    // Call onFormDataChange if provided
    if (onFormDataChange) {
      const isValid = isValidConfigFormData(newFormData)
      onFormDataChange(newFormData, isValid)
    }
  }

  const handleNumberChange = (field: keyof ClaudeConfig, value: string): void => {
    const numericValue = Number(value)
    handleChange(field, value === '' || !Number.isFinite(numericValue) ? undefined : numericValue)
  }

  const handleModelChange = (value: string): void => {
    const valueHasSuffix = hasOneMillionContextSuffix(value)
    const suffixEnabled = valueHasSuffix || (oneMillionContextEnabled && isClaudeModel(value))

    if (valueHasSuffix) {
      setOneMillionContextEnabled(true)
    }

    handleChange('model', getModelValue(value, suffixEnabled))
  }

  const handleOneMillionContextChange = (checked: boolean): void => {
    setOneMillionContextEnabled(checked)
    handleChange('model', getModelValue(formData.model ?? '', checked))
  }

  const handlePermissionModeChange = (value: string): void => {
    if (!isPermissionMode(value)) {
      return
    }

    if (value !== 'bypassPermissions') {
      setLastNonBypassPermissionMode(value)
    }
    handleChange('permissionMode', value)
  }

  const handleDangerouslySkipPermissionsChange = (checked: boolean): void => {
    if (checked) {
      if (formData.permissionMode && formData.permissionMode !== 'bypassPermissions') {
        setLastNonBypassPermissionMode(formData.permissionMode)
      }
      handleChange('permissionMode', 'bypassPermissions')
      return
    }

    handleChange('permissionMode', lastNonBypassPermissionMode)
  }

  const convertLegacyApiKeyToAuthToken = (): void => {
    const newFormData = {
      ...formData,
      authToken: formData.apiKey ?? '',
      apiKey: '',
    }
    setFormData(newFormData)
    setErrors(prev => ({ ...prev, authToken: '', apiKey: '' }))

    if (onFormDataChange) {
      const isValid = isValidConfigFormData(newFormData)
      onFormDataChange(newFormData, isValid)
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('basicInfo.nameRequired')
    }

    if (formData.profileType !== 'official' && !formData.baseUrl?.trim()) {
      newErrors.baseUrl = t('apiConfig.baseUrlRequired')
    }
    else if (formData.baseUrl?.trim()) {
      try {
        void new URL(formData.baseUrl)
      }
      catch {
        newErrors.baseUrl = t('apiConfig.baseUrlInvalid')
      }
    }

    if (formData.profileType !== 'official' && !hasApiCredential(formData)) {
      newErrors.authToken = t('apiConfig.apiKeyRequired')
    }

    if (
      formData.claudeCodeMaxRetries !== undefined
      && (!Number.isInteger(formData.claudeCodeMaxRetries) || formData.claudeCodeMaxRetries < 0)
    ) {
      newErrors.claudeCodeMaxRetries = t('advanced.maxRetriesInvalid')
    }

    // Validate customHeaders format
    if (formData.customHeaders?.trim()) {
      const lines = formData.customHeaders.split('\n').filter(line => line.trim())
      for (const line of lines) {
        if (!line.includes(':')) {
          newErrors.customHeaders = t('advanced.customHeadersInvalid')
          break
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    onSave(formData)
  }

  const getTransformerLabel = (transformer: TransformerOption): string => {
    const translationKey = transformerTranslationKeys[transformer.value]
    return translationKey
      ? t(`modelPermissions.transformers.${translationKey}.label`)
      : transformer.label
  }

  const getTransformerDescription = (transformer: TransformerOption): string => {
    const translationKey = transformerTranslationKeys[transformer.value]
    return translationKey
      ? t(`modelPermissions.transformers.${translationKey}.description`)
      : transformer.description
  }

  const selectedTransformer = transformers.find(
    transformer => transformer.value === (formData.transformer || 'auto'),
  )
  const modelHasOneMillionContextSuffix = hasOneMillionContextSuffix(formData.model)
  const oneMillionContextAvailable = !formData.model || isClaudeModel(formData.model) || modelHasOneMillionContextSuffix

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full" id="config-form">
      <div className="flex-1 space-y-6 pr-2">
        {/* Basic Information */}
        <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10 border-2 hover:border-blue-500/30 group">
          <CardHeader className="pb-5 bg-gradient-to-br from-blue-50/50 via-transparent to-transparent dark:from-blue-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-all duration-300">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">{t('basicInfo.title')}</CardTitle>
                <CardDescription className="text-sm mt-0.5">{t('basicInfo.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="font-medium">{t('basicInfo.name')} *</Label>
              <Input
                id="name"
                value={formData.name ?? ''}
                onChange={e => handleChange('name', e.target.value)}
                placeholder={t('basicInfo.namePlaceholder')}
                className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {errors.name && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.name}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="profileType" className="font-medium">{t('basicInfo.profileType')}</Label>
              <Select
                value={formData.profileType ?? 'default'}
                onValueChange={(value) => {
                  if (value && (value === 'default' || value === 'official')) {
                    handleChange('profileType', value)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('basicInfo.profileTypePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {t('basicInfo.profileDefault')}
                    </div>
                  </SelectItem>
                  <SelectItem value="official">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      {t('basicInfo.profileOfficial')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* API Configuration */}
        {formData.profileType !== 'official' && (
          <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-green-500/10 border-2 hover:border-green-500/30 group">
            <CardHeader className="pb-5 bg-gradient-to-br from-green-50/50 via-transparent to-transparent dark:from-green-950/20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/30 group-hover:shadow-green-500/50 transition-all duration-300">
                  <Key className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">{t('apiConfig.title')}</CardTitle>
                  <CardDescription className="text-sm mt-0.5">{t('apiConfig.description')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="baseUrl" className="font-medium flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  {t('apiConfig.baseUrl')} *
                </Label>
                <Input
                  id="baseUrl"
                  value={formData.baseUrl ?? ''}
                  onChange={e => handleChange('baseUrl', e.target.value)}
                  placeholder={t('apiConfig.baseUrlPlaceholder')}
                  className={errors.baseUrl ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {errors.baseUrl && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.baseUrl}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="authToken" className="font-medium flex items-center gap-2">
                  <Key className="h-3 w-3" />
                  {t('apiConfig.apiKey')} *
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="authToken"
                    type="password"
                    value={formData.authToken ?? ''}
                    onChange={e => handleChange('authToken', e.target.value)}
                    placeholder={t('apiConfig.apiKeyPlaceholder')}
                    className={errors.authToken ? 'border-destructive focus-visible:ring-destructive font-mono flex-1' : 'font-mono flex-1'}
                  />
                  {formData.apiKey && !formData.authToken && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 px-3 text-xs font-medium whitespace-nowrap hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 dark:hover:bg-orange-950/30 dark:hover:text-orange-300"
                      onClick={convertLegacyApiKeyToAuthToken}
                      title={t('apiConfig.convertToAuthTokenHint')}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                      {t('apiConfig.convertToAuthToken')}
                    </Button>
                  )}
                </div>
                {errors.authToken && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.authToken}
                  </div>
                )}
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100">{t('apiConfig.securityNote')}</p>
                      <p className="text-blue-700 dark:text-blue-300 mt-1">
                        {t('apiConfig.securityNoteText')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Model & Permissions */}
        <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 border-2 hover:border-purple-500/30 group">
          <CardHeader className="pb-5 bg-gradient-to-br from-purple-50/50 via-transparent to-transparent dark:from-purple-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30 group-hover:shadow-purple-500/50 transition-all duration-300">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">{t('modelPermissions.title')}</CardTitle>
                <CardDescription className="text-sm mt-0.5">{t('modelPermissions.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Model Presets */}
            <div className="space-y-2">
              <Label className="font-medium text-sm text-muted-foreground">{t('modelPresets.title')}</Label>
              <div className="flex flex-wrap gap-2">
                {modelPresets.map(preset => (
                  <Button
                    key={preset.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`h-8 text-xs font-medium ${modelPresetButtonClasses[preset.color]}`}
                    onClick={() => handleModelChange(preset.model)}
                  >
                    {t(`modelPresets.${preset.key}`)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model" className="font-medium flex items-center gap-2">
                <Brain className="h-3 w-3" />
                {t('modelPermissions.model')}
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <div className="flex items-stretch gap-2">
                <Input
                  id="model"
                  value={removeOneMillionContextSuffix(formData.model ?? '')}
                  onChange={e => handleModelChange(e.target.value)}
                  placeholder={t('modelPermissions.modelPlaceholder')}
                  className="min-w-0 flex-1 font-mono"
                />
                <div className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3">
                  <Label
                    htmlFor="oneMillionContext"
                    className="cursor-pointer font-mono text-xs"
                  >
                    {oneMillionContextSuffix}
                  </Label>
                  <Switch
                    id="oneMillionContext"
                    checked={oneMillionContextEnabled && oneMillionContextAvailable}
                    onCheckedChange={handleOneMillionContextChange}
                    disabled={!oneMillionContextAvailable}
                    aria-label={t('modelPermissions.oneMillionContext')}
                    title={t('modelPermissions.oneMillionContext')}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('modelPermissions.modelHelpText')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="smallFastModel" className="font-medium flex items-center gap-2">
                <Brain className="h-3 w-3" />
                {t('modelPermissions.smallModel')}
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="smallFastModel"
                  value={formData.smallFastModel ?? ''}
                  onChange={e => handleChange('smallFastModel', e.target.value)}
                  placeholder={t('modelPermissions.smallModelPlaceholder')}
                  className="font-mono flex-1"
                />
                {formData.model && formData.model !== formData.smallFastModel && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 text-xs font-medium whitespace-nowrap hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 dark:hover:bg-purple-950/30 dark:hover:text-purple-300"
                    onClick={() => handleChange('smallFastModel', formData.model ?? '')}
                    title={t('modelPermissions.useMainModelHint')}
                  >
                    {t('modelPermissions.useMainModel')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('modelPermissions.smallModelHelpText')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="permissionMode" className="font-medium">{t('modelPermissions.permissionMode')}</Label>
              <Select
                value={formData.permissionMode ?? defaultPermissionMode}
                onValueChange={handlePermissionModeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('modelPermissions.permissionModePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('modelPermissions.permissionDefault')}</SelectItem>
                  <SelectItem value="acceptEdits">{t('modelPermissions.permissionAcceptEdits')}</SelectItem>
                  <SelectItem value="auto">{t('modelPermissions.permissionAuto')}</SelectItem>
                  <SelectItem value="dontAsk">{t('modelPermissions.permissionDontAsk')}</SelectItem>
                  <SelectItem value="plan">{t('modelPermissions.permissionPlanMode')}</SelectItem>
                  <SelectItem value="bypassPermissions">{t('modelPermissions.permissionBypass')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border-2 bg-gradient-to-r from-red-50/70 to-orange-50/40 hover:border-red-400/40 transition-all duration-200 dark:from-red-950/20 dark:to-orange-950/10 dark:border-red-900/40">
              <div className="flex-1">
                <Label htmlFor="dangerouslySkipPermissions" className="font-semibold text-base cursor-pointer">
                  {t('modelPermissions.dangerouslySkipPermissions')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  {t('modelPermissions.dangerouslySkipPermissionsDescription')}
                </p>
              </div>
              <Switch
                id="dangerouslySkipPermissions"
                checked={formData.permissionMode === 'bypassPermissions'}
                onCheckedChange={handleDangerouslySkipPermissionsChange}
                className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-red-500 data-[state=checked]:to-orange-500 data-[state=unchecked]:bg-red-200 dark:data-[state=unchecked]:bg-red-900/30 border-transparent"
              />
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-primary/30 transition-all duration-200">
                <div className="flex-1">
                  <Label htmlFor="isDefault" className="font-semibold text-base cursor-pointer">{t('modelPermissions.defaultConfig')}</Label>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {t('modelPermissions.defaultConfigDescription')}
                  </p>
                </div>
                <Switch
                  id="isDefault"
                  checked={formData.isDefault ?? false}
                  onCheckedChange={checked => handleChange('isDefault', checked)}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-purple-600 data-[state=unchecked]:bg-purple-200 dark:data-[state=unchecked]:bg-purple-900/30 border-transparent"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-primary/30 transition-all duration-200">
                <div className="flex-1">
                  <Label htmlFor="transformerEnabled" className="font-semibold text-base cursor-pointer">{t('modelPermissions.transformer')}</Label>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {t('modelPermissions.transformerDescription')}
                  </p>
                </div>
                <Switch
                  id="transformerEnabled"
                  checked={formData.transformerEnabled ?? false}
                  onCheckedChange={checked => handleChange('transformerEnabled', checked)}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-purple-600 data-[state=unchecked]:bg-purple-200 dark:data-[state=unchecked]:bg-purple-900/30 border-transparent"
                />
              </div>

              {formData.transformerEnabled && (
                <div className="p-5 rounded-xl border-2 bg-gradient-to-br from-orange-50/50 via-transparent to-transparent dark:from-orange-950/20 border-orange-200/50 dark:border-orange-800/50">
                  <div className="flex flex-col space-y-3">
                    <Label htmlFor="transformer" className="font-medium">{t('modelPermissions.transformerType')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('modelPermissions.transformerHelpText')}
                    </p>
                    <Select
                      value={formData.transformer || 'auto'}
                      onValueChange={value => handleChange('transformer', value)}
                      disabled={loadingTransformers}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingTransformers ? t('modelPermissions.transformerLoading') : t('modelPermissions.transformerPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {transformers.map(transformer => (
                          <SelectItem key={transformer.value} value={transformer.value}>
                            {getTransformerLabel(transformer)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTransformer && (
                      <p className="rounded-md border bg-background/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        {getTransformerDescription(selectedTransformer)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-primary/30 transition-all duration-200">
                <div className="flex-1">
                  <Label htmlFor="enabled" className="font-semibold text-base cursor-pointer">{t('modelPermissions.enabled')}</Label>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {t('modelPermissions.enabledDescription')}
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={formData.enabled ?? true}
                  onCheckedChange={checked => handleChange('enabled', checked)}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-purple-600 data-[state=unchecked]:bg-purple-200 dark:data-[state=unchecked]:bg-purple-900/30 border-transparent"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/10 border-2 hover:border-orange-500/30 group">
          <CardHeader className="pb-5 bg-gradient-to-br from-orange-50/50 via-transparent to-transparent dark:from-orange-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-all duration-300">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">{t('advanced.title')}</CardTitle>
                <CardDescription className="text-sm mt-0.5">{t('advanced.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="claudeCodeMaxRetries" className="font-medium flex items-center gap-2">
                  <Settings className="h-3 w-3" />
                  {t('advanced.maxRetries')}
                  <Badge variant="outline" className="text-xs">Optional</Badge>
                </Label>
                <Input
                  id="claudeCodeMaxRetries"
                  type="number"
                  min={0}
                  step={1}
                  value={formData.claudeCodeMaxRetries ?? ''}
                  onChange={e => handleNumberChange('claudeCodeMaxRetries', e.target.value)}
                  placeholder={t('advanced.maxRetriesPlaceholder')}
                  className={errors.claudeCodeMaxRetries ? 'border-destructive focus-visible:ring-destructive font-mono' : 'font-mono'}
                />
                {errors.claudeCodeMaxRetries && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.claudeCodeMaxRetries}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('advanced.maxRetriesHelpText')}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-orange-500/30 transition-all duration-200">
                <div className="flex-1">
                  <Label htmlFor="claudeCodeRetryWatchdog" className="font-semibold text-base cursor-pointer">
                    {t('advanced.retryWatchdog')}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {t('advanced.retryWatchdogDescription')}
                  </p>
                </div>
                <Switch
                  id="claudeCodeRetryWatchdog"
                  checked={formData.claudeCodeRetryWatchdog ?? false}
                  onCheckedChange={checked => handleChange('claudeCodeRetryWatchdog', checked)}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:to-orange-600 data-[state=unchecked]:bg-orange-200 dark:data-[state=unchecked]:bg-orange-900/30 border-transparent"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey" className="font-medium flex items-center gap-2">
                <Key className="h-3 w-3" />
                {t('advanced.legacyApiKey')}
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <Input
                id="apiKey"
                type="password"
                value={formData.apiKey ?? ''}
                onChange={e => handleChange('apiKey', e.target.value)}
                placeholder={t('advanced.legacyApiKeyPlaceholder')}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t('advanced.legacyApiKeyHelpText')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="authorization" className="font-medium flex items-center gap-2">
                <Key className="h-3 w-3" />
                {t('advanced.authHeader')}
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <Input
                id="authorization"
                type="password"
                value={formData.authorization ?? ''}
                onChange={e => handleChange('authorization', e.target.value)}
                placeholder={t('advanced.authHeaderPlaceholder')}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t('advanced.authHeaderHelpText')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customHeaders" className="font-medium flex items-center gap-2">
                <Key className="h-3 w-3" />
                {t('advanced.customHeaders')}
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <Textarea
                id="customHeaders"
                value={formData.customHeaders ?? ''}
                onChange={e => handleChange('customHeaders', e.target.value)}
                placeholder={t('advanced.customHeadersPlaceholder')}
                className={errors.customHeaders ? 'border-destructive focus-visible:ring-destructive font-mono' : 'font-mono'}
                rows={3}
              />
              {errors.customHeaders && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.customHeaders}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t('advanced.customHeadersHelpText')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
