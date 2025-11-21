import type { ClaudeConfig, SystemSettings } from '@start-claude/cli/src/config/types'
import type { ReactNode } from 'react'
import process from 'node:process'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { S3ConfigFileManager } from '@start-claude/cli/src/config/s3-config'
import { LoadBalancerStrategy, SpeedTestStrategy } from '@start-claude/cli/src/config/types'
import HomePage from '@/components/pages/home-page'

// Force dynamic rendering to access environment variables
export const dynamic = 'force-dynamic'

async function getConfigs(): Promise<ClaudeConfig[]> {
  try {
    const configManager = ConfigManager.getInstance()
    const configFile = await configManager.load()
    // Filter out deleted configs (isDeleted: true)
    return (configFile.configs || []).filter(c => !c.isDeleted)
  }
  catch (error) {
    console.error('Error reading configs:', error)
    return []
  }
}

async function getSettings(): Promise<SystemSettings> {
  try {
    const configManager = ConfigManager.getInstance()
    const s3ConfigManager = S3ConfigFileManager.getInstance()

    const configFile = await configManager.load()
    const settings = configFile.settings || { overrideClaudeCommand: false }

    // Ensure balanceMode structure exists with defaults
    if (!settings.balanceMode) {
      settings.balanceMode = {
        enableByDefault: false,
        strategy: LoadBalancerStrategy.Fallback,
        healthCheck: {
          enabled: true,
          intervalMs: 30000,
        },
        failedEndpoint: {
          banDurationSeconds: 300,
        },
        speedFirst: {
          responseTimeWindowMs: 300000,
          minSamples: 2,
          speedTestIntervalSeconds: 300,
          speedTestStrategy: SpeedTestStrategy.ResponseTime,
        },
      }
    }

    // Load S3 config from s3-config.json only (no backward compatibility)
    console.log('[Page SSR] Loading S3 config...')
    let s3Sync
    try {
      const s3ConfigFile = s3ConfigManager.load()
      if (s3ConfigFile) {
        s3Sync = s3ConfigFile.s3Config
        console.log('[Page SSR] S3 config loaded from s3-config.json')
      }
    }
    catch (loadError) {
      console.error('[Page SSR] Error loading S3 config:', loadError)
    }

    return {
      ...settings,
      s3Sync: s3Sync || undefined,
    }
  }
  catch (error) {
    console.error('Error reading settings:', error)
    return {
      overrideClaudeCommand: false,
      balanceMode: {
        enableByDefault: false,
        strategy: LoadBalancerStrategy.Fallback,
        healthCheck: {
          enabled: true,
          intervalMs: 30000,
        },
        failedEndpoint: {
          banDurationSeconds: 300,
        },
        speedFirst: {
          responseTimeWindowMs: 300000,
          minSamples: 2,
          speedTestIntervalSeconds: 300,
          speedTestStrategy: SpeedTestStrategy.ResponseTime,
        },
      },
      s3Sync: undefined,
    }
  }
}

export default async function Page(): Promise<ReactNode> {
  // Server-side check for VSCode environment
  const isVSCode = process.env.VSCODE_PLUGIN === 'true'

  // Load configs and settings server-side
  const initialConfigs = await getConfigs()
  const initialSettings = await getSettings()

  return <HomePage isVSCode={isVSCode} initialConfigs={initialConfigs} initialSettings={initialSettings} />
}
