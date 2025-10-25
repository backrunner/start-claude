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
import { Textarea } from '@/components/ui/textarea'

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
    authorization: '',
    customHeaders: '',
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

    // Validate baseUrl format
    if (data.baseUrl?.trim()) {
      try {
        void new URL(data.baseUrl)
      }
      catch {
        return false
      }
    }

    // Validate customHeaders format
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
    else if (formData.baseUrl?.trim()) {
      try {
        void new URL(formData.baseUrl)
      }
      catch {
        newErrors.baseUrl = 'Invalid URL format (must start with http:// or https://)'
      }
    }

    if (formData.profileType !== 'official' && !formData.apiKey?.trim()) {
      newErrors.apiKey = 'API Key is required for custom configurations'
    }

    // Validate customHeaders format
    if (formData.customHeaders?.trim()) {
      const lines = formData.customHeaders.split('\n').filter(line => line.trim())
      for (const line of lines) {
        if (!line.includes(':')) {
          newErrors.customHeaders = 'Invalid format. Each line must be in format "Header: Value"'
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
                <CardTitle className="text-xl font-bold">Basic Information</CardTitle>
                <CardDescription className="text-sm mt-0.5">Configure the basic details for your Claude instance</CardDescription>
              </div>
            </div>
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
          <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-green-500/10 border-2 hover:border-green-500/30 group">
            <CardHeader className="pb-5 bg-gradient-to-br from-green-50/50 via-transparent to-transparent dark:from-green-950/20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/30 group-hover:shadow-green-500/50 transition-all duration-300">
                  <Key className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">API Configuration</CardTitle>
                  <CardDescription className="text-sm mt-0.5">Configure the API endpoint and authentication</CardDescription>
                </div>
              </div>
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
        <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 border-2 hover:border-purple-500/30 group">
          <CardHeader className="pb-5 bg-gradient-to-br from-purple-50/50 via-transparent to-transparent dark:from-purple-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30 group-hover:shadow-purple-500/50 transition-all duration-300">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Model & Permissions</CardTitle>
                <CardDescription className="text-sm mt-0.5">Configure the model and permission settings</CardDescription>
              </div>
            </div>
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
              <div className="flex items-center justify-between p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-primary/30 transition-all duration-200">
                <div className="flex-1">
                  <Label htmlFor="isDefault" className="font-semibold text-base cursor-pointer">Default Configuration</Label>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    Use this as the default configuration when starting Claude
                  </p>
                </div>
                <Switch
                  id="isDefault"
                  checked={formData.isDefault ?? false}
                  onCheckedChange={checked => handleChange('isDefault', checked)}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-purple-600"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-primary/30 transition-all duration-200">
                <div className="flex-1">
                  <Label htmlFor="transformerEnabled" className="font-semibold text-base cursor-pointer">Transformer</Label>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    Transform API requests to match different provider formats
                  </p>
                </div>
                <Switch
                  id="transformerEnabled"
                  checked={formData.transformerEnabled ?? false}
                  onCheckedChange={checked => handleChange('transformerEnabled', checked)}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-purple-600"
                />
              </div>

              {formData.transformerEnabled && (
                <div className="p-5 rounded-xl border-2 bg-gradient-to-br from-orange-50/50 via-transparent to-transparent dark:from-orange-950/20 border-orange-200/50 dark:border-orange-800/50">
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

              <div className="flex items-center justify-between p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-primary/30 transition-all duration-200">
                <div className="flex-1">
                  <Label htmlFor="enabled" className="font-semibold text-base cursor-pointer">Enabled</Label>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    Configuration is active and can be used
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={formData.enabled ?? true}
                  onCheckedChange={checked => handleChange('enabled', checked)}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-purple-600"
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
                <CardTitle className="text-xl font-bold">Advanced Settings</CardTitle>
                <CardDescription className="text-sm mt-0.5">Configure advanced environment variables and settings</CardDescription>
              </div>
            </div>
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

            <div className="space-y-2">
              <Label htmlFor="authorization" className="font-medium flex items-center gap-2">
                <Key className="h-3 w-3" />
                Authorization Header
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <Input
                id="authorization"
                type="password"
                value={formData.authorization ?? ''}
                onChange={e => handleChange('authorization', e.target.value)}
                placeholder="Bearer your-token-here"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Convenience field for Authorization header (e.g., &quot;Bearer token&quot;)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customHeaders" className="font-medium flex items-center gap-2">
                <Key className="h-3 w-3" />
                Custom Headers
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </Label>
              <Textarea
                id="customHeaders"
                value={formData.customHeaders ?? ''}
                onChange={e => handleChange('customHeaders', e.target.value)}
                placeholder="X-Custom-Header: value1&#10;Another-Header: value2"
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
                Additional HTTP headers in format: Header1: Value1\nHeader2: Value2
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
