'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { ClaudeConfig, SystemSettings } from '@/config/types'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertCircle, Command, Plus, Search, Settings, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfigFormModal } from '@/components/config-form-modal'
import { ConfigList } from '@/components/config-list'
import { ConfirmDeleteModal } from '@/components/confirm-delete-modal'
import { SystemSettingsModal } from '@/components/system-settings-modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ShutdownCoordinator } from '@/lib/shutdown-coordinator'
import { useToast } from '@/lib/use-toast'

export default function HomePage(): ReactNode {
  const { toast } = useToast()
  const [configs, setConfigs] = useState<ClaudeConfig[]>([])
  const [settings, setSettings] = useState<SystemSettings>({} as SystemSettings)
  const [loading, setLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false)
  const [deleteConfig, setDeleteConfig] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const fetchConfigs = async (): Promise<void> => {
    try {
      setError(null)
      const response = await fetch('/api/configs')

      if (!response.ok) {
        throw new Error('Failed to fetch configurations')
      }

      const data = await response.json()
      setConfigs(data.configs || [])
      setSettings(data.settings || {})
    }
    catch (error) {
      console.error('Error fetching configs:', error)
      setError(error instanceof Error ? error.message : 'Failed to load configurations')
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfigs()

    // Initialize shutdown coordinator
    const shutdownCoordinator = new ShutdownCoordinator()

    // Custom shutdown callback (optional - will use default if not set)
    shutdownCoordinator.setShutdownCallback(async () => {
      try {
        const response = await fetch('/api/shutdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({}),
        })

        if (response.ok) {
          console.log('Shutdown API called successfully')
        }
        else {
          console.warn('Shutdown API returned non-ok response')
        }
      }
      catch (error) {
        console.error('Error calling shutdown API:', error)
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/shutdown', JSON.stringify({}))
        }
      }
    })

    // Add ESC key listener
    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      if (event.key === 'Escape') {
        console.log('ESC key pressed, initiating shutdown...')
        await shutdownCoordinator.callShutdownIfLastTab()

        // Give a moment for the shutdown to process
        setTimeout(() => {
          window.close()
        }, 300)
      }
    }

    // WebSocket connection for real-time shutdown
    let ws: WebSocket | null = null
    const wsReconnectTimeout: NodeJS.Timeout | null = null
    let healthCheckInterval: NodeJS.Timeout | null = null
    let useHealthCheck = false

    const connectWebSocket = async (): Promise<void> => {
      try {
        // First check if WebSocket server is available
        const wsInfoResponse = await fetch('/api/ws', { cache: 'no-cache' })
        const wsInfo = await wsInfoResponse.json()

        if (!wsInfo.serverRunning || !wsInfo.websocketUrl) {
          console.log('WebSocket server not available, using health check fallback')
          useHealthCheck = true
          startHealthCheck()
          return
        }

        console.log('Connecting to WebSocket:', wsInfo.websocketUrl)
        ws = new WebSocket(wsInfo.websocketUrl)

        ws.onopen = () => {
          console.log('WebSocket connected successfully')
          useHealthCheck = false
          // Stop health check if it was running
          if (healthCheckInterval) {
            clearInterval(healthCheckInterval)
            healthCheckInterval = null
          }
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            console.log('WebSocket message received:', message)

            if (message.type === 'shutdown') {
              console.log('Shutdown message received via WebSocket, closing page...')
              window.close()
            }
          }
          catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }

        ws.onclose = (event) => {
          console.log('WebSocket connection closed:', event.code, event.reason)
          ws = null

          // If close wasn't intentional, try to reconnect or fallback to health check
          if (event.code !== 1000 && !useHealthCheck) {
            console.log('WebSocket connection lost, starting health check fallback')
            useHealthCheck = true
            startHealthCheck()
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          ws = null
          if (!useHealthCheck) {
            console.log('WebSocket error, switching to health check fallback')
            useHealthCheck = true
            startHealthCheck()
          }
        }
      }
      catch (error) {
        console.error('Failed to connect WebSocket:', error)
        useHealthCheck = true
        startHealthCheck()
      }
    }

    // Health check fallback when WebSocket is not available
    const healthCheck = async (): Promise<boolean> => {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-cache',
        })
        return response.ok
      }
      catch {
        return false
      }
    }

    function startHealthCheck(): void {
      if (healthCheckInterval)
        return // Already running

      console.log('Starting health check polling (WebSocket fallback)')
      healthCheckInterval = setInterval(() => {
        void (async () => {
          if (!useHealthCheck) {
            // WebSocket has reconnected, stop health check
            if (healthCheckInterval) {
              clearInterval(healthCheckInterval)
              healthCheckInterval = null
            }
            return
          }

          const isHealthy = await healthCheck()
          if (!isHealthy) {
            console.log('Manager server is no longer responding, closing page...')
            window.close()
          }
        })()
      }, 2000) // Check every 2 seconds
    }

    // Try to connect WebSocket first, fallback to health check if needed
    void connectWebSocket()

    // Add beforeunload listener to catch all page close scenarios
    const handleBeforeUnload = (_event: BeforeUnloadEvent): void => {
      shutdownCoordinator.handleBeforeUnload()
    }

    // Add unload listener as backup for when beforeunload might not work
    const handleUnload = (): void => {
      shutdownCoordinator.handleUnload()
    }

    window.addEventListener('keydown', handleKeyDown as EventListener)
    window.addEventListener('beforeunload', handleBeforeUnload as EventListener)
    window.addEventListener('unload', handleUnload)

    return () => {
      // Cleanup shutdown coordinator
      shutdownCoordinator.cleanup()

      // Cleanup WebSocket
      if (ws) {
        ws.close(1000, 'Page unloading')
        ws = null
      }

      // Cleanup intervals and timeouts
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval)
      }
      if (wsReconnectTimeout) {
        clearTimeout(wsReconnectTimeout)
      }

      // Cleanup event listeners
      window.removeEventListener('keydown', handleKeyDown as EventListener)
      window.removeEventListener('beforeunload', handleBeforeUnload as EventListener)
      window.removeEventListener('unload', handleUnload)
    }
  }, [])

  const saveConfig = async (config: ClaudeConfig): Promise<void> => {
    try {
      const response = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save config')
      }

      await fetchConfigs()
      setIsFormOpen(false)
      setEditingConfig(null)

      toast({
        title: 'Configuration saved',
        description: `Configuration "${config.name}" has been ${editingConfig ? 'updated' : 'created'} successfully.`,
        variant: 'success',
      })
    }
    catch (error) {
      console.error('Error saving config:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save configuration'
      setError(errorMessage)

      toast({
        title: 'Failed to save configuration',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }

  const updateConfigs = async (updatedConfigs: ClaudeConfig[], customMessage?: string): Promise<void> => {
    try {
      const response = await fetch('/api/configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: updatedConfigs }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update configs')
      }

      setConfigs(updatedConfigs)

      toast({
        title: 'Configurations updated',
        description: customMessage || 'Configuration order has been updated successfully.',
        variant: 'success',
      })
    }
    catch (error) {
      console.error('Error updating configs:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update configurations'
      setError(errorMessage)

      toast({
        title: 'Failed to update configurations',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }

  const handleDeleteClick = (name: string): void => {
    setDeleteConfig(name)
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteConfig)
      return

    try {
      const response = await fetch(`/api/configs?name=${encodeURIComponent(deleteConfig)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete config')
      }

      await fetchConfigs()

      toast({
        title: 'Configuration deleted',
        description: `Configuration "${deleteConfig}" has been deleted successfully.`,
        variant: 'success',
      })
    }
    catch (error) {
      console.error('Error deleting config:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete configuration'
      setError(errorMessage)

      toast({
        title: 'Failed to delete configuration',
        description: errorMessage,
        variant: 'destructive',
      })
    }
    finally {
      setDeleteConfig(null)
    }
  }

  const handleSystemSettingsSave = async (newSettings: SystemSettings): Promise<void> => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save settings')
      }

      const data = await response.json()
      setSettings(data.settings)

      toast({
        title: 'System settings saved',
        description: 'System settings have been updated successfully.',
        variant: 'success',
      })
    }
    catch (error) {
      console.error('Error saving system settings:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save system settings'
      setError(errorMessage)

      toast({
        title: 'Failed to save system settings',
        description: errorMessage,
        variant: 'destructive',
      })
      throw error
    }
  }

  // Filter configs by search term only
  const filteredConfigs = configs.filter(config =>
    config.name.toLowerCase().includes(searchTerm.toLowerCase())
    || (config.baseUrl && config.baseUrl.toLowerCase().includes(searchTerm.toLowerCase())),
  )

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event

    if (active.id !== over?.id && over?.id) {
      const oldIndex = filteredConfigs.findIndex(config => config.name === active.id)
      const newIndex = filteredConfigs.findIndex(config => config.name === over.id)

      const reorderedConfigs = arrayMove(filteredConfigs, oldIndex, newIndex)
      const updatedFilteredConfigs = reorderedConfigs.map((config, index) => ({
        ...config,
        order: index,
      }))

      // Update all configs array with new orders, preserving disabled configs
      const allConfigsUpdated = configs.map((config) => {
        const updatedConfig = updatedFilteredConfigs.find(c => c.name === config.name)
        return updatedConfig || config
      })

      void updateConfigs(allConfigsUpdated)
    }
  }

  const handleEdit = (config: ClaudeConfig): void => {
    setEditingConfig(config)
    setIsFormOpen(true)
  }

  const handleToggleEnabled = (configName: string, enabled: boolean): void => {
    const updatedConfigs = configs.map(config =>
      config.name === configName ? { ...config, enabled } : config,
    )
    void updateConfigs(updatedConfigs, `Configuration "${configName}" has been ${enabled ? 'enabled' : 'disabled'}.`)
  }

  const handleSetDefault = (configName: string): void => {
    const updatedConfigs = configs.map(config => ({
      ...config,
      isDefault: config.name === configName,
    }))
    void updateConfigs(updatedConfigs, `Configuration "${configName}" has been set as the default.`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-64">
            <Card className="p-6">
              <CardContent className="flex items-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <div>
                  <p className="text-lg font-medium">Loading configurations...</p>
                  <p className="text-sm text-muted-foreground">Please wait while we fetch your Claude settings</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  Start Claude Manager
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setIsSystemSettingsOpen(true)}
                className="hover:bg-muted/50"
              >
                <Settings className="w-4 h-4 mr-2" />
                System Settings
              </Button>
              <Button
                onClick={() => {
                  setEditingConfig(null)
                  setIsFormOpen(true)
                }}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Configuration
              </Button>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="flex justify-between items-center">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search configurations..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="outline" className="text-xs px-2 py-1">
              <Command className="h-3 w-3 mr-1" />
              Press ESC to close manager
            </Badge>
          </div>

          {/* Configuration List */}
          {filteredConfigs.length === 0 && searchTerm
            ? (
                <Card className="border-dashed border-2">
                  <CardContent className="text-center py-12">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted mx-auto mb-4">
                      <Search className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                      No configurations found
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Try adjusting your search terms or clear the filter
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setSearchTerm('')}
                      className="mt-4"
                    >
                      Clear Search
                    </Button>
                  </CardContent>
                </Card>
              )
            : filteredConfigs.length === 0
              ? (
                  <Card className="border-dashed border-2">
                    <CardContent className="text-center py-12">
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 mx-auto mb-6">
                        <Plus className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">No Configurations Yet</h3>
                      <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                        Get started by creating your first Claude configuration to manage your AI assistant settings
                      </p>
                      <Button
                        onClick={() => setIsFormOpen(true)}
                        size="lg"
                        className="bg-primary hover:bg-primary/90"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Your First Configuration
                      </Button>
                    </CardContent>
                  </Card>
                )
              : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis]}
                  >
                    <SortableContext items={filteredConfigs.map(c => c.name)} strategy={verticalListSortingStrategy}>
                      <ConfigList
                        configs={filteredConfigs}
                        onEdit={handleEdit}
                        onDelete={handleDeleteClick}
                        onToggleEnabled={handleToggleEnabled}
                        onSetDefault={handleSetDefault}
                      />
                    </SortableContext>
                  </DndContext>
                )}
        </div>

        <ConfigFormModal
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          config={editingConfig}
          onSave={(config): void => { void saveConfig(config) }}
          onCancel={() => {
            setIsFormOpen(false)
            setEditingConfig(null)
          }}
        />

        <SystemSettingsModal
          open={isSystemSettingsOpen}
          onClose={() => setIsSystemSettingsOpen(false)}
          initialSettings={settings}
          onSave={handleSystemSettingsSave}
        />

        <ConfirmDeleteModal
          open={!!deleteConfig}
          onClose={() => setDeleteConfig(null)}
          configName={deleteConfig}
          onConfirm={(): void => { void handleDeleteConfirm() }}
        />
      </div>
    </div>
  )
}
