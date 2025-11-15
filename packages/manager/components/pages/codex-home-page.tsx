'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import type { CodexConfig, CodexSettings } from '@start-claude/cli/src/codex/config/types'
import type { ReactNode } from 'react'
import type { SystemSettings } from '@/config/types'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { CodexFormModal } from '@/components/codex/codex-form-modal'
import { CodexList } from '@/components/codex/codex-list'
import { ConfirmDeleteModal } from '@/components/config/confirm-delete-modal'
import { EmptyState } from '@/components/layout/empty-state'
import { Header } from '@/components/layout/header'
import { SearchBar } from '@/components/layout/search-bar'
import { SystemSettingsModal } from '@/components/settings/system-settings-modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadBalancerStrategy } from '@/config/types'
import { VSCodeProvider } from '@/context/vscode-context'
import { useBroadcastChannel } from '@/hooks/use-broadcast-channel'
import { useCodexConfigs } from '@/hooks/use-codex-configs'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { useShutdownCoordinator } from '@/hooks/use-shutdown-coordinator'
import { toast } from '@/lib/use-toast'

/**
 * Convert CodexSettings to SystemSettings for the settings modal
 */
function codexToSystemSettings(codexSettings: CodexSettings): SystemSettings {
  return {
    overrideClaudeCommand: false, // Not relevant for Codex
    balanceMode: {
      enableByDefault: false,
      strategy: LoadBalancerStrategy.Fallback,
      healthCheck: {
        enabled: false,
        intervalMs: 30000,
      },
      failedEndpoint: {
        banDurationSeconds: 300,
      },
    },
    sync: codexSettings.sync
      ? {
          enabled: codexSettings.sync.enabled,
          provider: codexSettings.sync.provider,
          cloudPath: codexSettings.sync.cloudPath,
          customPath: codexSettings.sync.cloudPath, // Use cloudPath for both
          s3Config: undefined, // S3 config is separate in Codex
          linkedAt: codexSettings.sync.linkedAt || new Date().toISOString(),
          lastVerified: undefined,
        }
      : undefined,
    s3Sync: codexSettings.s3Sync && codexSettings.s3Sync.enabled
      ? {
          bucket: codexSettings.s3Sync.bucket || '',
          region: codexSettings.s3Sync.region || 'us-east-1',
          accessKeyId: codexSettings.s3Sync.accessKeyId || '',
          secretAccessKey: codexSettings.s3Sync.secretAccessKey || '',
          key: codexSettings.s3Sync.prefix || 'codex-configs.json',
          endpointUrl: codexSettings.s3Sync.endpoint,
          remoteConfigCheckIntervalMinutes: 60,
        }
      : undefined,
  }
}

/**
 * Convert SystemSettings to CodexSettings after modal save
 */
function systemToCodexSettings(systemSettings: SystemSettings): CodexSettings {
  return {
    sync: systemSettings.sync
      ? {
          enabled: systemSettings.sync.enabled,
          provider: systemSettings.sync.provider,
          cloudPath: systemSettings.sync.customPath || systemSettings.sync.cloudPath,
          linkedAt: systemSettings.sync.linkedAt,
        }
      : undefined,
    s3Sync: systemSettings.s3Sync
      ? {
          enabled: true,
          endpoint: systemSettings.s3Sync.endpointUrl,
          region: systemSettings.s3Sync.region,
          bucket: systemSettings.s3Sync.bucket,
          accessKeyId: systemSettings.s3Sync.accessKeyId,
          secretAccessKey: systemSettings.s3Sync.secretAccessKey,
          prefix: systemSettings.s3Sync.key,
          autoSync: true,
        }
      : undefined,
  }
}

interface CodexHomePageProps {
  isVSCode: boolean
  initialConfigs: CodexConfig[]
  initialSettings: CodexSettings
}

