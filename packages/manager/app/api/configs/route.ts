import type { ClaudeConfig, SystemSettings } from '@start-claude/cli/src/config/types'
import type { NextRequest } from 'next/server'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { S3ConfigFileManager } from '@start-claude/cli/src/config/s3-config'
import { NextResponse } from 'next/server'
import { LoadBalancerStrategy, SpeedTestStrategy } from '@/config/types'
import { claudeConfigSchema, configCreateRequestSchema, configUpdateRequestSchema } from '@/lib/validation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const configManager = ConfigManager.getInstance()
const s3ConfigManager = S3ConfigFileManager.getInstance()

async function getConfigs(): Promise<ClaudeConfig[]> {
  try {
    const configFile = await configManager.load()
    return configFile.configs || []
  }
  catch (error) {
    console.error('Error reading configs:', error)
    return []
  }
}

async function getSettings(): Promise<SystemSettings> {
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

    // Load S3 config from s3-config.json
    let s3Sync
    try {
      const s3ConfigFile = s3ConfigManager.load()
      if (s3ConfigFile) {
        s3Sync = s3ConfigFile.s3Config
      }
    }
    catch (loadError) {
      console.error('Error loading S3 config:', loadError)
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

export async function GET(): Promise<NextResponse> {
  try {
    const configs = await getConfigs()
    const settings = await getSettings()
    return NextResponse.json({ success: true, configs, settings })
  }
  catch (error) {
    console.error('GET /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()

    // Validate the request body
    const validationResult = configCreateRequestSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validationResult.error.issues,
      }, { status: 400 })
    }

    const { config } = validationResult.data

    if (!config.name) {
      return NextResponse.json({ error: 'Configuration name is required' }, { status: 400 })
    }

    // Use ConfigManager.addConfig() to ensure proper S3 sync
    const configs = await getConfigs()
    const existingIndex = configs.findIndex(c => c.name === config.name)

    if (existingIndex >= 0) {
      // Validate the updated config before saving
      const updatedConfigResult = claudeConfigSchema.safeParse({
        ...configs[existingIndex],
        ...config,
      })

      if (!updatedConfigResult.success) {
        return NextResponse.json({
          error: 'Invalid configuration data',
          details: updatedConfigResult.error.issues,
        }, { status: 400 })
      }

      // Use ConfigManager.addConfig() which triggers S3 sync
      await configManager.addConfig(updatedConfigResult.data)
    }
    else {
      // Calculate the next order value as max existing order + 1
      const maxOrder = configs.length === 0 ? 0 : Math.max(...configs.map(c => c.order ?? 0))

      // Validate new config
      const newConfigResult = claudeConfigSchema.safeParse({
        ...config,
        order: config.order ?? (maxOrder + 1),
        enabled: config.enabled ?? true,
      })

      if (!newConfigResult.success) {
        return NextResponse.json({
          error: 'Invalid configuration data',
          details: newConfigResult.error.issues,
        }, { status: 400 })
      }

      // Use ConfigManager.addConfig() which triggers S3 sync
      await configManager.addConfig(newConfigResult.data)
    }

    const updatedConfigs = await getConfigs()
    const settings = await getSettings()
    return NextResponse.json({ success: true, configs: updatedConfigs, settings })
  }
  catch (error) {
    console.error('POST /api/configs error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()

    // Validate the request body
    const validationResult = configUpdateRequestSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validationResult.error.issues,
      }, { status: 400 })
    }

    const { configs } = validationResult.data

    // Validate each config individually
    const validatedConfigs: ClaudeConfig[] = []
    for (const config of configs) {
      const configValidation = claudeConfigSchema.safeParse(config)
      if (!configValidation.success) {
        return NextResponse.json({
          error: `Invalid configuration "${config.name}": ${configValidation.error.issues.map(i => i.message).join(', ')}`,
        }, { status: 400 })
      }
      validatedConfigs.push(configValidation.data)
    }

    // Use ConfigManager.save() to ensure proper S3 sync
    const configFile = await configManager.load()
    await configManager.save({
      ...configFile,
      configs: validatedConfigs,
    })

    const settings = await getSettings()
    return NextResponse.json({ success: true, configs: validatedConfigs, settings })
  }
  catch (error) {
    console.error('PUT /api/configs error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update configs' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    if (!name) {
      return NextResponse.json({ error: 'Config name is required' }, { status: 400 })
    }

    // Use ConfigManager.removeConfig() to ensure proper S3 sync
    const success = await configManager.removeConfig(name)

    if (!success) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    // Re-order remaining configs to create a continuous sequence
    const configs = await getConfigs()
    const reorderedConfigs = configs
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((config, index) => ({
        ...config,
        order: index + 1,
      }))

    // Save reordered configs using ConfigManager
    const configFile = await configManager.load()
    await configManager.save({
      ...configFile,
      configs: reorderedConfigs,
    })

    const settings = await getSettings()
    return NextResponse.json({ success: true, configs: reorderedConfigs, settings })
  }
  catch (error) {
    console.error('DELETE /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
  }
}
