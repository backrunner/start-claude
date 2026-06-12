'use client'

import type { ExternalProductConfig, ExternalProductId, ExternalProductSettings } from '@start-claude/cli/src/products/types'
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

interface UseProductConfigsReturn {
  configs: ExternalProductConfig[]
  settings: ExternalProductSettings
  error: string | null
  setError: (error: string | null) => void
  saveConfig: (config: ExternalProductConfig, isEditing: boolean, notifyOthers?: () => void) => Promise<void>
  updateConfigs: (updatedConfigs: ExternalProductConfig[], customMessage?: string, notifyOthers?: () => void) => Promise<void>
  updateConfigsOptimistically: (updatedConfigs: ExternalProductConfig[]) => void
  deleteConfig: (configName: string, notifyOthers?: () => void) => Promise<void>
  saveSettings: (newSettings: ExternalProductSettings, notifyOthers?: () => void) => Promise<void>
  refetchConfigs: () => Promise<void>
}

export function useProductConfigs(
  productId: ExternalProductId,
  initialConfigs: ExternalProductConfig[],
  initialSettings: ExternalProductSettings,
  translations: ToastTranslations,
): UseProductConfigsReturn {
  const { toast } = useToast()
  const sortConfigsByOrder = (configs: ExternalProductConfig[]): ExternalProductConfig[] => {
    return [...configs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  const [configs, setConfigs] = useState<ExternalProductConfig[]>(sortConfigsByOrder(initialConfigs || []))
  const [settings, setSettings] = useState<ExternalProductSettings>(initialSettings || {})
  const [error, setError] = useState<string | null>(null)

  const apiBase = `/api/products/${productId}`

  const refetchConfigs = async (): Promise<void> => {
    try {
      const response = await fetch(apiBase, {
        method: 'GET',
        cache: 'no-cache',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || translations.configFetchFailedDescription)
      }

      const data = await response.json()
      setConfigs(sortConfigsByOrder(data.configs || []))
      if (data.settings) {
        setSettings(data.settings)
      }
      setError(null)
    }
    catch (error) {
      console.error('Error refetching product configs:', error)
      setError(error instanceof Error ? error.message : translations.configFetchFailedDescription)
    }
  }

  const saveConfig = async (config: ExternalProductConfig, isEditing: boolean, notifyOthers?: () => void): Promise<void> => {
    try {
      const response = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || translations.configSaveFailedDescription)
      }

      const data = await response.json()
      setConfigs(sortConfigsByOrder(data.configs || []))
      if (data.settings) {
        setSettings(data.settings)
      }
      setError(null)

      toast({
        title: translations.configSaved,
        description: isEditing
          ? translations.configSavedUpdated(config.name)
          : translations.configSavedCreated(config.name),
        variant: 'success',
      })

      notifyOthers?.()
    }
    catch (error) {
      console.error('Error saving product config:', error)
      setError(error instanceof Error ? error.message : translations.configSaveFailedDescription)
      toast({
        title: translations.configSaveFailed,
        description: translations.configSaveFailedDescription,
        variant: 'destructive',
      })
      throw error
    }
  }

  const updateConfigs = async (updatedConfigs: ExternalProductConfig[], customMessage?: string, notifyOthers?: () => void): Promise<void> => {
    try {
      const response = await fetch(apiBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: updatedConfigs }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || translations.configsUpdateFailedDescription)
      }

      const data = await response.json()
      setConfigs(sortConfigsByOrder(data.configs || []))
      if (data.settings) {
        setSettings(data.settings)
      }
      setError(null)

      toast({
        title: translations.configsUpdated,
        description: customMessage || translations.configsUpdatedDescription,
        variant: 'success',
      })

      notifyOthers?.()
    }
    catch (error) {
      console.error('Error updating product configs:', error)
      setError(error instanceof Error ? error.message : translations.configsUpdateFailedDescription)
      toast({
        title: translations.configsUpdateFailed,
        description: translations.configsUpdateFailedDescription,
        variant: 'destructive',
      })
      throw error
    }
  }

  const updateConfigsOptimistically = (updatedConfigs: ExternalProductConfig[]): void => {
    setConfigs(sortConfigsByOrder(updatedConfigs))
  }

  const deleteConfig = async (configName: string, notifyOthers?: () => void): Promise<void> => {
    try {
      const response = await fetch(`${apiBase}?name=${encodeURIComponent(configName)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || translations.configDeleteFailedDescription)
      }

      const data = await response.json()
      setConfigs(sortConfigsByOrder(data.configs || []))
      if (data.settings) {
        setSettings(data.settings)
      }
      setError(null)

      toast({
        title: translations.configDeleted,
        description: translations.configDeletedDescription(configName),
        variant: 'success',
      })

      notifyOthers?.()
    }
    catch (error) {
      console.error('Error deleting product config:', error)
      setError(error instanceof Error ? error.message : translations.configDeleteFailedDescription)
      toast({
        title: translations.configDeleteFailed,
        description: translations.configDeleteFailedDescription,
        variant: 'destructive',
      })
      throw error
    }
  }

  const saveSettings = async (newSettings: ExternalProductSettings, notifyOthers?: () => void): Promise<void> => {
    try {
      const response = await fetch(`${apiBase}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || translations.settingsSaveFailedDescription)
      }

      const data = await response.json()
      setSettings(data.settings || {})
      setError(null)

      toast({
        title: translations.settingsSaved,
        description: translations.settingsSavedDescription,
        variant: 'success',
      })

      notifyOthers?.()
    }
    catch (error) {
      console.error('Error saving product settings:', error)
      setError(error instanceof Error ? error.message : translations.settingsSaveFailedDescription)
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
