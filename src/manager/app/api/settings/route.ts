import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { settingsUpdateRequestSchema, systemSettingsSchema } from '@/lib/validation'
import { ConfigManager } from '../../../../config/manager'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Initialize the ConfigManager instance
const configManager = new ConfigManager()

function getSettings(): any {
  try {
    const configFile = configManager.load()
    const settings = configFile.settings || { overrideClaudeCommand: false }

    // Ensure balanceMode structure exists with defaults
    if (!settings.balanceMode) {
      settings.balanceMode = {
        enableByDefault: false,
        strategy: 'Fallback',
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
        strategy: 'Fallback',
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
        },
      },
    }
  }
}

function saveSettings(settings: any): void {
  try {
    const configFile = configManager.load()
    const updatedConfigFile = {
      ...configFile,
      settings: { ...configFile.settings, ...settings },
    }

    // Use ConfigManager.save() to trigger S3 auto-sync
    configManager.save(updatedConfigFile)
  }
  catch (error) {
    console.error('Error saving settings:', error)
    throw error
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const settings = getSettings()
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

    saveSettings(settingsValidation.data)
    return NextResponse.json({ success: true, settings: getSettings() })
  }
  catch (error) {
    console.error('PUT /api/settings error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
