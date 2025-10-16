'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { ClaudeConfig, SystemSettings } from '@/config/types'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { ConfigFormModal } from '@/components/config/config-form-modal'
import { ConfigList } from '@/components/config/config-list'
import { ConfirmDeleteModal } from '@/components/config/confirm-delete-modal'
import { EmptyState } from '@/components/layout/empty-state'
import { Header } from '@/components/layout/header'
import { SearchBar } from '@/components/layout/search-bar'
import { ConfigSwitchModal } from '@/components/proxy/config-switch-modal'
import { ProxyStatusCard } from '@/components/proxy/proxy-status-card'
import { SystemSettingsModal } from '@/components/settings/system-settings-modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VSCodeProvider } from '@/context/vscode-context'
import { useBroadcastChannel } from '@/hooks/use-broadcast-channel'
import { useConfigs } from '@/hooks/use-configs'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { useProxyStatus } from '@/hooks/use-proxy-status'
import { useShutdownCoordinator } from '@/hooks/use-shutdown-coordinator'

interface HomePageProps {
  isVSCode: boolean
  initialConfigs: ClaudeConfig[]
  initialSettings: SystemSettings
}

export default function HomePage({ isVSCode, initialConfigs, initialSettings }: HomePageProps): ReactNode {
  const {
    configs,
    settings,
    error,
    saveConfig,
    updateConfigs,
    updateConfigsOptimistically,
    deleteConfig: deleteConfigAPI,
    saveSettings,
    refetchConfigs,
  } = useConfigs(initialConfigs, initialSettings)

  const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false)
  const [isConfigSwitchOpen, setIsConfigSwitchOpen] = useState(false)
  const [deleteConfig, setDeleteConfig] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const dragOperationInProgress = useRef(false)

  const { shutdownCoordinator } = useShutdownCoordinator()

  // Monitor proxy server status
  const proxyStatus = useProxyStatus({
    port: 2333,
    intervalMs: 5000,
    enabled: !isVSCode, // Disable in VSCode since proxy is managed differently
  })

  // Use Broadcast Channel for cross-tab communication
  const { notifyConfigChange } = useBroadcastChannel({
    onConfigChange: () => {
      console.log('Config change notification received, refetching...')
      void refetchConfigs()
    },
    onShutdown: () => {
      console.log('Shutdown notification received, closing page...')
      window.close()
    },
  })

  // Monitor backend health and close manager if connection is lost
  useHeartbeat({
    intervalMs: 3000, // Check every 3 seconds
    maxFailures: 3, // Allow 3 consecutive failures before closing
    timeoutMs: 2000, // 2 second timeout per request
    startupDelayMs: 5000, // Wait 5 seconds before starting health checks (allows server to initialize)
    onConnectionLost: () => {
      console.error('[Heartbeat] Backend connection lost, closing manager...')

      // Call shutdown if this is the last tab, then close window
      void (async () => {
        if (shutdownCoordinator) {
          await shutdownCoordinator.callShutdownIfLastTab()
        }

        // Give a moment for shutdown to process, then close
        setTimeout(() => {
          window.close()
        }, 500)
      })()
    },
    enabled: !isVSCode, // Disable in VSCode since it manages lifecycle differently
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleSaveConfig = async (config: ClaudeConfig): Promise<void> => {
    await saveConfig(config, !!editingConfig, notifyConfigChange)
    setIsFormOpen(false)
    setEditingConfig(null)
  }

  const handleDeleteClick = (name: string): void => {
    setDeleteConfig(name)
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteConfig) {
      return
    }

    await deleteConfigAPI(deleteConfig, notifyConfigChange)
    setDeleteConfig(null)
  }

  const filteredConfigs = configs.filter(config =>
    config.name.toLowerCase().includes(searchTerm.toLowerCase())
    || (config.baseUrl && config.baseUrl.toLowerCase().includes(searchTerm.toLowerCase())),
  )

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event

    // Prevent concurrent drag operations
    if (dragOperationInProgress.current) {
      console.warn('Drag operation already in progress, ignoring...')
      return
    }

    if (active.id !== over?.id && over?.id) {
      // Find the indices in the full configs array
      const oldIndex = configs.findIndex(config => config.name === active.id)
      const newIndex = configs.findIndex(config => config.name === over.id)

      if (oldIndex === -1 || newIndex === -1) {
        console.error('Invalid drag operation: config not found')
        return
      }

      // Lock the operation
      dragOperationInProgress.current = true
      setIsDragging(true)

      // Save original state for potential rollback
      const originalConfigs = [...configs]

      // Calculate new order
      const reorderedConfigs = arrayMove(configs, oldIndex, newIndex)
      const updatedConfigs = reorderedConfigs.map((config, index) => ({
        ...config,
        order: index + 1,
      }))

      // Update UI optimistically
      updateConfigsOptimistically(updatedConfigs)

      // Persist to server
      void (async () => {
        try {
          await updateConfigs(updatedConfigs, undefined, notifyConfigChange)
          console.log('Config order updated successfully')
        }
        catch (error) {
          // Rollback to original state on failure
          console.error('Failed to update config order, reverting...', error)
          updateConfigsOptimistically(originalConfigs)
        }
        finally {
          // Release the lock
          dragOperationInProgress.current = false
          setIsDragging(false)
        }
      })()
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
    void updateConfigs(updatedConfigs, `Configuration "${configName}" has been ${enabled ? 'enabled' : 'disabled'}.`, notifyConfigChange)
  }

  const handleSetDefault = (configName: string): void => {
    const updatedConfigs = configs.map(config => ({
      ...config,
      isDefault: config.name === configName,
    }))
    void updateConfigs(updatedConfigs, `Configuration "${configName}" has been set as the default.`, notifyConfigChange)
  }

  return (
    <VSCodeProvider isVSCode={isVSCode}>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 sm:py-8 max-w-6xl">
          <Header
            isVSCode={isVSCode}
            shutdownCoordinator={shutdownCoordinator}
            onAddConfig={() => {
              setEditingConfig(null)
              setIsFormOpen(true)
            }}
            onOpenSettings={() => setIsSystemSettingsOpen(true)}
          />

          {error && (
            <Alert variant="destructive" className="mt-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Proxy Server Status - only show outside of VSCode */}
          {!isVSCode && (
            <div className="mt-6">
              <ProxyStatusCard
                isRunning={proxyStatus.isRunning}
                status={proxyStatus.status}
                loading={proxyStatus.loading}
                error={proxyStatus.error}
                onSwitchClick={() => setIsConfigSwitchOpen(true)}
              />
            </div>
          )}

          <div className="mt-8 space-y-6">
            <SearchBar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              isVSCode={isVSCode}
            />

            {filteredConfigs.length === 0 && searchTerm
              ? (
                  <EmptyState
                    type="no-search-results"
                    onClearSearch={() => setSearchTerm('')}
                  />
                )
              : filteredConfigs.length === 0
                ? (
                    <EmptyState
                      type="no-configs"
                      onAddConfig={() => setIsFormOpen(true)}
                    />
                  )
                : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                      modifiers={[restrictToVerticalAxis]}
                    >
                      <SortableContext
                        items={filteredConfigs.map(c => c.name)}
                        strategy={verticalListSortingStrategy}
                        disabled={isDragging}
                      >
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
            onSave={handleSaveConfig}
            onCancel={() => {
              setIsFormOpen(false)
              setEditingConfig(null)
            }}
          />

          <SystemSettingsModal
            open={isSystemSettingsOpen}
            onClose={() => setIsSystemSettingsOpen(false)}
            initialSettings={settings}
            onSave={async newSettings => saveSettings(newSettings, notifyConfigChange)}
            onConfigsChange={refetchConfigs}
          />

          <ConfirmDeleteModal
            open={!!deleteConfig}
            onClose={() => setDeleteConfig(null)}
            configName={deleteConfig}
            onConfirm={handleDeleteConfirm}
          />

          <ConfigSwitchModal
            open={isConfigSwitchOpen}
            onClose={() => setIsConfigSwitchOpen(false)}
            currentProxyPort={2333}
          />
        </div>
      </div>
    </VSCodeProvider>
  )
}
