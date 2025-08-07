'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ClaudeConfig } from '@/types/config'

interface ConfigFormProps {
  config?: ClaudeConfig | null
  onSave: (config: ClaudeConfig) => void
  onCancel: () => void
}

export function ConfigForm({ config, onSave, onCancel }: ConfigFormProps) {
  const [formData, setFormData] = useState<ClaudeConfig>({
    name: '',
    profileType: 'default',
    baseUrl: '',
    apiKey: '',
    model: '',
    permissionMode: 'default',
    isDefault: false,
    order: 0,
    enabled: true,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (config) {
      setFormData({ ...config })
    }
  }, [config])

  const handleChange = (field: keyof ClaudeConfig, value: any) => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate()) {
      return
    }

    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Configuration Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., My Claude Config"
          className={errors.name ? 'border-destructive' : ''}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="profileType">Profile Type</Label>
        <select
          id="profileType"
          value={formData.profileType}
          onChange={(e) => handleChange('profileType', e.target.value as 'default' | 'official')}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="default">Default (Custom)</option>
          <option value="official">Official Claude</option>
        </select>
      </div>

      {formData.profileType !== 'official' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL *</Label>
            <Input
              id="baseUrl"
              value={formData.baseUrl}
              onChange={(e) => handleChange('baseUrl', e.target.value)}
              placeholder="https://api.anthropic.com"
              className={errors.baseUrl ? 'border-destructive' : ''}
            />
            {errors.baseUrl && <p className="text-sm text-destructive">{errors.baseUrl}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key *</Label>
            <Input
              id="apiKey"
              type="password"
              value={formData.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="sk-ant-..."
              className={errors.apiKey ? 'border-destructive' : ''}
            />
            {errors.apiKey && <p className="text-sm text-destructive">{errors.apiKey}</p>}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        <Input
          id="model"
          value={formData.model}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder="claude-3-sonnet-20240229"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="permissionMode">Permission Mode</Label>
        <select
          id="permissionMode"
          value={formData.permissionMode}
          onChange={(e) => handleChange('permissionMode', e.target.value as ClaudeConfig['permissionMode'])}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="default">Default</option>
          <option value="acceptEdits">Accept Edits</option>
          <option value="plan">Plan Mode</option>
          <option value="bypassPermissions">Bypass Permissions</option>
        </select>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="isDefault"
          checked={formData.isDefault}
          onCheckedChange={(checked) => handleChange('isDefault', checked)}
        />
        <Label htmlFor="isDefault">Set as default configuration</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="enabled"
          checked={formData.enabled}
          onCheckedChange={(checked) => handleChange('enabled', checked)}
        />
        <Label htmlFor="enabled">Enabled</Label>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {config ? 'Update' : 'Create'} Configuration
        </Button>
      </div>
    </form>
  )
}