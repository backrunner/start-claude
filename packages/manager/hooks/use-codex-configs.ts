import type { CodexConfig, CodexSettings } from '@start-claude/cli/src/codex/config/types'
import { useCallback, useEffect, useState } from 'react'

interface UseCodexConfigsReturn {
  configs: CodexConfig[]
  settings: CodexSettings
  error: string | null
  saveConfig: (config: CodexConfig) => Promise<void>
  updateConfigs: (configs: CodexConfig[]) => Promise<void>
  updateConfigsOptimistically: (configs: CodexConfig[]) => void
  deleteConfig: (name: string) => Promise<void>
  saveSettings: (settings: Partial<CodexSettings>) => Promise<void>
  refetchConfigs: () => Promise<void>
}

export function useCodexConfigs(
  initialConfigs: CodexConfig[],
  initialSettings: CodexSettings,
): UseCodexConfigsReturn {
  const [configs, setConfigs] = useState<CodexConfig[]>(initialConfigs)
  const [settings, setSettings] = useState<CodexSettings>(initialSettings)
  const [error, setError] = useState<string | null>(null)

  const refetchConfigs = useCallback(async () => {
    try {
      const response = await fetch('/api/codex')
      if (!response.ok) {
        throw new Error('Failed to fetch Codex configs')
      }

      const data = await response.json()
      setConfigs(data.configs || [])
      setSettings(data.settings || initialSettings)
      setError(null)
    }
    catch (err) {
      console.error('Error fetching Codex configs:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch configs')
    }
  }, [initialSettings])

  const saveConfig = useCallback(async (config: CodexConfig) => {
    try {
      const response = await fetch('/api/codex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save Codex config')
      }

      const data = await response.json()
      setConfigs(data.configs || [])
      setSettings(data.settings || settings)
      setError(null)
    }
    catch (err) {
      console.error('Error saving Codex config:', err)
      setError(err instanceof Error ? err.message : 'Failed to save config')
      throw err
    }
  }, [settings])

  const updateConfigs = useCallback(async (newConfigs: CodexConfig[]) => {
    try {
      const response = await fetch('/api/codex', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configs: newConfigs }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update Codex configs')
      }

      const data = await response.json()
      setConfigs(data.configs || [])
      setSettings(data.settings || settings)
      setError(null)
    }
    catch (err) {
      console.error('Error updating Codex configs:', err)
      setError(err instanceof Error ? err.message : 'Failed to update configs')
      throw err
    }
  }, [settings])

  const updateConfigsOptimistically = useCallback((newConfigs: CodexConfig[]) => {
    setConfigs(newConfigs)
  }, [])

  const deleteConfig = useCallback(async (name: string) => {
    try {
      const response = await fetch(`/api/codex?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete Codex config')
      }

      const data = await response.json()
      setConfigs(data.configs || [])
      setSettings(data.settings || settings)
      setError(null)
    }
    catch (err) {
      console.error('Error deleting Codex config:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete config')
      throw err
    }
  }, [settings])

  const saveSettings = useCallback(async (newSettings: Partial<CodexSettings>) => {
    try {
      const response = await fetch('/api/codex/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: newSettings }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save Codex settings')
      }

      const data = await response.json()
      setSettings(data.settings || settings)
      setError(null)
    }
    catch (err) {
      console.error('Error saving Codex settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to save settings')
      throw err
    }
  }, [settings])

  return {
    configs,
    settings,
    error,
    saveConfig,
    updateConfigs,
    updateConfigsOptimistically,
    deleteConfig,
    saveSettings,
    refetchConfigs,
  }
}
