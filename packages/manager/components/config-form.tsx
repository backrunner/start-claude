'use client'

import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { AlertCircle, Brain, Globe, Key, Settings, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface ConfigFormProps {
  config?: ClaudeConfig | null
  onSave: (config: ClaudeConfig) => void
  onCancel: () => void
  onFormDataChange?: (formData: ClaudeConfig, isValid: boolean) => void
}

export function ConfigForm({ config, onSave, onFormDataChange }: ConfigFormProps): ReactNode {
  const [formData, setFormData] = useState<ClaudeConfig>(config || {
    name: '',
    profileType: 'default',
    baseUrl: '',
    apiKey: '',
    model: '',
    permissionMode: 'default',
    transformerEnabled: false,
    transformer: 'auto',
    isDefault: false,
    enabled: true,
    authToken: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [transformers, setTransformers] = useState<Array<{ value: string, label: string, description: string }>>([])
  const [loadingTransformers, setLoadingTransformers] = useState(false)

  // Fetch available transformers
  useEffect(() => {
    const fetchTransformers = async (): Promise<void> => {
      setLoadingTransformers(true)
      try {
        const response = await fetch('/api/transformers')
        if (response.ok) {
          const data = await response.json()
          setTransformers(data.transformers || [])
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

  const validateFormData = (data: ClaudeConfig): boolean => {
    if (!data.name?.trim())
      return false
    if (data.profileType !== 'official' && !data.baseUrl?.trim())
      return false
    if (data.profileType !== 'official' && !data.apiKey?.trim())
      return false
    return true
  }

  useEffect(() => {
    if (config) {
      setFormData({ ...config })
      // Call onFormDataChange with initial data
      if (onFormDataChange) {
        const isValid = validateFormData(config)
        onFormDataChange(config, isValid)
      }
    }
    else if (onFormDataChange) {
      // Call with default form data
      const defaultData = {
        name: '',
        profileType: 'default' as const,
        baseUrl: '',
        apiKey: '',
        model: '',
        permissionMode: 'default' as const,
        transformerEnabled: false,
        transformer: 'auto',
        isDefault: false,
        enabled: true,
        authToken: '',
      }
      const isValid = validateFormData(defaultData)
      onFormDataChange(defaultData, isValid)
    }
  }, [config, onFormDataChange])

  const handleChange = (field: keyof ClaudeConfig, value: string | boolean): void => {
    const newFormData = { ...formData, [field]: value }
    setFormData(newFormData)
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }

    // Call onFormDataChange if provided
    if (onFormDataChange) {
      const isValid = validateFormData(newFormData)
      onFormDataChange(newFormData, isValid)
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = 'Configuration name is required'
    }

    if (formData.profileType !== 'official' && !formData.baseUrl?.trim()) {
      newErrors.baseUrl = 'Base URL is required for custom configurations'
    }

    if (formData.profileType !== 'official' && !formData.apiKey?.trim()) {
      newErrors.apiKey = 'API Key is required for custom configurations'
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full" id="config-form">
      <div className="flex-1 space-y-6 pr-2">
        {/* Basic Information */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </div>
            <CardDescription>Configure the basic details for your Claude instance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="font-medium">Configuration Name *</Label>
              <Input
                id="name"
                value={formData.name ?? ''}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="e.g., My Claude Config"
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
              <Label htmlFor="profileType" className="font-medium">Profile Type</Label>
              <Select
                value={formData.profileType ?? 'default'}
                onValueChange={(value) => {
                  if (value && (value === 'default' || value === 'official')) {
                    handleChange('profileType', value)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select profile type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Default (Custom)
                    </div>
                  </SelectItem>
                  <SelectItem value="official">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Official Claude
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* API Configuration */}
        {formData.profileType !== 'official' && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <CardTitle className="text-lg">API Configuration</CardTitle>
              </div>
              <CardDescription>Configure the API endpoint and authentication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="baseUrl" className="font-medium flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  Base URL *
                </Label>
                <Input
                  id="baseUrl"
                  value={formData.baseUrl ?? ''}
                  onChange={e => handleChange('baseUrl', e.target.value)}
                  placeholder="https://api.anthropic.com"
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
                <Label htmlFor="apiKey" className="font-medium flex items-center gap-2">
                  <Key className="h-3 w-3" />
                  API Key *
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey ?? ''}
                  onChange={e => handleChange('apiKey', e.target.value)}
                  placeholder="sk-ant-..."
                  className={errors.apiKey ? 'border-destructive focus-visible:ring-destructive font-mono' : 'font-mono'}
                />
                {errors.apiKey && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.apiKey}
                  </div>
                )}
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100">Security Note</p>
                      <p className="text-blue-700 dark:text-blue-300 mt-1">
                        API keys are stored securely and encrypted locally.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Model & Permissions */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <CardTitle className="text-lg">Model & Permissions</CardTitle>
            </div>
            <CardDescription>Configure the model and permission settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model" className="font-medium flex items-center gap-2">
                <Brain className="h-3 w-3" />
                Model
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <Input
                id="model"
                value={formData.model ?? ''}
                onChange={e => handleChange('model', e.target.value)}
                placeholder="claude-sonnet-4-5-20250929"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the default model for this configuration
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="permissionMode" className="font-medium">Permission Mode</Label>
              <Select
                value={formData.permissionMode ?? 'default'}
                onValueChange={(value) => {
                  if (value && (value === 'default' || value === 'acceptEdits' || value === 'plan' || value === 'bypassPermissions')) {
                    handleChange('permissionMode', value)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select permission mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="acceptEdits">Accept Edits</SelectItem>
                  <SelectItem value="plan">Plan Mode</SelectItem>
                  <SelectItem value="bypassPermissions">Bypass Permissions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                <div className="flex-1">
                  <Label htmlFor="isDefault" className="font-medium">Default Configuration</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use this as the default configuration when starting Claude
                  </p>
                </div>
                <Switch
                  id="isDefault"
                  checked={formData.isDefault ?? false}
                  onCheckedChange={checked => handleChange('isDefault', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                <div className="flex-1">
                  <Label htmlFor="transformerEnabled" className="font-medium">Transformer</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Transform API requests to match different provider formats
                  </p>
                </div>
                <Switch
                  id="transformerEnabled"
                  checked={formData.transformerEnabled ?? false}
                  onCheckedChange={checked => handleChange('transformerEnabled', checked)}
                />
              </div>

              {formData.transformerEnabled && (
                <div className="p-3 rounded-lg border bg-muted/50">
                  <div className="flex flex-col space-y-3">
                    <Label htmlFor="transformer" className="font-medium">Transformer Type</Label>
                    <p className="text-sm text-muted-foreground">
                      Select which transformer to use. &quot;Auto&quot; automatically detects based on the API endpoint domain.
                    </p>
                    <Select
                      value={formData.transformer || 'auto'}
                      onValueChange={value => handleChange('transformer', value)}
                      disabled={loadingTransformers}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingTransformers ? 'Loading transformers...' : 'Select transformer'} />
                      </SelectTrigger>
                      <SelectContent>
                        {transformers.map(transformer => (
                          <SelectItem key={transformer.value} value={transformer.value}>
                            {transformer.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                <div className="flex-1">
                  <Label htmlFor="enabled" className="font-medium">Enabled</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configuration is active and can be used
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={formData.enabled ?? true}
                  onCheckedChange={checked => handleChange('enabled', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-green-600 dark:text-green-400" />
              <CardTitle className="text-lg">Advanced Settings</CardTitle>
            </div>
            <CardDescription>Configure advanced environment variables and settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="authToken" className="font-medium flex items-center gap-2">
                <Key className="h-3 w-3" />
                Auth Token
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <Input
                id="authToken"
                type="password"
                value={formData.authToken ?? ''}
                onChange={e => handleChange('authToken', e.target.value)}
                placeholder="Bearer token for authentication"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Additional authentication token for Claude Code operations
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
