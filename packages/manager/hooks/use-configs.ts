'use client'

import type { ClaudeConfig, SystemSettings } from '@/config/types'
import { useState } from 'react'
import { useToast } from '@/lib/use-toast'

interface ToastTranslations {
  configFetchFailedDescription: string
  configSaved: string
  configSavedCreated: (name: string) => string
  configSavedUpdated: (name: string) => string
  configSaveFailed: string
  configSaveFailedDescription: string
  configsUpdated: string
  configsUpdatedDescription: string
  configsUpdateFailed: string
  configsUpdateFailedDescription: string
  configDeleted: string
  configDeletedDescription: (name: string) => string
  configDeleteFailed: string
  configDeleteFailedDescription: string
  settingsSaved: string
  settingsSavedDescription: string
  settingsSaveFailed: string
  settingsSaveFailedDescription: string
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
  initialConfigs: ClaudeConfig[],
  initialSettings: SystemSettings,
  translations: ToastTranslations,
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
        throw new Error(errorData.error || translations.configFetchFailedDescription)
      }

      const data = await response.json()
      setConfigs(sortConfigsByOrder(data.configs))
      if (data.settings) {
        setSettings(data.settings)
      }
    }
    catch (error) {
      console.error('Error refetching configs:', error)
      const errorMessage = error instanceof Error ? error.message : translations.configFetchFailedDescription
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
        throw new Error(errorData.error || translations.configSaveFailedDescription)
      }

      const data = await response.json()

      // Update configs with the response data immediately
      setConfigs(sortConfigsByOrder(data.configs))
      if (data.settings) {
        setSettings(data.settings)
      }

      toast({
        title: translations.configSaved,
        description: isEditing
          ? translations.configSavedUpdated(config.name)
          : translations.configSavedCreated(config.name),
        variant: 'success',
      })

      // Notify other tabs about the config change
      if (notifyOthers) {
        notifyOthers()
      }
    }
    catch (error) {
      console.error('Error saving config:', error)
      const errorMessage = error instanceof Error ? error.message : translations.configSaveFailedDescription
      setError(errorMessage)

      toast({
        title: translations.configSaveFailed,
        description: translations.configSaveFailedDescription,
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
        throw new Error(errorData.error || translations.configsUpdateFailedDescription)
      }

      const data = await response.json()

      // Update configs with the response data immediately
      setConfigs(sortConfigsByOrder(data.configs))
      if (data.settings) {
        setSettings(data.settings)
      }

      toast({
        title: translations.configsUpdated,
        description: customMessage || translations.configsUpdatedDescription,
        variant: 'success',
      })

      // Notify other tabs about the config change
      if (notifyOthers) {
        notifyOthers()
      }
    }
    catch (error) {
      console.error('Error updating configs:', error)
      const errorMessage = error instanceof Error ? error.message : translations.configsUpdateFailedDescription
      setError(errorMessage)

      toast({
        title: translations.configsUpdateFailed,
        description: translations.configsUpdateFailedDescription,
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
        throw new Error(errorData.error || translations.configDeleteFailedDescription)
      }

      const data = await response.json()

      // Update configs with the response data immediately
      setConfigs(sortConfigsByOrder(data.configs))
      if (data.settings) {
        setSettings(data.settings)
      }

      toast({
        title: translations.configDeleted,
        description: translations.configDeletedDescription(configName),
        variant: 'success',
      })

      // Notify other tabs about the config change
      if (notifyOthers) {
        notifyOthers()
      }
    }
    catch (error) {
      console.error('Error deleting config:', error)
      const errorMessage = error instanceof Error ? error.message : translations.configDeleteFailedDescription
      setError(errorMessage)

      toast({
        title: translations.configDeleteFailed,
        description: translations.configDeleteFailedDescription,
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
        throw new Error(errorData.error || translations.settingsSaveFailedDescription)
      }

      const data = await response.json()
      setSettings(data.settings)

      toast({
        title: translations.settingsSaved,
        description: translations.settingsSavedDescription,
        variant: 'success',
      })

      // Notify other tabs about the config change
      if (notifyOthers) {
        notifyOthers()
      }
    }
    catch (error) {
      console.error('Error saving system settings:', error)
      const errorMessage = error instanceof Error ? error.message : translations.settingsSaveFailedDescription
      setError(errorMessage)

      toast({
        title: translations.settingsSaveFailed,
        description: translations.settingsSaveFailedDescription,
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
