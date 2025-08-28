'use client'

import type { ClaudeConfig, SystemSettings } from '@/config/types'
import { useState } from 'react'
import { useToast } from '@/lib/use-toast'

export function useConfigs() {
  const { toast } = useToast()
  const [configs, setConfigs] = useState<ClaudeConfig[]>([])
  const [settings, setSettings] = useState<SystemSettings>({} as SystemSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const saveConfig = async (config: ClaudeConfig, isEditing: boolean): Promise<void> => {
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

      toast({
        title: 'Configuration saved',
        description: `Configuration "${config.name}" has been ${isEditing ? 'updated' : 'created'} successfully.`,
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
      throw error
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
      throw error
    }
  }

  const deleteConfig = async (configName: string): Promise<void> => {
    try {
      const response = await fetch(`/api/configs?name=${encodeURIComponent(configName)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete config')
      }

      await fetchConfigs()

      toast({
        title: 'Configuration deleted',
        description: `Configuration "${configName}" has been deleted successfully.`,
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
      throw error
    }
  }

  const saveSettings = async (newSettings: SystemSettings): Promise<void> => {
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

  return {
    configs,
    settings,
    loading,
    error,
    setError,
    fetchConfigs,
    saveConfig,
    updateConfigs,
    deleteConfig,
    saveSettings,
  }
}