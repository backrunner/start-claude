'use client'

import type { ClaudeConfig, SystemSettings } from '@/config/types'
import { useState } from 'react'
import { useToast } from '@/lib/use-toast'

interface UseConfigsReturn {
  configs: ClaudeConfig[]
  settings: SystemSettings
  error: string | null
  setError: (error: string | null) => void
  saveConfig: (config: ClaudeConfig, isEditing: boolean) => Promise<void>
  updateConfigs: (updatedConfigs: ClaudeConfig[], customMessage?: string) => Promise<void>
  deleteConfig: (configName: string) => Promise<void>
  saveSettings: (newSettings: SystemSettings) => Promise<void>
  updateConfigsAndSettings: (newConfigs: ClaudeConfig[], newSettings: SystemSettings) => void
  refetchConfigs: () => Promise<void>
}

export function useConfigs(initialConfigs?: ClaudeConfig[], initialSettings?: SystemSettings): UseConfigsReturn {
  const { toast } = useToast()
  const [configs, setConfigs] = useState<ClaudeConfig[]>(initialConfigs || [])
  const [settings, setSettings] = useState<SystemSettings>(initialSettings || {} as SystemSettings)
  const [error, setError] = useState<string | null>(null)

  // Function to update configs and settings (for WebSocket updates)
  // WebSocket updates should always take precedence over optimistic updates
  const updateConfigsAndSettings = (newConfigs: ClaudeConfig[], newSettings: SystemSettings): void => {
    console.log('[useConfigs] Applying WebSocket update')
    setConfigs(newConfigs)
    setSettings(newSettings)
  }

  // Function to refetch configs from the server
  const refetchConfigs = async (): Promise<void> => {
    try {
      const response = await fetch('/api/configs', {
        method: 'GET',
        cache: 'no-cache',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch configs')
      }

      const data = await response.json()
      setConfigs(data.configs)
      if (data.settings) {
        setSettings(data.settings)
      }
    }
    catch (error) {
      console.error('Error refetching configs:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch configurations'
      setError(errorMessage)
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

      const data = await response.json()

      // Update configs with the response data immediately
      setConfigs(data.configs)
      if (data.settings) {
        setSettings(data.settings)
      }

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

      const data = await response.json()

      // Update configs with the response data immediately
      setConfigs(data.configs)
      if (data.settings) {
        setSettings(data.settings)
      }

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

      const data = await response.json()

      // Update configs with the response data immediately
      setConfigs(data.configs)
      if (data.settings) {
        setSettings(data.settings)
      }

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
    error,
    setError,
    saveConfig,
    updateConfigs,
    deleteConfig,
    saveSettings,
    updateConfigsAndSettings, // Export for WebSocket updates
    refetchConfigs,
  }
}
