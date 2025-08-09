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

export function ConfigForm({ config, onSave }: ConfigFormProps): ReactNode {
  const [formData, setFormData] = useState<ClaudeConfig>({
    name: '',
    profileType: 'default',
    baseUrl: '',
    apiKey: '',
    model: '',
    permissionMode: 'default',
    isDefault: false,
    enabled: true,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (config) {
      setFormData({ ...config })
    }
  }, [config])

  const handleChange = (field: keyof ClaudeConfig, value: any): void => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
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
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            {config ? 'Edit Configuration' : 'Create Configuration'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {config ? 'Update your Claude configuration settings' : 'Set up a new Claude configuration'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1" id="config-form">
        <div className="flex-1 space-y-6 pr-2">
          {/* Add right padding for scrollbar */}
          {/* Basic Information */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                <CardTitle className="text-lg">Basic Information</CardTitle>
              </div>
              <CardDescription>Configure the basic details for your Claude instance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-medium">Configuration Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
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
                  value={formData.profileType}
                  onValueChange={value => handleChange('profileType', value as 'default' | 'official')}
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
                    value={formData.baseUrl}
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
                    value={formData.apiKey}
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
                  value={formData.model}
                  onChange={e => handleChange('model', e.target.value)}
                  placeholder="claude-3-sonnet-20240229"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the default model for this configuration
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="permissionMode" className="font-medium">Permission Mode</Label>
                <Select
                  value={formData.permissionMode}
                  onValueChange={value => handleChange('permissionMode', value as ClaudeConfig['permissionMode'])}
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
                    checked={formData.isDefault}
                    onCheckedChange={checked => handleChange('isDefault', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                  <div className="flex-1">
                    <Label htmlFor="enabled" className="font-medium">Enabled</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configuration is active and can be used
                    </p>
                  </div>
                  <Switch
                    id="enabled"
                    checked={formData.enabled}
                    onCheckedChange={checked => handleChange('enabled', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  )
}
