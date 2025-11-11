'use client'

import type { ReactNode } from 'react'
import type { SystemSettings } from '@/config/types'
import { useTranslations } from 'next-intl'
import { Activity, AlertCircle, Cloud, CloudOff, Database, FolderSync, Globe, HardDrive, Key, Lock, RefreshCw, Settings2, Timer, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { LoadBalancerStrategy, SpeedTestStrategy } from '@/config/types'

interface CloudProvider {
  name: string
  path?: string
  isEnabled: boolean
  hasConfigs?: boolean
  configModifiedDate?: string
}

interface SyncConfig {
  enabled: boolean
  provider: 'icloud' | 'onedrive' | 'custom' | 's3'
  cloudPath?: string
  customPath?: string
  s3Config?: {
    bucket: string
    region: string
    key: string
    endpointUrl?: string
  }
  linkedAt: string
  lastVerified?: string
}

interface SyncStatus {
  isConfigured: boolean
  isValid: boolean
  provider?: string
  cloudPath?: string
  configPath: string
  issues: string[]
}

interface SystemSettingsModalProps {
  open: boolean
  onClose: () => void
  initialSettings?: SystemSettings
  onSave: (settings: SystemSettings) => Promise<void>
  onConfigsChange?: () => Promise<void>
}

export function SystemSettingsModal({ open, onClose, initialSettings, onSave, onConfigsChange }: SystemSettingsModalProps): ReactNode {
  const t = useTranslations('settings')
  const [settings, setSettings] = useState<SystemSettings>({
    overrideClaudeCommand: initialSettings?.overrideClaudeCommand || false,
    balanceMode: {
      enableByDefault: initialSettings?.balanceMode?.enableByDefault || false,
      strategy: initialSettings?.balanceMode?.strategy || LoadBalancerStrategy.Fallback,
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
        speedTestIntervalSeconds: 300,
        speedTestStrategy: SpeedTestStrategy.ResponseTime,
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
          remoteConfigCheckIntervalMinutes: initialSettings.s3Sync.remoteConfigCheckIntervalMinutes || 60,
        }
      : undefined,
  })

  const [saving, setSaving] = useState(false)
  const [cloudProviders, setCloudProviders] = useState<CloudProvider[]>([])
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loadingSync, setLoadingSync] = useState(false)
  const [customSyncPath, setCustomSyncPath] = useState('')
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [pendingSync, setPendingSync] = useState<{ provider: string, path?: string } | null>(null)
  const [conflicts, setConflicts] = useState<any[]>([])
  const [resolvingConflict, setResolvingConflict] = useState(false)
  const [conflictDates, setConflictDates] = useState<{ local?: string, cloud?: string } | null>(null)

  // Load cloud providers and sync status on mount
  useEffect(() => {
    const loadSyncData = async (): Promise<void> => {
      try {
        // Load available cloud providers
        const providersRes = await fetch('/api/sync/providers')
        if (providersRes.ok) {
          const data = await providersRes.json()
          setCloudProviders(data.available || [])
        }

        // Load sync status
        const syncRes = await fetch('/api/sync')
        if (syncRes.ok) {
          const data = await syncRes.json()
          setSyncStatus(data.status)
          setSyncConfig(data.config)
        }
      }
      catch (error) {
        console.error('Error loading sync data:', error)
      }
    }

    if (open) {
      void loadSyncData()
    }
  }, [open])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(settings)
      // Only close modal if the API call succeeds
      onClose()
    }
    catch (error) {
      console.error('Error saving system settings:', error)
      // Don't close modal on error - let user see the error and retry
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

  const handleS3Change = (field: keyof NonNullable<SystemSettings['s3Sync']>, value: string | number): void => {
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
          key: 'start-claude.json',
          endpointUrl: '',
          remoteConfigCheckIntervalMinutes: 60,
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

  const handleEnableCloudSync = async (provider: 'icloud' | 'onedrive' | 'custom'): Promise<void> => {
    if (provider === 'custom') {
      // Custom path will be set by user in the UI
      return
    }

    setLoadingSync(true)
    try {
      const cloudProvider = cloudProviders.find(p =>
        p.name.toLowerCase() === provider,
      )

      if (!cloudProvider || !cloudProvider.path) {
        console.error(`Provider ${provider} not available or has no path`)
        return
      }

      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          cloudPath: cloudProvider.path,
        }),
      })

      if (response.status === 409) {
        // Conflict detected
        const data = await response.json()
        setConflicts(data.conflicts || [])
        setConflictDates({
          local: data.localModifiedDate,
          cloud: data.cloudModifiedDate,
        })
        setPendingSync({ provider, path: cloudProvider.path })
        setConflictDialogOpen(true)
      }
      else if (response.ok) {
        const data = await response.json()
        setSyncConfig(data.config)
        setSyncStatus(data.status)
        // Refresh configs since they may have changed
        if (onConfigsChange) {
          await onConfigsChange()
        }
      }
    }
    catch (error) {
      console.error('Error enabling cloud sync:', error)
    }
    finally {
      setLoadingSync(false)
    }
  }

  const handleEnableCustomSync = async (): Promise<void> => {
    if (!customSyncPath.trim()) {
      return
    }

    setLoadingSync(true)
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'custom',
          customPath: customSyncPath.trim(),
        }),
      })

      if (response.status === 409) {
        // Conflict detected
        const data = await response.json()
        setConflicts(data.conflicts || [])
        setConflictDates({
          local: data.localModifiedDate,
          cloud: data.cloudModifiedDate,
        })
        setPendingSync({ provider: 'custom', path: customSyncPath.trim() })
        setConflictDialogOpen(true)
      }
      else if (response.ok) {
        const data = await response.json()
        setSyncConfig(data.config)
        setSyncStatus(data.status)
        setCustomSyncPath('')
        // Refresh configs since they may have changed
        if (onConfigsChange) {
          await onConfigsChange()
        }
      }
    }
    catch (error) {
      console.error('Error enabling custom sync:', error)
    }
    finally {
      setLoadingSync(false)
    }
  }

  const handleDisableSync = async (): Promise<void> => {
    setLoadingSync(true)
    try {
      const response = await fetch('/api/sync', {
        method: 'DELETE',
      })

      if (response.ok) {
        setSyncConfig(null)
        setSyncStatus(null)
      }
    }
    catch (error) {
      console.error('Error disabling sync:', error)
    }
    finally {
      setLoadingSync(false)
    }
  }

  const handleResolveConflict = async (strategy: 'local' | 'remote' | 'merge'): Promise<void> => {
    if (!pendingSync)
      return

    setResolvingConflict(true)
    try {
      // Enable sync with the resolution strategy in a single call
      const enableResponse = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: pendingSync.provider,
          cloudPath: pendingSync.provider !== 'custom' ? pendingSync.path : undefined,
          customPath: pendingSync.provider === 'custom' ? pendingSync.path : undefined,
          conflictStrategy: strategy,
        }),
      })

      if (enableResponse.ok) {
        const data = await enableResponse.json()
        setSyncConfig(data.config)
        setSyncStatus(data.status)
        setConflictDialogOpen(false)
        setPendingSync(null)
        setConflicts([])
        setConflictDates(null)
        if (pendingSync.provider === 'custom') {
          setCustomSyncPath('')
        }
        // Refresh configs since they may have changed during conflict resolution
        if (onConfigsChange) {
          await onConfigsChange()
        }
      }
      else {
        console.error('Failed to enable sync with conflict resolution')
      }
    }
    catch (error) {
      console.error('Error resolving conflict:', error)
    }
    finally {
      setResolvingConflict(false)
    }
  }

  const getProviderIcon = (provider: string): typeof Cloud => {
    if (provider === 'icloud')
      return Cloud
    if (provider === 'onedrive')
      return HardDrive
    if (provider === 'custom')
      return FolderSync
    return Cloud
  }

  const getProviderDisplayName = (provider: string): string => {
    if (provider === 'icloud')
      return 'iCloud Drive'
    if (provider === 'onedrive')
      return 'OneDrive'
    if (provider === 'custom')
      return 'Custom Folder'
    return provider
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-6 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent -mt-6 -mx-6 px-6 pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
              <Settings2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {t('title')}
              </DialogTitle>
              <DialogDescription className="text-base mt-1.5 text-muted-foreground">
                {t('description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-6 px-1">
          <div className="grid grid-cols-1 gap-6 pr-3">

            {/* Proxy Server Settings - Full Width */}
            <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10 border-2 hover:border-blue-500/30 group">
              <CardHeader className="pb-5 bg-gradient-to-br from-blue-50/50 via-transparent to-transparent dark:from-blue-950/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-all duration-300">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">{t('proxyServer.title')}</CardTitle>
                    <CardDescription className="text-sm mt-0.5">{t('proxyServer.description')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-primary/30 transition-all duration-200">
                  <div className="flex-1">
                    <Label htmlFor="enableByDefault" className="font-semibold text-base cursor-pointer">{t('proxyServer.enableByDefault')}</Label>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                      {t('proxyServer.enableByDefaultDescription')}
                    </p>
                  </div>
                  <Switch
                    id="enableByDefault"
                    checked={settings.balanceMode?.enableByDefault || false}
                    onCheckedChange={checked => handleBalanceModeChange('enableByDefault', checked)}
                    className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-blue-500 data-[state=checked]:to-blue-600 data-[state=unchecked]:bg-blue-200 dark:data-[state=unchecked]:bg-blue-900/30 border-transparent"
                  />
                </div>

                {/* Load Balancing Strategy */}
                <div className="flex items-center justify-between p-4 rounded-xl border-2 bg-gradient-to-r from-muted/50 to-muted/30 hover:border-primary/30 transition-all duration-200">
                  <div className="flex-1">
                    <Label htmlFor="loadBalancerStrategy" className="font-semibold text-base">{t('proxyServer.loadBalancingStrategy')}</Label>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                      {t('proxyServer.loadBalancingDescription')}
                    </p>
                  </div>
                  <Select
                    value={settings.balanceMode?.strategy || LoadBalancerStrategy.Fallback}
                    onValueChange={(value: LoadBalancerStrategy) => handleBalanceModeChange('strategy', value)}
                  >
                    <SelectTrigger className="w-40 h-10 font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LoadBalancerStrategy.Fallback}>{t('proxyServer.strategyFallback')}</SelectItem>
                      <SelectItem value={LoadBalancerStrategy.Polling}>{t('proxyServer.strategyPolling')}</SelectItem>
                      <SelectItem value={LoadBalancerStrategy.SpeedFirst}>{t('proxyServer.strategySpeedFirst')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Speed First Configuration */}
                {settings.balanceMode?.strategy === LoadBalancerStrategy.SpeedFirst && (
                  <div className="space-y-4 p-5 rounded-xl border-2 bg-gradient-to-br from-orange-50/50 via-transparent to-transparent dark:from-orange-950/20 border-orange-200/50 dark:border-orange-800/50">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 shadow-md shadow-orange-500/30">
                        <Timer className="h-4 w-4 text-white" />
                      </div>
                      <Label className="font-bold text-lg">{t('speedFirst.title')}</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="speedFirstWindow" className="text-sm font-medium">{t('speedFirst.responseTimeWindow')}</Label>
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
                          <span className="text-sm text-muted-foreground">{t('speedFirst.responseTimeWindowUnit')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('speedFirst.responseTimeWindowHelpText')}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="speedFirstSamples" className="text-sm font-medium">{t('speedFirst.minSamples')}</Label>
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
                          {t('speedFirst.minSamplesHelpText')}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="speedTestInterval" className="text-sm font-medium">{t('speedFirst.speedTestInterval')}</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            id="speedTestInterval"
                            type="number"
                            min="30"
                            max="3600"
                            className="w-20"
                            value={settings.balanceMode?.speedFirst?.speedTestIntervalSeconds || 300}
                            onChange={e => handleSpeedFirstChange('speedTestIntervalSeconds', Number(e.target.value))}
                          />
                          <span className="text-sm text-muted-foreground">{t('speedFirst.speedTestIntervalUnit')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('speedFirst.speedTestIntervalHelpText')}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="speedTestStrategy" className="text-sm font-medium">{t('speedFirst.speedTestMethod')}</Label>
                        <Select
                          value={settings.balanceMode?.speedFirst?.speedTestStrategy || SpeedTestStrategy.ResponseTime}
                          onValueChange={(value: SpeedTestStrategy) => handleSpeedFirstChange('speedTestStrategy', value)}
                        >
                          <SelectTrigger className="w-full mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SpeedTestStrategy.ResponseTime}>{t('speedFirst.speedTestMethodResponseTime')}</SelectItem>
                            <SelectItem value={SpeedTestStrategy.HeadRequest}>{t('speedFirst.speedTestMethodHeadRequest')}</SelectItem>
                            <SelectItem value={SpeedTestStrategy.Ping}>{t('speedFirst.speedTestMethodPing')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('speedFirst.speedTestMethodHelpText')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 p-5 rounded-xl border-2 bg-gradient-to-br from-green-50/50 via-transparent to-transparent dark:from-green-950/20 border-green-200/50 dark:border-green-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600 shadow-md shadow-green-500/30">
                        <Activity className="h-4 w-4 text-white" />
                      </div>
                      <Label htmlFor="healthCheckEnabled" className="font-bold text-base">{t('healthCheck.title')}</Label>
                      <Badge variant={settings.balanceMode?.healthCheck?.enabled !== false ? 'default' : 'secondary'} className="text-xs ml-1">
                        {settings.balanceMode?.healthCheck?.enabled !== false ? t('healthCheck.enabled') : t('healthCheck.disabled')}
                      </Badge>
                    </div>
                    <Switch
                      id="healthCheckEnabled"
                      checked={settings.balanceMode?.healthCheck?.enabled !== false}
                      onCheckedChange={checked => handleHealthCheckChange('enabled', checked)}
                      className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-green-500 data-[state=checked]:to-green-600 data-[state=unchecked]:bg-green-200 dark:data-[state=unchecked]:bg-green-900/30 border-transparent"
                    />
                  </div>

                  {settings.balanceMode?.healthCheck?.enabled !== false && (
                    <div className="space-y-3 pl-6 border-l-2 border-green-200 dark:border-green-800">
                      <div>
                        <Label htmlFor="healthCheckInterval" className="text-sm font-medium flex items-center gap-2">
                          <Timer className="h-3 w-3" />
                          {t('healthCheck.healthCheckInterval')}
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
                          <span className="text-sm text-muted-foreground">{t('speedFirst.speedTestIntervalUnit')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{t('healthCheck.healthCheckIntervalHelpText')}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="banDuration" className="text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="h-3 w-3" />
                      {t('healthCheck.failedEndpointBanDuration')}
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
                      <span className="text-sm text-muted-foreground">{t('speedFirst.speedTestIntervalUnit')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('healthCheck.failedEndpointBanDurationHelpText')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cloud Storage Sync - Full Width */}
            <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 border-2 hover:border-purple-500/30 group">
              <CardHeader className="pb-5 bg-gradient-to-br from-purple-50/50 via-transparent to-transparent dark:from-purple-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30 group-hover:shadow-purple-500/50 transition-all duration-300">
                      <RefreshCw className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold">{t('cloudSync.title')}</CardTitle>
                      <CardDescription className="text-sm mt-0.5">{t('cloudSync.description')}</CardDescription>
                    </div>
                  </div>
                  {syncConfig?.enabled && (
                    <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white border-0 shadow-lg shadow-green-500/30 px-3 py-1">
                      {t('cloudSync.activeBadge', { provider: getProviderDisplayName(syncConfig.provider) })}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {syncConfig?.enabled
                  ? (
                    // Currently Enabled - Show status and disable option
                      <div className="space-y-4">
                        <div className="p-4 rounded-lg border bg-muted/50">
                          <div className="flex items-start gap-3">
                            {(() => {
                              const ProviderIcon = getProviderIcon(syncConfig.provider)
                              return <ProviderIcon className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                            })()}
                            <div className="flex-1">
                              <div className="font-medium">
                                {t('cloudSync.syncActive', { provider: getProviderDisplayName(syncConfig.provider) })}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {t('cloudSync.syncingEnabled')}
                              </p>
                              {syncStatus && !syncStatus.isValid && (
                                <div className="mt-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm">
                                      <p className="font-medium text-yellow-900 dark:text-yellow-100">{t('cloudSync.syncIssuesDetected')}</p>
                                      <ul className="text-yellow-700 dark:text-yellow-300 mt-1 list-disc list-inside">
                                        {syncStatus.issues.map((issue, idx) => (
                                          <li key={idx}>{issue}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {syncConfig.linkedAt && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  {t('cloudSync.linked', { date: new Date(syncConfig.linkedAt).toLocaleString() })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                          <div className="flex-1">
                            <Label className="font-medium">{t('cloudSync.migrateToDifferent')}</Label>
                            <p className="text-sm text-muted-foreground mt-1">
                              {t('cloudSync.migrateDescription', { provider: getProviderDisplayName(syncConfig.provider) })}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(): void => { void handleDisableSync() }}
                            disabled={loadingSync}
                          >
                            {loadingSync
                              ? (
                                  <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    {t('cloudSync.processing')}
                                  </div>
                                )
                              : (
                                  <>
                                    <CloudOff className="h-4 w-4 mr-2" />
                                    {t('cloudSync.disableReconfigure')}
                                  </>
                                )}
                          </Button>
                        </div>
                      </div>
                    )
                  : (
                    // Not Enabled - Show options to enable
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                              <p className="font-medium text-blue-900 dark:text-blue-100">{t('cloudSync.infoTitle')}</p>
                              <p className="text-blue-700 dark:text-blue-300 mt-1">
                                {t('cloudSync.infoDescription')}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Available Cloud Providers */}
                        {cloudProviders.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">{t('cloudSync.availableProviders')}</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {cloudProviders.map(provider => (
                                <Button
                                  key={provider.name}
                                  variant="outline"
                                  className="h-auto p-4 justify-start"
                                  onClick={(): void => {
                                    void handleEnableCloudSync(provider.name.toLowerCase() as 'icloud' | 'onedrive')
                                  }}
                                  disabled={!provider.isEnabled || loadingSync}
                                >
                                  <div className="flex items-start gap-3 w-full">
                                    {provider.name.toLowerCase() === 'icloud'
                                      ? <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                                      : <HardDrive className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />}
                                    <div className="flex-1 text-left">
                                      <div className="font-medium">{provider.name}</div>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {provider.isEnabled
                                          ? (provider.hasConfigs
                                              ? (
                                                  <>
                                                    {t('cloudSync.configsDetected')}
                                                    {provider.configModifiedDate && (
                                                      <span className="block text-[10px] mt-0.5 opacity-75">
                                                        {t('cloudSync.modified', { date: new Date(provider.configModifiedDate).toLocaleString() })}
                                                      </span>
                                                    )}
                                                  </>
                                                )
                                              : t('cloudSync.available'))
                                          : t('cloudSync.notAvailable')}
                                      </p>
                                    </div>
                                    {provider.isEnabled && (
                                      <Badge variant="secondary" className="text-xs">{t('cloudSync.ready')}</Badge>
                                    )}
                                  </div>
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Custom Folder Option */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">{t('cloudSync.customFolder')}</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder={t('cloudSync.customFolderPlaceholder')}
                              value={customSyncPath}
                              onChange={e => setCustomSyncPath(e.target.value)}
                              disabled={loadingSync}
                            />
                            <Button
                              onClick={(): void => { void handleEnableCustomSync() }}
                              disabled={!customSyncPath.trim() || loadingSync}
                            >
                              <FolderSync className="h-4 w-4 mr-2" />
                              {t('cloudSync.enable')}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t('cloudSync.customFolderHelpText')}
                          </p>
                        </div>
                      </div>
                    )}
              </CardContent>
            </Card>

            {/* S3 Sync Settings - Full Width */}
            <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/10 border-2 hover:border-orange-500/30 group">
              <CardHeader className="pb-5 bg-gradient-to-br from-orange-50/50 via-transparent to-transparent dark:from-orange-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-all duration-300">
                      <Cloud className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold">{t('s3Sync.title')}</CardTitle>
                      <CardDescription className="text-sm mt-0.5">{t('s3Sync.description')}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {settings.s3Sync && (
                      <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white border-0 shadow-lg shadow-green-500/30 px-3 py-1">
                        {t('s3Sync.active')}
                      </Badge>
                    )}
                    <Switch
                      id="enableS3"
                      checked={!!settings.s3Sync}
                      onCheckedChange={checked => checked ? enableS3() : disableS3()}
                      className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:to-orange-600 data-[state=unchecked]:bg-orange-200 dark:data-[state=unchecked]:bg-orange-900/30 border-transparent"
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
                        {t('s3Sync.storageConfig')}
                      </div>

                      <div>
                        <Label htmlFor="bucket" className="font-medium">{t('s3Sync.bucketName')}</Label>
                        <Input
                          id="bucket"
                          type="text"
                          className="mt-1"
                          value={settings.s3Sync.bucket}
                          onChange={e => handleS3Change('bucket', e.target.value)}
                          placeholder={t('s3Sync.bucketNamePlaceholder')}
                        />
                      </div>

                      <div>
                        <Label htmlFor="region" className="font-medium">{t('s3Sync.region')}</Label>
                        <Input
                          id="region"
                          type="text"
                          className="mt-1"
                          value={settings.s3Sync.region}
                          onChange={e => handleS3Change('region', e.target.value)}
                          placeholder={t('s3Sync.regionPlaceholder')}
                        />
                      </div>

                      <div>
                        <Label htmlFor="key" className="font-medium">{t('s3Sync.s3ObjectKey')}</Label>
                        <Input
                          id="key"
                          type="text"
                          className="mt-1"
                          value={settings.s3Sync.key}
                          onChange={e => handleS3Change('key', e.target.value)}
                          placeholder={t('s3Sync.s3ObjectKeyPlaceholder')}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('s3Sync.s3ObjectKeyHelpText')}
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="endpointUrl" className="font-medium flex items-center gap-2">
                          <Globe className="h-3 w-3" />
                          {t('s3Sync.customEndpoint')}
                          <Badge variant="outline" className="text-xs">Optional</Badge>
                        </Label>
                        <Input
                          id="endpointUrl"
                          type="url"
                          className="mt-1"
                          value={settings.s3Sync.endpointUrl}
                          onChange={e => handleS3Change('endpointUrl', e.target.value)}
                          placeholder={t('s3Sync.customEndpointPlaceholder')}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('s3Sync.customEndpointHelpText')}
                        </p>
                      </div>
                    </div>

                    {/* Authentication */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                        <Key className="h-4 w-4" />
                        {t('s3Sync.authentication')}
                      </div>

                      <div>
                        <Label htmlFor="accessKeyId" className="font-medium">{t('s3Sync.accessKeyId')}</Label>
                        <Input
                          id="accessKeyId"
                          type="text"
                          className="mt-1 font-mono"
                          value={settings.s3Sync.accessKeyId}
                          onChange={e => handleS3Change('accessKeyId', e.target.value)}
                          placeholder={t('s3Sync.accessKeyIdPlaceholder')}
                        />
                      </div>

                      <div>
                        <Label htmlFor="secretAccessKey" className="font-medium flex items-center gap-2">
                          <Lock className="h-3 w-3" />
                          {t('s3Sync.secretAccessKey')}
                        </Label>
                        <Input
                          id="secretAccessKey"
                          type="password"
                          className="mt-1 font-mono"
                          value={settings.s3Sync.secretAccessKey}
                          onChange={e => handleS3Change('secretAccessKey', e.target.value)}
                          placeholder={t('s3Sync.secretAccessKeyPlaceholder')}
                        />
                      </div>

                      {/* Remote Check Interval */}
                      <div>
                        <Label htmlFor="checkInterval" className="font-medium flex items-center gap-2">
                          <Timer className="h-3 w-3" />
                          {t('s3Sync.checkInterval')}
                        </Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            id="checkInterval"
                            type="number"
                            min="5"
                            max="1440"
                            className="w-20"
                            value={settings.s3Sync.remoteConfigCheckIntervalMinutes || 60}
                            onChange={e => handleS3Change('remoteConfigCheckIntervalMinutes', Number(e.target.value))}
                          />
                          <span className="text-sm text-muted-foreground">{t('speedFirst.responseTimeWindowUnit')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('s3Sync.checkIntervalHelpText')}
                        </p>
                      </div>

                      {/* Security Note - at the end */}
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-blue-900 dark:text-blue-100">{t('configForm.apiConfig.securityNote')}</p>
                            <p className="text-blue-700 dark:text-blue-300 mt-1">
                              {t('s3Sync.securityNote')}
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

        <DialogFooter className="pt-6 border-t bg-gradient-to-r from-muted/20 to-transparent flex-shrink-0 -mb-6 -mx-6 px-6 pb-6">
          <div className="flex items-center justify-end w-full gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="min-w-[100px] h-11 font-medium hover:bg-muted/80 transition-colors"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={(): void => { void handleSave() }}
              disabled={saving}
              className="min-w-[140px] h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 font-semibold transition-all duration-200"
            >
              {saving
                ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {t('saving')}
                    </div>
                  )
                : (
                    t('saveSettings')
                  )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Conflict Resolution Dialog */}
      <Dialog
        open={conflictDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConflictDialogOpen(false)
            setPendingSync(null)
            setConflicts([])
            setConflictDates(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0" />
              <span className="truncate">{t('conflict.title')}</span>
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              {t('conflict.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-x-hidden">
            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm min-w-0 flex-1">
                  <p className="font-medium text-orange-900 dark:text-orange-100">
                    {t('conflict.conflictCount', { count: conflicts.length })}
                  </p>
                  <p className="text-orange-700 dark:text-orange-300 mt-1">
                    {t('conflict.resolveDescription')}
                  </p>
                </div>
              </div>
            </div>

            {/* Show modification dates */}
            {conflictDates && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2 rounded bg-muted/50 border">
                  <div className="font-medium text-muted-foreground mb-1">{t('conflict.localConfig')}</div>
                  <div className="truncate">
                    {t('conflict.modified', { date: conflictDates.local ? new Date(conflictDates.local).toLocaleString() : 'Unknown' })}
                  </div>
                </div>
                <div className="p-2 rounded bg-muted/50 border">
                  <div className="font-medium text-muted-foreground mb-1">{t('conflict.cloudConfig')}</div>
                  <div className="truncate">
                    {t('conflict.modified', { date: conflictDates.cloud ? new Date(conflictDates.cloud).toLocaleString() : 'Unknown' })}
                  </div>
                </div>
              </div>
            )}

            {/* Resolution Options */}
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full h-auto p-4 justify-start text-left"
                onClick={() => { void handleResolveConflict('local') }}
                disabled={resolvingConflict}
              >
                <div className="flex items-center gap-3 w-full">
                  <HardDrive className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{t('conflict.useLocal')}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('conflict.useLocalDescription')}
                    </p>
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full h-auto p-4 justify-start text-left"
                onClick={() => { void handleResolveConflict('remote') }}
                disabled={resolvingConflict}
              >
                <div className="flex items-center gap-3 w-full">
                  <Cloud className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{t('conflict.useCloud')}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('conflict.useCloudDescription')}
                    </p>
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full h-auto p-4 justify-start text-left"
                onClick={() => { void handleResolveConflict('merge') }}
                disabled={resolvingConflict}
              >
                <div className="flex items-center gap-3 w-full">
                  <RefreshCw className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{t('conflict.smartMerge')}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('conflict.smartMergeDescription')}
                    </p>
                  </div>
                </div>
              </Button>
            </div>

            {resolvingConflict && (
              <div className="flex items-center justify-center gap-2 p-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="text-sm text-muted-foreground">{t('conflict.resolving')}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConflictDialogOpen(false)
                setPendingSync(null)
                setConflicts([])
                setConflictDates(null)
              }}
              disabled={resolvingConflict}
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
