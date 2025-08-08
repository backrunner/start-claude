'use client'

import type { ReactNode } from 'react'
import type { SystemSettings } from '@/types/config'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      healthCheck: {
        enabled: initialSettings?.balanceMode?.healthCheck?.enabled !== false, // Default to true
        intervalMs: initialSettings?.balanceMode?.healthCheck?.intervalMs || 30000, // 30 seconds
      },
      failedEndpoint: {
        banDurationSeconds: initialSettings?.balanceMode?.failedEndpoint?.banDurationSeconds || 300, // 5 minutes
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>System Settings</DialogTitle>
          <DialogDescription>
            Configure system-wide settings for Start Claude, including balance mode and S3 sync.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Balance Mode Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Balance Mode Settings</CardTitle>
              <CardDescription>
                Configure load balancing behavior and health checking for multiple endpoints.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="enableByDefault"
                  checked={settings.balanceMode?.enableByDefault || false}
                  onCheckedChange={checked => handleBalanceModeChange('enableByDefault', checked)}
                />
                <Label htmlFor="enableByDefault">Enable balance mode by default</Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="healthCheckEnabled"
                    checked={settings.balanceMode?.healthCheck?.enabled !== false}
                    onCheckedChange={checked => handleHealthCheckChange('enabled', checked)}
                  />
                  <Label htmlFor="healthCheckEnabled">Enable health checks</Label>
                </div>

                {settings.balanceMode?.healthCheck?.enabled !== false && (
                  <div>
                    <Label htmlFor="healthCheckInterval">Health check interval (seconds)</Label>
                    <Input
                      id="healthCheckInterval"
                      type="number"
                      min="10"
                      max="300"
                      value={Math.floor((settings.balanceMode?.healthCheck?.intervalMs || 30000) / 1000)}
                      onChange={e => handleHealthCheckChange('intervalMs', Number(e.target.value) * 1000)}
                      placeholder="30"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      How often to check failed endpoints (10-300 seconds)
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="banDuration">Failed endpoint ban duration (seconds)</Label>
                  <Input
                    id="banDuration"
                    type="number"
                    min="60"
                    max="3600"
                    value={settings.balanceMode?.failedEndpoint?.banDurationSeconds || 300}
                    onChange={e => handleFailedEndpointChange('banDurationSeconds', Number(e.target.value))}
                    placeholder="300"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    How long to ban failed endpoints when health checks are disabled (60-3600 seconds)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* S3 Sync Settings */}
          <Card>
            <CardHeader>
              <CardTitle>S3 Sync Settings</CardTitle>
              <CardDescription>
                Configure S3 storage for syncing configurations across devices.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="enableS3"
                  checked={!!settings.s3Sync}
                  onCheckedChange={checked => checked ? enableS3() : disableS3()}
                />
                <Label htmlFor="enableS3">Enable S3 sync</Label>
              </div>

              {settings.s3Sync && (
                <div className="space-y-4 pl-6 border-l-2 border-muted">
                  <div>
                    <Label htmlFor="bucket">Bucket Name</Label>
                    <Input
                      id="bucket"
                      type="text"
                      value={settings.s3Sync.bucket}
                      onChange={e => handleS3Change('bucket', e.target.value)}
                      placeholder="my-claude-configs"
                    />
                  </div>

                  <div>
                    <Label htmlFor="region">Region</Label>
                    <Input
                      id="region"
                      type="text"
                      value={settings.s3Sync.region}
                      onChange={e => handleS3Change('region', e.target.value)}
                      placeholder="us-east-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="accessKeyId">Access Key ID</Label>
                    <Input
                      id="accessKeyId"
                      type="text"
                      value={settings.s3Sync.accessKeyId}
                      onChange={e => handleS3Change('accessKeyId', e.target.value)}
                      placeholder="AKIA..."
                    />
                  </div>

                  <div>
                    <Label htmlFor="secretAccessKey">Secret Access Key</Label>
                    <Input
                      id="secretAccessKey"
                      type="password"
                      value={settings.s3Sync.secretAccessKey}
                      onChange={e => handleS3Change('secretAccessKey', e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <Label htmlFor="key">S3 Key (File Name)</Label>
                    <Input
                      id="key"
                      type="text"
                      value={settings.s3Sync.key}
                      onChange={e => handleS3Change('key', e.target.value)}
                      placeholder="configs.json"
                    />
                  </div>

                  <div>
                    <Label htmlFor="endpointUrl">Endpoint URL (Optional)</Label>
                    <Input
                      id="endpointUrl"
                      type="url"
                      value={settings.s3Sync.endpointUrl}
                      onChange={e => handleS3Change('endpointUrl', e.target.value)}
                      placeholder="https://s3.amazonaws.com (leave empty for AWS)"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={(): void => { void handleSave() }} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
