'use client'

import type { ClaudeConfig, SystemSettings } from '@/config/types'
import { useState } from 'react'
import { useToast } from '@/lib/use-toast'

interface ToastTranslations {
  configSaved: string
  configSavedCreated: (name: string) => string
  configSavedUpdated: (name: string) => string
  configSaveFailed: string
  configsUpdated: string
  configsUpdatedDescription: string
  configsUpdateFailed: string
  configDeleted: string
  configDeletedDescription: (name: string) => string
  configDeleteFailed: string
  settingsSaved: string
  settingsSavedDescription: string
  settingsSaveFailed: string
}

interface UseConfigsReturn {
  configs: ClaudeConfig[]
  settings: SystemSettings
  error: string | null
  setError: (error: string | null) => void
  saveConfig: (config: ClaudeConfig, isEditing: boolean, notifyOthers?: () => void) => Promise<void>
  updateConfigs: (updatedConfigs: ClaudeConfig[], customMessage?: string, notifyOthers?: () => void) => Promise<void>
  updateConfigsOptimistically: (updatedConfigs: ClaudeConfig[]) => void
  deleteConfig: (configName: string, notifyOthers?: () => void) => Promise<void>
  saveSettings: (newSettings: SystemSettings, notifyOthers?: () => void) => Promise<void>
  refetchConfigs: () => Promise<void>
}

export function useConfigs(
  initialConfigs?: ClaudeConfig[],
  initialSettings?: SystemSettings,
  translations?: ToastTranslations,
): UseConfigsReturn {
  const { toast } = useToast()

  // Helper function to sort configs by order
  const sortConfigsByOrder = (configs: ClaudeConfig[]): ClaudeConfig[] => {
    return [...configs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  const [configs, setConfigs] = useState<ClaudeConfig[]>(sortConfigsByOrder(initialConfigs || []))
  const [settings, setSettings] = useState<SystemSettings>(initialSettings || {} as SystemSettings)
  const [error, setError] = useState<string | null>(null)

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
      setConfigs(sortConfigsByOrder(data.configs))
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

  const saveConfig = async (config: ClaudeConfig, isEditing: boolean, notifyOthers?: () => void): Promise<void> => {
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
      setConfigs(sortConfigsByOrder(data.configs))
      if (data.settings) {
        setSettings(data.settings)
      }

      toast({
        title: translations?.configSaved ?? 'Configuration saved',
        description: isEditing
          ? (translations?.configSavedUpdated(config.name) ?? `Configuration "${config.name}" has been updated successfully.`)
          : (translations?.configSavedCreated(config.name) ?? `Configuration "${config.name}" has been created successfully.`),
        variant: 'success',
      })

      // Notify other tabs about the config change
      if (notifyOthers) {
        notifyOthers()
      }
    }
    catch (error) {
      console.error('Error saving config:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save configuration'
      setError(errorMessage)

      toast({
        title: translations?.configSaveFailed ?? 'Failed to save configuration',
        description: errorMessage,
        variant: 'destructive',
      })
      throw error
    }
  }

  const updateConfigs = async (updatedConfigs: ClaudeConfig[], customMessage?: string, notifyOthers?: () => void): Promise<void> => {
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
      setConfigs(sortConfigsByOrder(data.configs))
      if (data.settings) {
        setSettings(data.settings)
      }

      toast({
        title: translations?.configsUpdated ?? 'Configurations updated',
        description: customMessage || translations?.configsUpdatedDescription || 'Configuration order has been updated successfully.',
        variant: 'success',
      })

      // Notify other tabs about the config change
      if (notifyOthers) {
        notifyOthers()
      }
    }
    catch (error) {
      console.error('Error updating configs:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update configurations'
      setError(errorMessage)

      toast({
        title: translations?.configsUpdateFailed ?? 'Failed to update configurations',
        description: errorMessage,
        variant: 'destructive',
      })
      throw error
    }
  }

  // Optimistically update configs locally without API call
  const updateConfigsOptimistically = (updatedConfigs: ClaudeConfig[]): void => {
    setConfigs(sortConfigsByOrder(updatedConfigs))
  }

  const deleteConfig = async (configName: string, notifyOthers?: () => void): Promise<void> => {
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
      setConfigs(sortConfigsByOrder(data.configs))
      if (data.settings) {
        setSettings(data.settings)
      }

      toast({
        title: translations?.configDeleted ?? 'Configuration deleted',
        description: translations?.configDeletedDescription(configName) ?? `Configuration "${configName}" has been deleted successfully.`,
        variant: 'success',
      })

      // Notify other tabs about the config change
      if (notifyOthers) {
        notifyOthers()
      }
    }
    catch (error) {
      console.error('Error deleting config:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete configuration'
      setError(errorMessage)

      toast({
        title: translations?.configDeleteFailed ?? 'Failed to delete configuration',
        description: errorMessage,
        variant: 'destructive',
      })
      throw error
    }
  }

  const saveSettings = async (newSettings: SystemSettings, notifyOthers?: () => void): Promise<void> => {
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
        title: translations?.settingsSaved ?? 'System settings saved',
        description: translations?.settingsSavedDescription ?? 'System settings have been updated successfully.',
        variant: 'success',
      })

      // Notify other tabs about the config change
      if (notifyOthers) {
        notifyOthers()
      }
    }
    catch (error) {
      console.error('Error saving system settings:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save system settings'
      setError(errorMessage)

      toast({
        title: translations?.settingsSaveFailed ?? 'Failed to save system settings',
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
    updateConfigsOptimistically,
    deleteConfig,
    saveSettings,
    refetchConfigs,
  }
}
