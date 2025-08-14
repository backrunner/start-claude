'use client'

import type { ReactNode } from 'react'
import type { LoadBalancerStrategy, SystemSettings } from '@/config/types'
import { Activity, AlertCircle, Cloud, Database, Globe, Key, Lock, Settings2, Timer, Zap } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface SystemSettingsModalProps {
  open: boolean
  onClose: () => void
  initialSettings?: SystemSettings
  onSave: (settings: SystemSettings) => Promise<void>
}

export function SystemSettingsModal({ open, onClose, initialSettings, onSave }: SystemSettingsModalProps): ReactNode {
  const [settings, setSettings] = useState<SystemSettings>({
    overrideClaudeCommand: initialSettings?.overrideClaudeCommand || false,
    balanceMode: {
      enableByDefault: initialSettings?.balanceMode?.enableByDefault || false,
      strategy: initialSettings?.balanceMode?.strategy || 'Fallback',
      healthCheck: {
        enabled: initialSettings?.balanceMode?.healthCheck?.enabled !== false,
        intervalMs: initialSettings?.balanceMode?.healthCheck?.intervalMs || 30000,
      },
      failedEndpoint: {
        banDurationSeconds: initialSettings?.balanceMode?.failedEndpoint?.banDurationSeconds || 300,
      },
      speedFirst: initialSettings?.balanceMode?.speedFirst || {
        responseTimeWindowMs: 300000,
        minSamples: 2,
      },
    },
    s3Sync: initialSettings?.s3Sync
      ? {
          bucket: initialSettings.s3Sync.bucket || '',
          region: initialSettings.s3Sync.region || 'us-east-1',
          accessKeyId: initialSettings.s3Sync.accessKeyId || '',
          secretAccessKey: initialSettings.s3Sync.secretAccessKey || '',
          key: initialSettings.s3Sync.key || 'configs.json',
          endpointUrl: initialSettings.s3Sync.endpointUrl || '',
        }
      : undefined,
  })

  const [saving, setSaving] = useState(false)

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(settings)
      onClose()
    }
    catch (error) {
      console.error('Error saving system settings:', error)
    }
    finally {
      setSaving(false)
    }
  }

  const handleBalanceModeChange = (field: keyof NonNullable<SystemSettings['balanceMode']>, value: any): void => {
    setSettings(prev => ({
      ...prev,
      balanceMode: {
        ...prev.balanceMode!,
        [field]: value,
      },
    }))
  }

  const handleHealthCheckChange = (field: keyof NonNullable<SystemSettings['balanceMode']>['healthCheck'], value: any): void => {
    setSettings(prev => ({
      ...prev,
      balanceMode: {
        ...prev.balanceMode!,
        healthCheck: {
          ...prev.balanceMode!.healthCheck,
          [field]: value,
        },
      },
    }))
  }

  const handleFailedEndpointChange = (field: keyof NonNullable<SystemSettings['balanceMode']>['failedEndpoint'], value: any): void => {
    setSettings(prev => ({
      ...prev,
      balanceMode: {
        ...prev.balanceMode!,
        failedEndpoint: {
          ...prev.balanceMode!.failedEndpoint,
          [field]: value,
        },
      },
    }))
  }

  const handleSpeedFirstChange = (field: keyof NonNullable<NonNullable<SystemSettings['balanceMode']>['speedFirst']>, value: any): void => {
    setSettings(prev => ({
      ...prev,
      balanceMode: {
        ...prev.balanceMode!,
        speedFirst: {
          ...prev.balanceMode!.speedFirst!,
          [field]: value,
        },
      },
    }))
  }

  const handleS3Change = (field: keyof NonNullable<SystemSettings['s3Sync']>, value: string): void => {
    setSettings(prev => ({
      ...prev,
      s3Sync: {
        ...prev.s3Sync!,
        [field]: value,
      },
    }))
  }

  const enableS3 = (): void => {
    if (!settings.s3Sync) {
      setSettings(prev => ({
        ...prev,
        s3Sync: {
          bucket: '',
          region: 'us-east-1',
          accessKeyId: '',
          secretAccessKey: '',
          key: 'configs.json',
          endpointUrl: '',
        },
      }))
    }
  }

  const disableS3 = (): void => {
    setSettings(prev => ({
      ...prev,
      s3Sync: undefined,
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-6 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-semibold">System Settings</DialogTitle>
              <DialogDescription className="text-base mt-1">
                Configure advanced features and integrations for Start Claude
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-6 px-1">
          <div className="grid grid-cols-1 gap-6 pr-3">

            {/* Balance Mode Settings - Full Width */}
            <Card className="transition-all hover:shadow-md">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                    <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Load Balancer</CardTitle>
                    <CardDescription>Distribute requests across multiple endpoints</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                  <div className="flex-1">
                    <Label htmlFor="enableByDefault" className="font-medium">Enable by Default</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Start in balance mode automatically
                    </p>
                  </div>
                  <Switch
                    id="enableByDefault"
                    checked={settings.balanceMode?.enableByDefault || false}
                    onCheckedChange={checked => handleBalanceModeChange('enableByDefault', checked)}
                  />
                </div>

                {/* Load Balancer Strategy */}
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                  <div className="flex-1">
                    <Label htmlFor="loadBalancerStrategy" className="font-medium">Load Balancer Strategy</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Choose how requests are distributed across endpoints
                    </p>
                  </div>
                  <Select
                    value={settings.balanceMode?.strategy || 'Fallback'}
                    onValueChange={(value: LoadBalancerStrategy) => handleBalanceModeChange('strategy', value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fallback">Fallback</SelectItem>
                      <SelectItem value="Polling">Polling</SelectItem>
                      <SelectItem value="Speed First">Speed First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Speed First Configuration */}
                {settings.balanceMode?.strategy === 'Speed First' && (
                  <div className="space-y-3 p-3 rounded-lg border bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Timer className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <Label className="font-medium">Speed First Settings</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="speedFirstWindow" className="text-sm font-medium">Time Window</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            id="speedFirstWindow"
                            type="number"
                            min="1"
                            max="60"
                            className="w-20"
                            value={Math.floor((settings.balanceMode?.speedFirst?.responseTimeWindowMs || 300000) / 60000)}
                            onChange={e => handleSpeedFirstChange('responseTimeWindowMs', Number(e.target.value) * 60000)}
                          />
                          <span className="text-sm text-muted-foreground">minutes</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Time window for calculating average response times
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="speedFirstSamples" className="text-sm font-medium">Min Samples</Label>
                        <Input
                          id="speedFirstSamples"
                          type="number"
                          min="1"
                          max="20"
                          className="w-20 mt-1"
                          value={settings.balanceMode?.speedFirst?.minSamples || 3}
                          onChange={e => handleSpeedFirstChange('minSamples', Number(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Minimum samples before using speed-based routing
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3 p-3 rounded-lg border bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <Label htmlFor="healthCheckEnabled" className="font-medium">Health Checks</Label>
                      <Badge variant="secondary" className="text-xs">
                        {settings.balanceMode?.healthCheck?.enabled !== false ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <Switch
                      id="healthCheckEnabled"
                      checked={settings.balanceMode?.healthCheck?.enabled !== false}
                      onCheckedChange={checked => handleHealthCheckChange('enabled', checked)}
                    />
                  </div>

                  {settings.balanceMode?.healthCheck?.enabled !== false && (
                    <div className="space-y-3 pl-6 border-l-2 border-green-200 dark:border-green-800">
                      <div>
                        <Label htmlFor="healthCheckInterval" className="text-sm font-medium flex items-center gap-2">
                          <Timer className="h-3 w-3" />
                          Check Interval
                        </Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            id="healthCheckInterval"
                            type="number"
                            min="10"
                            max="300"
                            className="w-20"
                            value={Math.floor((settings.balanceMode?.healthCheck?.intervalMs || 30000) / 1000)}
                            onChange={e => handleHealthCheckChange('intervalMs', Number(e.target.value) * 1000)}
                          />
                          <span className="text-sm text-muted-foreground">seconds</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Range: 10-300 seconds</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="banDuration" className="text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="h-3 w-3" />
                      Ban Duration
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        id="banDuration"
                        type="number"
                        min="60"
                        max="3600"
                        className="w-20"
                        value={settings.balanceMode?.failedEndpoint?.banDurationSeconds || 300}
                        onChange={e => handleFailedEndpointChange('banDurationSeconds', Number(e.target.value))}
                      />
                      <span className="text-sm text-muted-foreground">seconds</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      How long to ban failed endpoints (60-3600 seconds)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* S3 Sync Settings - Full Width */}
            <Card className="transition-all hover:shadow-md">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/20">
                      <Cloud className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">S3 Cloud Sync</CardTitle>
                      <CardDescription>Sync configurations across devices using AWS S3 or compatible storage</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.s3Sync && <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">Active</Badge>}
                    <Switch
                      id="enableS3"
                      checked={!!settings.s3Sync}
                      onCheckedChange={checked => checked ? enableS3() : disableS3()}
                    />
                  </div>
                </div>
              </CardHeader>

              {settings.s3Sync && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Storage Configuration */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                        <Database className="h-4 w-4" />
                        Storage Configuration
                      </div>

                      <div>
                        <Label htmlFor="bucket" className="font-medium">Bucket Name</Label>
                        <Input
                          id="bucket"
                          type="text"
                          className="mt-1"
                          value={settings.s3Sync.bucket}
                          onChange={e => handleS3Change('bucket', e.target.value)}
                          placeholder="my-claude-configs"
                        />
                      </div>

                      <div>
                        <Label htmlFor="region" className="font-medium">Region</Label>
                        <Input
                          id="region"
                          type="text"
                          className="mt-1"
                          value={settings.s3Sync.region}
                          onChange={e => handleS3Change('region', e.target.value)}
                          placeholder="us-east-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="key" className="font-medium">File Path</Label>
                        <Input
                          id="key"
                          type="text"
                          className="mt-1"
                          value={settings.s3Sync.key}
                          onChange={e => handleS3Change('key', e.target.value)}
                          placeholder="configs.json"
                        />
                      </div>

                      <div>
                        <Label htmlFor="endpointUrl" className="font-medium flex items-center gap-2">
                          <Globe className="h-3 w-3" />
                          Custom Endpoint
                          <Badge variant="outline" className="text-xs">Optional</Badge>
                        </Label>
                        <Input
                          id="endpointUrl"
                          type="url"
                          className="mt-1"
                          value={settings.s3Sync.endpointUrl}
                          onChange={e => handleS3Change('endpointUrl', e.target.value)}
                          placeholder="https://example.r2.cloudflarestorage.com"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Leave empty for AWS S3. Use for Cloudflare R2, MinIO, etc.
                        </p>
                      </div>
                    </div>

                    {/* Authentication */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                        <Key className="h-4 w-4" />
                        Authentication
                      </div>

                      <div>
                        <Label htmlFor="accessKeyId" className="font-medium">Access Key ID</Label>
                        <Input
                          id="accessKeyId"
                          type="text"
                          className="mt-1 font-mono"
                          value={settings.s3Sync.accessKeyId}
                          onChange={e => handleS3Change('accessKeyId', e.target.value)}
                          placeholder="AKIA..."
                        />
                      </div>

                      <div>
                        <Label htmlFor="secretAccessKey" className="font-medium flex items-center gap-2">
                          <Lock className="h-3 w-3" />
                          Secret Access Key
                        </Label>
                        <Input
                          id="secretAccessKey"
                          type="password"
                          className="mt-1 font-mono"
                          value={settings.s3Sync.secretAccessKey}
                          onChange={e => handleS3Change('secretAccessKey', e.target.value)}
                          placeholder="••••••••••••••••••••••••••••••••••••••••"
                        />
                      </div>

                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-blue-900 dark:text-blue-100">Security Note</p>
                            <p className="text-blue-700 dark:text-blue-300 mt-1">
                              Credentials are stored locally and never transmitted except to your S3 endpoint.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>

        <DialogFooter className="pt-6 border-t bg-muted/10 flex-shrink-0">
          <div className="flex items-center justify-end w-full">
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} disabled={saving} className="min-w-[100px]">
                Cancel
              </Button>
              <Button onClick={(): void => { void handleSave() }} disabled={saving} className="min-w-[120px] bg-primary hover:bg-primary/90">
                {saving
                  ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Saving...
                      </div>
                    )
                  : (
                      'Save Settings'
                    )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
