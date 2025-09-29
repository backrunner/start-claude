import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { LoadBalancerStrategy, SpeedTestStrategy } from '@/config/types'
import { settingsUpdateRequestSchema, systemSettingsSchema } from '@/lib/validation'
import { ConfigManager } from '@start-claude/cli/src/config/manager'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Initialize the ConfigManager instance
const configManager = ConfigManager.getInstance()

async function getSettings(): Promise<any> {
  try {
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

    return settings
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
    }
  }
}

async function saveSettings(settings: any): Promise<void> {
  try {
    const configFile = await configManager.load()
    const updatedConfigFile = {
      ...configFile,
      settings: { ...configFile.settings, ...settings },
    }

    // Use ConfigManager.save() to trigger S3 auto-sync
    return await configManager.save(updatedConfigFile)
  }
  catch (error) {
    console.error('Error saving settings:', error)
    throw error
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const settings = await getSettings()
    return NextResponse.json({ settings })
  }
  catch (error) {
    console.error('GET /api/settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()

    // Validate the request body
    const validationResult = settingsUpdateRequestSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validationResult.error.issues,
      }, { status: 400 })
    }

    const { settings } = validationResult.data

    // Additional validation with the system settings schema
    const settingsValidation = systemSettingsSchema.safeParse(settings)
    if (!settingsValidation.success) {
      return NextResponse.json({
        error: 'Invalid settings data',
        details: settingsValidation.error.issues,
      }, { status: 400 })
    }

    await saveSettings(settingsValidation.data)
    return NextResponse.json({ success: true, settings: await getSettings() })
  }
  catch (error) {
    console.error('PUT /api/settings error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
