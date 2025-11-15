import type { CodexConfig, CodexSettings } from '@start-claude/cli/src/codex/config/types'
import type { ReactNode } from 'react'
import process from 'node:process'
import { CodexConfigManager } from '@start-claude/cli/src/codex/config/manager'
import CodexHomePage from '@/components/pages/codex-home-page'

// Force dynamic rendering to access environment variables
export const dynamic = 'force-dynamic'

async function getConfigs(): Promise<CodexConfig[]> {
  try {
    const configManager = CodexConfigManager.getInstance()
    return configManager.listConfigs()
  }
  catch (error) {
    console.error('Error reading Codex configs:', error)
    return []
  }
}

async function getSettings(): Promise<CodexSettings> {
  try {
    const configManager = CodexConfigManager.getInstance()
    return configManager.getSettings()
  }
  catch (error) {
    console.error('Error reading Codex settings:', error)
    return {
      sync: {
        enabled: false,
        provider: 'icloud',
      },
      s3Sync: {
        enabled: false,
        autoSync: false,
      },
    }
  }
}

export default async function CodexPage(): Promise<ReactNode> {
  // Server-side check for VSCode environment
  const isVSCode = process.env.VSCODE_PLUGIN === 'true'

  // Load configs and settings server-side
  const initialConfigs = await getConfigs()
  const initialSettings = await getSettings()

  return <CodexHomePage isVSCode={isVSCode} initialConfigs={initialConfigs} initialSettings={initialSettings} />
}
