'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { ClaudeConfig, SystemSettings } from '@/config/types'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertCircle, Filter, Loader2, Plus, Search, Settings, Sparkles, Command } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfigForm } from '@/components/config-form'
import { ConfigList } from '@/components/config-list'
import { ConfirmDeleteModal } from '@/components/confirm-delete-modal'
import { SystemSettingsModal } from '@/components/system-settings-modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-muted-foreground">
                    Manage your Claude configurations with ease
                  </p>
                  <Badge variant="outline" className="text-xs">
                    <Command className="h-3 w-3 mr-1" />
                    ESC to close
                  </Badge>
                </div>
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
              <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => setEditingConfig(null)}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Configuration
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                  <DialogHeader className="sr-only">
                    <DialogTitle>Configuration</DialogTitle>
                    <DialogDescription>Manage Claude configuration</DialogDescription>
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
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search configurations..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant={showEnabledOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowEnabledOnly(!showEnabledOnly)}
                  className="shrink-0"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  {showEnabledOnly ? 'Active Only' : 'Show All'}
                </Button>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {finalConfigs.length} of {configs.length}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        {finalConfigs.length === 0 && searchTerm ? (
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
        ) : finalConfigs.length === 0 ? (
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
        ) : (
          <div className="space-y-6">
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
