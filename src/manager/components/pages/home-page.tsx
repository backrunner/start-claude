'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { ClaudeConfig } from '@/config/types'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfigFormModal } from '@/components/config/config-form-modal'
import { ConfigList } from '@/components/config/config-list'
import { ConfirmDeleteModal } from '@/components/config/confirm-delete-modal'
import { EmptyState } from '@/components/layout/empty-state'
import { Header } from '@/components/layout/header'
import { SearchBar } from '@/components/layout/search-bar'
import { SystemSettingsModal } from '@/components/settings/system-settings-modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VSCodeProvider } from '@/context/vscode-context'
import { useConfigs } from '@/hooks/use-configs'
import { useShutdownCoordinator } from '@/hooks/use-shutdown-coordinator'
import { useWebSocket } from '@/hooks/use-websocket'

interface HomePageProps {
  isVSCode: boolean
}

export default function HomePage({ isVSCode }: HomePageProps): ReactNode {
  const {
    configs,
    settings,
    loading,
    error,
    fetchConfigs,
    saveConfig,
    updateConfigs,
    deleteConfig: deleteConfigAPI,
    saveSettings,
  } = useConfigs()

  const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false)
  const [deleteConfig, setDeleteConfig] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const shutdownCoordinator = useShutdownCoordinator()
  useWebSocket()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    void fetchConfigs()
  }, [])

  const handleSaveConfig = async (config: ClaudeConfig): Promise<void> => {
    await saveConfig(config, !!editingConfig)
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

    await deleteConfigAPI(deleteConfig)
    setDeleteConfig(null)
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
        order: index + 1,
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
      <VSCodeProvider isVSCode={isVSCode}>
        <div className="min-h-screen bg-background">
          <div className="container mx-auto p-6">
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <div>
                  <p className="text-lg font-medium">Loading configurations...</p>
                  <p className="text-sm text-muted-foreground">Please wait while we fetch your Claude settings</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </VSCodeProvider>
    )
  }

  return (
    <VSCodeProvider isVSCode={isVSCode}>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-3 max-w-none sm:max-w-7xl sm:p-6">
          {/* Header Section */}
          <div className="mb-4 sm:mb-8">
            <Header
              isVSCode={isVSCode}
              shutdownCoordinator={shutdownCoordinator}
              onAddConfig={() => {
                setEditingConfig(null)
                setIsFormOpen(true)
              }}
              onOpenSettings={() => setIsSystemSettingsOpen(true)}
            />

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="mb-4 sm:mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Main Content */}
          <div className="space-y-4 sm:space-y-6">
            {/* Search Bar */}
            <SearchBar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              isVSCode={isVSCode}
            />

            {/* Configuration List */}
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
            onSave={saveSettings}
          />

          <ConfirmDeleteModal
            open={!!deleteConfig}
            onClose={() => setDeleteConfig(null)}
            configName={deleteConfig}
            onConfirm={handleDeleteConfirm}
          />
        </div>
      </div>
    </VSCodeProvider>
  )
}
