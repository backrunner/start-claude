'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import type { ExternalProductConfig, ExternalProductDefinition, ExternalProductSettings } from '@start-claude/cli/src/products/types'
import type { ReactNode } from 'react'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { ConfirmDeleteModal } from '@/components/config/confirm-delete-modal'
import { EmptyState } from '@/components/layout/empty-state'
import { Header } from '@/components/layout/header'
import { SearchBar } from '@/components/layout/search-bar'
import { ProductFormModal } from '@/components/products/product-form-modal'
import { ProductList } from '@/components/products/product-list'
import { ProductSettingsModal } from '@/components/products/product-settings-modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VSCodeProvider } from '@/context/vscode-context'
import { useBroadcastChannel } from '@/hooks/use-broadcast-channel'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { useProductConfigs } from '@/hooks/use-product-configs'
import { useShutdownCoordinator } from '@/hooks/use-shutdown-coordinator'

interface ProductHomePageProps {
  isVSCode: boolean
  product: ExternalProductDefinition
  initialConfigs: ExternalProductConfig[]
  initialSettings: ExternalProductSettings
}

export default function ProductHomePage({
  isVSCode,
  product,
  initialConfigs,
  initialSettings,
}: ProductHomePageProps): ReactNode {
  const t = useTranslations('toast')
  const productT = useTranslations('products')

  const toastTranslations = {
    configFetchFailedDescription: t('configFetchFailedDescription'),
    configSaved: t('configSaved'),
    configSavedCreated: (name: string) => t('configSavedCreated', { name }),
    configSavedUpdated: (name: string) => t('configSavedUpdated', { name }),
    configSaveFailed: t('configSaveFailed'),
    configSaveFailedDescription: t('configSaveFailedDescription'),
    configsUpdated: t('configsUpdated'),
    configsUpdatedDescription: t('configsUpdatedDescription'),
    configsUpdateFailed: t('configsUpdateFailed'),
    configsUpdateFailedDescription: t('configsUpdateFailedDescription'),
    configDeleted: t('configDeleted'),
    configDeletedDescription: (name: string) => t('configDeletedDescription', { name }),
    configDeleteFailed: t('configDeleteFailed'),
    configDeleteFailedDescription: t('configDeleteFailedDescription'),
    settingsSaved: t('settingsSaved'),
    settingsSavedDescription: t('settingsSavedDescription'),
    settingsSaveFailed: t('settingsSaveFailed'),
    settingsSaveFailedDescription: t('settingsSaveFailedDescription'),
  }

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
  } = useProductConfigs(product.id, initialConfigs, initialSettings, toastTranslations)

  const [editingConfig, setEditingConfig] = useState<ExternalProductConfig | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [deleteConfig, setDeleteConfig] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const dragOperationInProgress = useRef(false)
  const { shutdownCoordinator } = useShutdownCoordinator()

  const { notifyConfigChange } = useBroadcastChannel({
    onConfigChange: () => {
      void refetchConfigs()
    },
    onShutdown: () => {
      window.close()
    },
  })

  useHeartbeat({
    intervalMs: 3000,
    maxFailures: 3,
    timeoutMs: 2000,
    startupDelayMs: 5000,
    onConnectionLost: () => {
      void (async () => {
        if (shutdownCoordinator) {
          await shutdownCoordinator.callShutdownIfLastTab()
        }
        setTimeout(() => window.close(), 500)
      })()
    },
    enabled: !isVSCode,
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const filteredConfigs = configs.filter(config =>
    config.name.toLowerCase().includes(searchTerm.toLowerCase())
    || (config.baseUrl && config.baseUrl.toLowerCase().includes(searchTerm.toLowerCase()))
    || (config.model && config.model.toLowerCase().includes(searchTerm.toLowerCase())),
  )
  const isSearchActive = searchTerm.trim().length > 0
  const dragDisabled = isDragging || isSearchActive

  const handleSaveConfig = async (config: ExternalProductConfig): Promise<void> => {
    await saveConfig(config, !!editingConfig, notifyConfigChange)
    setIsFormOpen(false)
    setEditingConfig(null)
  }

  const handleDuplicate = async (config: ExternalProductConfig): Promise<void> => {
    const newName = generateDuplicateName(config.name, configs)
    const { id, isDefault, order, ...configWithoutUniqueFields } = config
    await saveConfig({
      ...configWithoutUniqueFields,
      name: newName,
      isDefault: false,
      enabled: true,
    }, false, notifyConfigChange)
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteConfig) {
      return
    }
    await deleteConfigAPI(deleteConfig, notifyConfigChange)
    setDeleteConfig(null)
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event

    if (dragOperationInProgress.current) {
      return
    }

    if (active.id !== over?.id && over?.id) {
      const oldIndex = configs.findIndex(config => (config.id || config.name) === active.id)
      const newIndex = configs.findIndex(config => (config.id || config.name) === over.id)

      if (oldIndex === -1 || newIndex === -1) {
        return
      }

      dragOperationInProgress.current = true
      setIsDragging(true)

      const originalConfigs = [...configs]
      const reorderedConfigs = arrayMove(configs, oldIndex, newIndex).map((config, index) => ({
        ...config,
        order: index + 1,
      }))

      updateConfigsOptimistically(reorderedConfigs)

      void (async () => {
        try {
          await updateConfigs(reorderedConfigs, undefined, notifyConfigChange)
        }
        catch {
          updateConfigsOptimistically(originalConfigs)
        }
        finally {
          dragOperationInProgress.current = false
          setIsDragging(false)
        }
      })()
    }
  }

  const handleToggleEnabled = (configName: string, enabled: boolean): void => {
    const updatedConfigs = configs.map(config =>
      config.name === configName ? { ...config, enabled } : config,
    )
    void updateConfigs(updatedConfigs, enabled ? t('configEnabled', { configName }) : t('configDisabled', { configName }), notifyConfigChange)
  }

  const handleSetDefault = (configName: string): void => {
    const updatedConfigs = configs.map(config => ({
      ...config,
      isDefault: config.name === configName,
    }))
    void updateConfigs(updatedConfigs, t('configSetDefault', { configName }), notifyConfigChange)
  }

  return (
    <VSCodeProvider isVSCode={isVSCode}>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 sm:py-8 max-w-6xl">
          <Header
            title={product.title}
            subtitle={productT(`${product.id}.subtitle`)}
            mode={product.id}
            isVSCode={isVSCode}
            shutdownCoordinator={shutdownCoordinator}
            onAddConfig={() => {
              setEditingConfig(null)
              setIsFormOpen(true)
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />

          {error && (
            <Alert variant="destructive" className="mt-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
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
                      title={productT(`${product.id}.emptyTitle`)}
                      description={productT(`${product.id}.emptyDescription`)}
                      createButton={productT(`${product.id}.createButton`)}
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
                        items={filteredConfigs.map(config => config.id || config.name)}
                        strategy={verticalListSortingStrategy}
                        disabled={dragDisabled}
                      >
                        <ProductList
                          product={product}
                          configs={filteredConfigs}
                          dragDisabled={dragDisabled}
                          onEdit={(config) => {
                            setEditingConfig(config)
                            setIsFormOpen(true)
                          }}
                          onDelete={setDeleteConfig}
                          onToggleEnabled={handleToggleEnabled}
                          onSetDefault={handleSetDefault}
                          onDuplicate={handleDuplicate}
                        />
                      </SortableContext>
                    </DndContext>
                  )}
          </div>

          <ProductFormModal
            open={isFormOpen}
            onOpenChange={setIsFormOpen}
            product={product}
            config={editingConfig}
            onSave={handleSaveConfig}
            onCancel={() => {
              setIsFormOpen(false)
              setEditingConfig(null)
            }}
          />

          <ConfirmDeleteModal
            open={!!deleteConfig}
            onClose={() => setDeleteConfig(null)}
            configName={deleteConfig}
            onConfirm={handleDeleteConfirm}
          />

          <ProductSettingsModal
            open={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            product={product}
            settings={settings}
            onSave={async newSettings => saveSettings(newSettings, notifyConfigChange)}
          />
        </div>
      </div>
    </VSCodeProvider>
  )
}

function generateDuplicateName(baseName: string, configs: ExternalProductConfig[]): string {
  const match = baseName.match(/^(.*?)(-(\d+))?$/)
  const base = match?.[1] || baseName
  const existingNum = match?.[3] ? Number.parseInt(match[3], 10) : 1
  let num = existingNum + 1
  let newName = `${base}-${num}`

  while (configs.some(config => config.name === newName)) {
    num += 1
    newName = `${base}-${num}`
  }

  return newName
}
