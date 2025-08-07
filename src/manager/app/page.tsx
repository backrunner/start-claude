'use client'

import { useEffect, useState } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { ConfigList } from '@/components/config-list'
import { ConfigForm } from '@/components/config-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import { ClaudeConfig } from '@/types/config'

export default function HomePage() {
  const [configs, setConfigs] = useState<ClaudeConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    fetchConfigs()
    
    // Add ESC key listener
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (window.confirm('Are you sure you want to close the manager?')) {
          window.close()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/configs')
      const data = await response.json()
      setConfigs(data.configs || [])
    } catch (error) {
      console.error('Error fetching configs:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async (config: ClaudeConfig) => {
    try {
      const response = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      
      if (response.ok) {
        await fetchConfigs()
        setIsFormOpen(false)
        setEditingConfig(null)
      }
    } catch (error) {
      console.error('Error saving config:', error)
    }
  }

  const updateConfigs = async (updatedConfigs: ClaudeConfig[]) => {
    try {
      const response = await fetch('/api/configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: updatedConfigs }),
      })
      
      if (response.ok) {
        setConfigs(updatedConfigs)
      }
    } catch (error) {
      console.error('Error updating configs:', error)
    }
  }

  const deleteConfig = async (name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/configs?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        await fetchConfigs()
      }
    } catch (error) {
      console.error('Error deleting config:', error)
    }
  }

  const handleDragEnd = (event: any) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      const oldIndex = configs.findIndex(config => config.name === active.id)
      const newIndex = configs.findIndex(config => config.name === over.id)
      
      const reorderedConfigs = arrayMove(configs, oldIndex, newIndex)
      const updatedConfigs = reorderedConfigs.map((config, index) => ({
        ...config,
        order: index
      }))
      
      updateConfigs(updatedConfigs)
    }
  }

  const handleEdit = (config: ClaudeConfig) => {
    setEditingConfig(config)
    setIsFormOpen(true)
  }

  const handleToggleEnabled = (configName: string, enabled: boolean) => {
    const updatedConfigs = configs.map(config =>
      config.name === configName ? { ...config, enabled } : config
    )
    updateConfigs(updatedConfigs)
  }

  const handleSetDefault = (configName: string) => {
    const updatedConfigs = configs.map(config => ({
      ...config,
      isDefault: config.name === configName
    }))
    updateConfigs(updatedConfigs)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading configurations...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Claude Configuration Manager</h1>
          <p className="text-muted-foreground mt-2">
            Manage your Claude configurations. Press ESC to close this manager.
          </p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingConfig(null)}>
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
              onSave={saveConfig}
              onCancel={() => {
                setIsFormOpen(false)
                setEditingConfig(null)
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {configs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Configurations</CardTitle>
            <CardDescription>
              You haven't created any Claude configurations yet. Click "Add Configuration" to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Configuration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={configs.map(c => c.name)} strategy={verticalListSortingStrategy}>
            <ConfigList
              configs={configs}
              onEdit={handleEdit}
              onDelete={deleteConfig}
              onToggleEnabled={handleToggleEnabled}
              onSetDefault={handleSetDefault}
            />
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}