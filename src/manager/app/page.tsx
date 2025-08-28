import type { ReactNode } from 'react'
import type { ClaudeConfig, SystemSettings } from '@/config/types'
import process from 'node:process'
import HomePage from '@/components/pages/home-page'
import { ConfigManager } from '@/config/manager'

// Force dynamic rendering to access environment variables
export const dynamic = 'force-dynamic'

function getConfigs(): ClaudeConfig[] {
  try {
    const configManager = ConfigManager.getInstance()
    return configManager.listConfigs()
  }
  catch (error) {
    console.error('Error reading configs:', error)
    return []
  }
}

function getSettings(): SystemSettings {
  try {
    const configManager = ConfigManager.getInstance()
    const configFile = configManager.load()
    return configFile.settings || { overrideClaudeCommand: false }
  }
  catch (error) {
    console.error('Error reading settings:', error)
    return { overrideClaudeCommand: false }
  }
}

export default function Page(): ReactNode {
  // Server-side check for VSCode environment
  const isVSCode = process.env.VSCODE_PLUGIN === 'true'

  // Load configs and settings server-side
  const initialConfigs = getConfigs()
  const initialSettings = getSettings()

  return <HomePage isVSCode={isVSCode} initialConfigs={initialConfigs} initialSettings={initialSettings} />
}