export default function CodexHomePage({ isVSCode, initialConfigs, initialSettings }: CodexHomePageProps): ReactNode {
  const t = useTranslations('codex')

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
  } = useCodexConfigs(initialConfigs, initialSettings)

  const [editingConfig, setEditingConfig] = useState<CodexConfig | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false)
  const [deleteConfig, setDeleteConfig] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const dragOperationInProgress = useRef(false)

  const { shutdownCoordinator } = useShutdownCoordinator()

  // Use Broadcast Channel for cross-tab communication
  const { notifyConfigChange } = useBroadcastChannel({
    onConfigChange: () => {
      console.log('Codex config change notification received, refetching...')
      void refetchConfigs()
    },
    onShutdown: () => {
      console.log('Shutdown notification received, closing page...')
      window.close()
    },
  })

  // Monitor backend health
  useHeartbeat({
    intervalMs: 3000,
    maxFailures: 3,
    timeoutMs: 2000,
    startupDelayMs: 5000,
    onConnectionLost: () => {
      console.error('[Heartbeat] Backend connection lost, closing manager...')
      void (async () => {
        if (shutdownCoordinator) {
          await shutdownCoordinator.callShutdownIfLastTab()
        }
        setTimeout(() => {
          window.close()
        }, 500)
      })()
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragStart = (): void => {
    setIsDragging(true)
    dragOperationInProgress.current = true
  }

  const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event

    setIsDragging(false)

    if (!over || active.id === over.id) {
      dragOperationInProgress.current = false
      return
    }

    const oldIndex = configs.findIndex(config => config.id === active.id)
    const newIndex = configs.findIndex(config => config.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      dragOperationInProgress.current = false
      return
    }

    const reorderedConfigs = arrayMove(configs, oldIndex, newIndex).map((config, index) => ({
      ...config,
      order: index + 1,
    }))

    updateConfigsOptimistically(reorderedConfigs)

    try {
      await updateConfigs(reorderedConfigs)
      notifyConfigChange()
    }
    catch (error) {
      console.error('Failed to save reordered configs:', error)
      toast({
        title: t('error.reorder'),
        description: t('error.reorderDescription'),
        variant: 'destructive',
      })
      void refetchConfigs()
    }
    finally {
      dragOperationInProgress.current = false
    }
  }

  const handleDragCancel = (): void => {
    setIsDragging(false)
    dragOperationInProgress.current = false
  }

  const handleSaveConfig = async (config: CodexConfig): Promise<void> => {
    try {
      await saveConfig(config)
      setIsFormOpen(false)
      setEditingConfig(null)
      notifyConfigChange()

      toast({
        title: t('success.saved'),
        description: t('success.savedDescription', { name: config.name }),
      })
    }
    catch (error) {
      console.error('Failed to save config:', error)
      toast({
        title: t('error.save'),
        description: t('error.saveDescription'),
        variant: 'destructive',
      })
    }
  }

  const handleDeleteConfig = async (name: string): Promise<void> => {
    try {
      await deleteConfigAPI(name)
      setDeleteConfig(null)
      notifyConfigChange()

      toast({
        title: t('success.deleted'),
        description: t('success.deletedDescription', { name }),
      })
    }
    catch (error) {
      console.error('Failed to delete config:', error)
      toast({
        title: t('error.delete'),
        description: t('error.deleteDescription'),
        variant: 'destructive',
      })
    }
  }

  const handleEditConfig = (config: CodexConfig): void => {
    if (!dragOperationInProgress.current) {
      setEditingConfig(config)
      setIsFormOpen(true)
    }
  }

  const handleAddNew = (): void => {
    setEditingConfig(null)
    setIsFormOpen(true)
  }

  const filteredConfigs = configs.filter((config) => {
    if (!searchTerm)
      return true
    const term = searchTerm.toLowerCase()
    return (
      config.name.toLowerCase().includes(term)
      || config.baseUrl?.toLowerCase().includes(term)
      || config.model?.toLowerCase().includes(term)
    )
  })

  const sortedConfigs = [...filteredConfigs].sort((a, b) => (a.order || 0) - (b.order || 0))

  return (
    <VSCodeProvider isVSCode={isVSCode}>
      <div className="container mx-auto p-6 max-w-6xl">
        <Header
          onOpenSettings={() => setIsSystemSettingsOpen(true)}
          onAddConfig={handleAddNew}
          mode="codex"
          isVSCode={isVSCode}
          shutdownCoordinator={shutdownCoordinator}
        />

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <SearchBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          isVSCode={isVSCode}
        />

        {sortedConfigs.length === 0
          ? (
              <EmptyState
                type={searchTerm ? 'no-search-results' : 'no-configs'}
                onAddConfig={searchTerm ? undefined : handleAddNew}
                onClearSearch={searchTerm ? () => setSearchTerm('') : undefined}
              />
            )
          : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={(event) => {
                  void handleDragEnd(event)
                }}
                onDragCancel={handleDragCancel}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext items={sortedConfigs.map(c => c.id!)} strategy={verticalListSortingStrategy}>
                  <CodexList
                    configs={sortedConfigs}
                    onEdit={handleEditConfig}
                    onDelete={name => setDeleteConfig(name)}
                    isDragging={isDragging}
                    settings={settings}
                    onSaveConfig={saveConfig}
                    refetchConfigs={refetchConfigs}
                  />
                </SortableContext>
              </DndContext>
            )}

        <CodexFormModal
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false)
            setEditingConfig(null)
          }}
          onSave={handleSaveConfig}
          config={editingConfig}
        />

        <SystemSettingsModal
          open={isSystemSettingsOpen}
          onClose={() => setIsSystemSettingsOpen(false)}
          initialSettings={codexToSystemSettings(settings)}
          onSave={async (systemSettings) => {
            await saveSettings(systemToCodexSettings(systemSettings))
          }}
        />

        <ConfirmDeleteModal
          open={!!deleteConfig}
          onClose={() => setDeleteConfig(null)}
          onConfirm={async () => {
            if (deleteConfig) {
              await handleDeleteConfig(deleteConfig)
            }
          }}
          configName={deleteConfig}
        />
      </div>
    </VSCodeProvider>
  )
}
