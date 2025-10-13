import type { NextRequest } from 'next/server'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { S3ConfigFileManager } from '@start-claude/cli/src/config/s3-config'
import { NextResponse } from 'next/server'
import { LoadBalancerStrategy, SpeedTestStrategy } from '@/config/types'
import { settingsUpdateRequestSchema, systemSettingsSchema } from '@/lib/validation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Initialize the ConfigManager instance
const configManager = ConfigManager.getInstance()
const s3ConfigManager = S3ConfigFileManager.getInstance()

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

    // Load S3 config from s3-config.json only (no backward compatibility)
    console.log('[Settings API] Loading S3 config...')
    console.log('[Settings API] S3 config file path:', s3ConfigManager.getConfigFilePath())
    console.log('[Settings API] S3ConfigFileManager exists:', s3ConfigManager.exists())

    let s3Sync
    try {
      const s3ConfigFile = s3ConfigManager.load()
      console.log('[Settings API] S3 config file loaded:', s3ConfigFile !== null)

      if (s3ConfigFile) {
        s3Sync = s3ConfigFile.s3Config
        console.log('[Settings API] S3 config extracted successfully')
        console.log('[Settings API] - Bucket:', s3Sync?.bucket)
        console.log('[Settings API] - Region:', s3Sync?.region)
        console.log('[Settings API] - Key:', s3Sync?.key)
      }
      else {
        console.log('[Settings API] S3 config file is null')
      }
    }
    catch (loadError) {
      console.error('[Settings API] Error loading S3 config:', loadError)
    }

    const result = {
      ...settings,
      // Use null instead of undefined so JSON.stringify includes it in response
      s3Sync: s3Sync || null,
    }

    console.log('[Settings API] Final result s3Sync:', result.s3Sync !== null ? 'present' : 'null')
    if (result.s3Sync) {
      console.log('[Settings API] s3Sync object keys:', Object.keys(result.s3Sync))
    }

    return result
  }
  catch (error) {
    console.error('[Settings API] Error reading settings:', error)
    return {
      overrideClaudeCommand: false,
      s3Sync: null, // Include s3Sync with null value
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
    // Extract s3Sync to handle separately
    const { s3Sync, ...restSettings } = settings

    // Save main settings (without s3Sync)
    const configFile = await configManager.load()
    const updatedConfigFile = {
      ...configFile,
      settings: { ...configFile.settings, ...restSettings },
    }
    await configManager.save(updatedConfigFile)

    // Handle S3 config in separate file only (no backward compatibility)
    if (s3Sync !== undefined) {
      if (s3Sync === null || (typeof s3Sync === 'object' && Object.keys(s3Sync).length === 0)) {
        // Remove S3 config if it's null or empty
        if (s3ConfigManager.exists()) {
          s3ConfigManager.remove()
          console.log('[Settings API] S3 config removed')
        }
      }
      else {
        // Save S3 config to separate file only
        s3ConfigManager.save(s3Sync)
        console.log('[Settings API] S3 config saved to s3-config.json')
      }
    }
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
