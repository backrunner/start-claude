'use client'

import type { ClaudeConfig } from '@start-claude/cli/src/config/types'
import type { ReactNode } from 'react'
import type { ProxyStatus } from '@/hooks/use-proxy-status'
import { CheckCircle2, PlayCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ConfigSwitchModalProps {
  open: boolean
  onClose: () => void
  currentProxyPort?: number
}

interface SwitchResult {
  success: boolean
  message: string
  healthyEndpoints?: number
  totalEndpoints?: number
  endpointDetails?: Array<{ name: string, healthy: boolean, error?: string }>
  speedTestResults?: Array<{ name: string, responseTime: number }>
}

export function ConfigSwitchModal({ open, onClose, currentProxyPort = 2333 }: ConfigSwitchModalProps): ReactNode {
  const [configs, setConfigs] = useState<ClaudeConfig[]>([])
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set())
  const [currentProxyStatus, setCurrentProxyStatus] = useState<ProxyStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchResult, setSwitchResult] = useState<SwitchResult | null>(null)

  const loadConfigs = async (): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch('/api/configs')
      if (response.ok) {
        const data = await response.json()
        setConfigs(data.configs || [])
      }
    }
    catch (error) {
      console.error('Error loading configs:', error)
    }
    finally {
      setLoading(false)
    }
  }

  const loadCurrentProxyStatus = async (): Promise<void> => {
    try {
      const response = await fetch('/api/proxy-status')
      if (response.ok) {
        const data = await response.json()
        setCurrentProxyStatus(data)
      }
    }
    catch (error) {
      console.error('Error loading proxy status:', error)
    }
  }

  // Load available configs and current proxy status
  useEffect(() => {
    if (open) {
      void loadConfigs()
      void loadCurrentProxyStatus()
      setSwitchResult(null)
    }
  }, [open])

  const toggleConfig = (configName: string): void => {
    const newSelected = new Set(selectedConfigs)
    if (newSelected.has(configName)) {
      newSelected.delete(configName)
    }
    else {
      newSelected.add(configName)
    }
    setSelectedConfigs(newSelected)
  }

  const handleSwitch = async (): Promise<void> => {
    if (selectedConfigs.size === 0) {
      return
    }

    setSwitching(true)
    setSwitchResult(null)

    try {
      // Get the full config objects for the selected names
      const selectedConfigObjects = configs.filter(c => c.name && selectedConfigs.has(c.name))

      // Send switch request to proxy server
      const response = await fetch(`http://localhost:${currentProxyPort}/__switch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configs: selectedConfigObjects,
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSwitchResult(result)
      }
      else {
        setSwitchResult({
          success: false,
          message: result.error?.message || 'Switch failed',
          endpointDetails: result.endpointDetails,
        })
      }
    }
    catch (error) {
      console.error('Error switching configs:', error)
      setSwitchResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    finally {
      setSwitching(false)
    }
  }

  const isConfigCurrentlyInUse = (configName: string): boolean => {
    if (!currentProxyStatus?.endpoints)
      return false
    return currentProxyStatus.endpoints.some(endpoint =>
      endpoint.config.name === configName,
    )
  }

  const handleClose = (): void => {
    setSelectedConfigs(new Set())
    setSwitchResult(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <RefreshCw className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold text-foreground">
                Switch Configurations
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Select configs to use in the proxy server
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden py-4">
          {loading
            ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )
            : (
                <>
                  <div className="space-y-2 mb-4">
                    <h4 className="text-sm font-medium">Available Configurations:</h4>
                    <p className="text-xs text-muted-foreground">
                      Select one or more configurations to load into the proxy server
                    </p>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-2 bg-muted/20">
                    {configs.length === 0
                      ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No configurations available
                          </div>
                        )
                      : (
                          configs.map((config) => {
                            const isSelected = config.name && selectedConfigs.has(config.name)
                            const isCurrentlyInUse = config.name && isConfigCurrentlyInUse(config.name)
                            return (
                              <div
                                key={config.name}
                                onClick={() => config.name && toggleConfig(config.name)}
                                className={`flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'border-primary bg-primary/5'
                                    : isCurrentlyInUse
                                      ? 'border-green-500/50 bg-green-500/5'
                                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div
                                    className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                      isSelected
                                        ? 'border-primary bg-primary'
                                        : 'border-muted-foreground'
                                    }`}
                                  >
                                    {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-medium text-sm truncate">{config.name}</p>
                                      {isCurrentlyInUse && (
                                        <PlayCircle className="h-3 w-3 text-green-600 flex-shrink-0" />
                                      )}
                                    </div>
                                    {config.baseUrl && (
                                      <p className="text-xs text-muted-foreground truncate">{config.baseUrl}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                  {isCurrentlyInUse && (
                                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/30">
                                      In Use
                                    </Badge>
                                  )}
                                  {config.enabled && !isCurrentlyInUse && (
                                    <Badge variant="default" className="text-xs">
                                      Enabled
                                    </Badge>
                                  )}
                                  {config.isDefault && (
                                    <Badge variant="secondary" className="text-xs">
                                      Default
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )
                          })
                        )}
                  </div>

                  {/* Switch Result */}
                  {switchResult && (
                    <div className={`mt-3 p-3 rounded-lg border ${
                      switchResult.success
                        ? 'border-green-500/20 bg-green-500/5'
                        : 'border-red-500/20 bg-red-500/5'
                    }`}
                    >
                      <p className={`text-xs font-medium ${
                        switchResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}
                      >
                        {switchResult.message}
                      </p>

                      {switchResult.success && switchResult.endpointDetails && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium">Endpoints:</p>
                          {switchResult.endpointDetails.map((detail, index) => (
                            <div key={index} className="text-xs flex items-center gap-1">
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                detail.healthy ? 'bg-green-500' : 'bg-red-500'
                              }`}
                              />
                              <span className="truncate">{detail.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
        </div>

        <DialogFooter className="pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={switching} size="sm">
            {switchResult?.success ? 'Close' : 'Cancel'}
          </Button>
          <Button
            onClick={() => void handleSwitch()}
            disabled={switching || selectedConfigs.size === 0 || loading}
            size="sm"
          >
            {switching
              ? (
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Switching...
                  </div>
                )
              : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Switch (
                    {selectedConfigs.size}
                    )
                  </>
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
