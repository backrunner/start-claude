'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { ClaudeConfig, SystemSettings } from '@/types/config'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertCircle, Filter, Loader2, Plus, Search, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfigForm } from '@/components/config-form'
import { ConfigList } from '@/components/config-list'
import { ConfirmDeleteModal } from '@/components/confirm-delete-modal'
import { SystemSettingsModal } from '@/components/system-settings-modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export default function HomePage(): ReactNode {
  const [configs, setConfigs] = useState<ClaudeConfig[]>([])
  const [settings, setSettings] = useState<SystemSettings>({} as SystemSettings)
  const [loading, setLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false)
  const [deleteConfig, setDeleteConfig] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showEnabledOnly, setShowEnabledOnly] = useState(true)

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

    // Add ESC key listener
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // eslint-disable-next-line no-alert
        if (confirm('Are you sure you want to close the manager?')) {
          window.close()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
    }
    catch (error) {
      console.error('Error saving config:', error)
      setError(error instanceof Error ? error.message : 'Failed to save configuration')
    }
  }

  const updateConfigs = async (updatedConfigs: ClaudeConfig[]): Promise<void> => {
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
    }
    catch (error) {
      console.error('Error updating configs:', error)
      setError(error instanceof Error ? error.message : 'Failed to update configurations')
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
    }
    catch (error) {
      console.error('Error deleting config:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete configuration')
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
    }
    catch (error) {
      console.error('Error saving system settings:', error)
      setError(error instanceof Error ? error.message : 'Failed to save system settings')
      throw error
    }
  }

  // Filter and search configs
  const filteredBySearch = configs.filter(config =>
    config.name.toLowerCase().includes(searchTerm.toLowerCase())
    || (config.baseUrl && config.baseUrl.toLowerCase().includes(searchTerm.toLowerCase())),
  )

  const enabledConfigs = showEnabledOnly
    ? filteredBySearch.filter(config => config.enabled !== false)
    : filteredBySearch

  const finalConfigs = enabledConfigs.length > 0 ? enabledConfigs : filteredBySearch

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event

    if (active.id !== over?.id && over?.id) {
      const oldIndex = finalConfigs.findIndex(config => config.name === active.id)
      const newIndex = finalConfigs.findIndex(config => config.name === over.id)

      const reorderedConfigs = arrayMove(finalConfigs, oldIndex, newIndex)
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
    void updateConfigs(updatedConfigs)
  }

  const handleSetDefault = (configName: string): void => {
    const updatedConfigs = configs.map(config => ({
      ...config,
      isDefault: config.name === configName,
    }))
    void updateConfigs(updatedConfigs)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center space-x-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-lg">Loading configurations...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto p-6 max-w-6xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                Start Claude
              </h1>
              <p className="text-muted-foreground text-lg">
                Manage your Claude configurations with ease. Press ESC to close.
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setIsSystemSettingsOpen(true)}
                className="shadow-sm hover:shadow-md transition-shadow"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="lg"
                    onClick={() => setEditingConfig(null)}
                    className="shadow-sm hover:shadow-md transition-shadow bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Configuration
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {editingConfig ? 'Edit Configuration' : 'Add Configuration'}
                    </DialogTitle>
                    <DialogDescription>
                      {editingConfig ? 'Update the configuration details.' : 'Create a new Claude configuration.'}
                    </DialogDescription>
                  </DialogHeader>
                  <ConfigForm
                    config={editingConfig}
                    onSave={(config): void => { void saveConfig(config) }}
                    onCancel={() => {
                      setIsFormOpen(false)
                      setEditingConfig(null)
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Search and Filter Section */}
          <Card className="shadow-sm border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search configurations..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10 border-0 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Button
                  variant={showEnabledOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowEnabledOnly(!showEnabledOnly)}
                  className="shrink-0"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  {showEnabledOnly ? 'Enabled Only' : 'Show All'}
                </Button>
                <div className="text-sm text-muted-foreground shrink-0">
                  {finalConfigs.length}
                  {' '}
                  of
                  {configs.length}
                  {' '}
                  configs
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        {finalConfigs.length === 0 && searchTerm
          ? (
              <Card className="shadow-sm border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <CardContent className="text-center py-12">
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground mb-2">
                    No configurations found
                  </h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search terms or filters
                  </p>
                </CardContent>
              </Card>
            )
          : finalConfigs.length === 0
            ? (
                <Card className="shadow-sm border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                  <CardHeader className="text-center pb-4">
                    <div className="w-16 h-16 bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900 dark:to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Plus className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <CardTitle className="text-xl">No Configurations Yet</CardTitle>
                    <CardDescription className="text-base">
                      Get started by creating your first Claude configuration
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center pb-8">
                    <Button
                      onClick={() => setIsFormOpen(true)}
                      size="lg"
                      className="shadow-sm hover:shadow-md transition-shadow bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Configuration
                    </Button>
                  </CardContent>
                </Card>
              )
            : (
                <div className="space-y-4">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis]}
                  >
                    <SortableContext items={finalConfigs.map(c => c.name)} strategy={verticalListSortingStrategy}>
                      <ConfigList
                        configs={finalConfigs}
                        onEdit={handleEdit}
                        onDelete={handleDeleteClick}
                        onToggleEnabled={handleToggleEnabled}
                        onSetDefault={handleSetDefault}
                      />
                    </SortableContext>
                  </DndContext>
                </div>
              )}

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
