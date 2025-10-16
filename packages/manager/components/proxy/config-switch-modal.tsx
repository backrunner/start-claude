'use client'

import type { ClaudeConfig } from '@start-claude/cli/src/config/types'
import type { ReactNode } from 'react'
import type { ProxyStatus } from '@/hooks/use-proxy-status'
import { AlertCircle, PlayCircle, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface ConfigSwitchModalProps {
  open: boolean
  onClose: () => void
  currentProxyPort?: number
  onSwitchSuccess?: (result: SwitchResult) => void
}

export interface SwitchResult {
  success: boolean
  message: string
  healthyEndpoints?: number
  totalEndpoints?: number
  endpointDetails?: Array<{ name: string, healthy: boolean, error?: string }>
  speedTestResults?: Array<{ name: string, responseTime: number }>
}

export function ConfigSwitchModal({ open, onClose, currentProxyPort = 2333, onSwitchSuccess }: ConfigSwitchModalProps): ReactNode {
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

  const handleClose = (): void => {
    setSelectedConfigs(new Set())
    setSwitchResult(null)
    onClose()
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

      if (selectedConfigObjects.length === 0) {
        setSwitchResult({
          success: false,
          message: 'No valid configurations selected',
        })
        setSwitching(false)
        return
      }

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

      // Handle network errors or CORS issues
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        }
        catch {
          // Failed to parse error response, use status text
        }

        setSwitchResult({
          success: false,
          message: errorMessage,
        })
        setSwitching(false)
        return
      }

      const result = await response.json()

      // Check if the switch was successful
      if (result.success) {
        const successResult: SwitchResult = {
          success: true,
          message: result.message || 'Successfully switched configurations',
          healthyEndpoints: result.healthyEndpoints,
          totalEndpoints: result.totalEndpoints,
          endpointDetails: result.endpointDetails,
          speedTestResults: result.speedTestResults,
        }

        // Call success callback if provided
        if (onSwitchSuccess) {
          onSwitchSuccess(successResult)
        }

        // Auto-close modal on success
        handleClose()
      }
      else {
        // Switch failed (e.g., all endpoints failed health checks)
        setSwitchResult({
          success: false,
          message: result.message || result.error?.message || 'Switch failed',
          endpointDetails: result.endpointDetails,
        })
      }
    }
    catch (error) {
      console.error('Error switching configs:', error)

      // Provide more helpful error messages
      let errorMessage = 'Failed to connect to proxy server'
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = `Cannot connect to proxy server at port ${currentProxyPort}. Is the proxy running?`
      }
      else if (error instanceof Error) {
        errorMessage = error.message
      }

      setSwitchResult({
        success: false,
        message: errorMessage,
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-6 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent -mt-6 -mx-6 px-6 pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
              <RefreshCw className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Switch Configurations
              </DialogTitle>
              <DialogDescription className="text-base mt-1.5 text-muted-foreground">
                Select configurations to load into the proxy server
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-6 px-1">
          {loading
            ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
                </div>
              )
            : (
                <div className="space-y-6 pr-3">
                  {/* Info Card */}
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3">
                      <Settings2 className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm flex-1">
                        <p className="font-medium text-blue-900 dark:text-blue-100">Configuration Switching</p>
                        <p className="text-blue-700 dark:text-blue-300 mt-1">
                          Select one or more configurations to load into the proxy server. The server will perform health checks on all selected endpoints.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Configuration List */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground">Available Configurations</h4>
                    {configs.length === 0
                      ? (
                          <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
                            <Settings2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p className="font-medium">No configurations available</p>
                            <p className="text-xs mt-1">Add configurations in the settings</p>
                          </div>
                        )
                      : (
                          <div className="space-y-2">
                            {configs.map((config) => {
                              const isSelected = config.name && selectedConfigs.has(config.name)
                              const isCurrentlyInUse = config.name && isConfigCurrentlyInUse(config.name)
                              return (
                                <div
                                  key={config.name}
                                  onClick={() => config.name && toggleConfig(config.name)}
                                  className={`group flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                                    isSelected
                                      ? 'border-primary bg-primary/5 shadow-sm'
                                      : isCurrentlyInUse
                                        ? 'border-green-500/50 bg-green-500/5'
                                        : 'border-border hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <Checkbox
                                      checked={isSelected || false}
                                      onCheckedChange={() => config.name && toggleConfig(config.name)}
                                      className="h-5 w-5"
                                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <Label
                                          htmlFor={`config-${config.name}`}
                                          className="font-semibold text-base truncate cursor-pointer"
                                        >
                                          {config.name}
                                        </Label>
                                        {isCurrentlyInUse && (
                                          <PlayCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                        )}
                                      </div>
                                      {config.baseUrl && (
                                        <p className="text-sm text-muted-foreground truncate mt-1">{config.baseUrl}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                    {isCurrentlyInUse && (
                                      <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white border-0 shadow-md shadow-green-500/30 px-2 py-0.5">
                                        In Use
                                      </Badge>
                                    )}
                                    {config.enabled && !isCurrentlyInUse && (
                                      <Badge variant="default" className="px-2 py-0.5">
                                        Enabled
                                      </Badge>
                                    )}
                                    {config.isDefault && (
                                      <Badge variant="secondary" className="px-2 py-0.5">
                                        Default
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                  </div>

                  {/* Switch Result - Only show errors */}
                  {switchResult && !switchResult.success && (
                    <div className="p-4 rounded-xl border-2 transition-all duration-300 border-red-500/30 bg-red-500/10">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base text-red-900 dark:text-red-100">
                            Switch Failed
                          </p>
                          <p className="text-sm mt-1 text-red-700 dark:text-red-300">
                            {switchResult.message}
                          </p>

                          {switchResult.endpointDetails && switchResult.endpointDetails.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Endpoint Status:</p>
                              <div className="space-y-1">
                                {switchResult.endpointDetails.map((detail, index) => (
                                  <div key={index} className="flex items-center gap-2 text-sm">
                                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                                      detail.healthy ? 'bg-green-500' : 'bg-red-500'
                                    }`}
                                    />
                                    <span className="truncate font-medium">{detail.name}</span>
                                    {detail.error && (
                                      <span className="text-xs text-red-600 dark:text-red-400 truncate">
                                        -
                                        {' '}
                                        {detail.error}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
        </div>

        <DialogFooter className="pt-6 border-t bg-gradient-to-r from-muted/20 to-transparent flex-shrink-0 -mb-6 -mx-6 px-6 pb-6">
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              {selectedConfigs.size > 0 && `${selectedConfigs.size} configuration${selectedConfigs.size === 1 ? '' : 's'} selected`}
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={switching}
                className="min-w-[100px] h-11 font-medium hover:bg-muted/80 transition-colors"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSwitch()}
                disabled={switching || selectedConfigs.size === 0 || loading}
                className="min-w-[140px] h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 font-semibold transition-all duration-200"
              >
                {switching
                  ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Switching...
                      </div>
                    )
                  : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Switch Configs
                      </>
                    )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
