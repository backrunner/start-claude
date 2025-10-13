import type { NextRequest } from 'next/server'
import type { ClaudeConfig } from '@/config/types'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { S3ConfigFileManager } from '@start-claude/cli/src/config/s3-config'
import { NextResponse } from 'next/server'
import { claudeConfigSchema, configCreateRequestSchema, configUpdateRequestSchema } from '@/lib/validation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const configManager = ConfigManager.getInstance()
const s3ConfigManager = S3ConfigFileManager.getInstance()

async function getConfigs(): Promise<ClaudeConfig[]> {
  try {
    return await configManager.listConfigs()
  }
  catch (error) {
    console.error('Error reading configs:', error)
    return Promise.resolve([])
  }
}

async function getSettings(): Promise<any> {
  try {
    const configFile = await configManager.load()
    const settings = configFile.settings || { overrideClaudeCommand: false }

    // Load S3 config from s3-config.json
    const s3ConfigFile = s3ConfigManager.load()
    const s3Sync = s3ConfigFile?.s3Config || null

    return {
      ...settings,
      s3Sync,
    }
  }
  catch (error) {
    console.error('Error reading settings:', error)
    return {
      overrideClaudeCommand: false,
      s3Sync: null,
    }
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const configs = await getConfigs()
    const settings = await getSettings()
    return NextResponse.json({ configs, settings })
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

    // Use ConfigManager.addConfig() which handles both create and update
    // It will match by id first, then by name if id is not present
    const configs = await getConfigs()

    // If config has an id, it's an update - preserve the existing config's data
    let configToSave = config
    if (config.id) {
      const existingConfig = configs.find((c: ClaudeConfig) => c.id === config.id)
      if (existingConfig) {
        // Merge existing config with updates, preserving the id and other fields
        configToSave = {
          ...existingConfig,
          ...config,
          id: existingConfig.id, // Ensure id is preserved
        }
      }
    }
    else {
      // No id provided - check if this is an update by name (legacy behavior)
      const existingByName = configs.find((c: ClaudeConfig) => c.name === config.name)
      if (existingByName) {
        // Merge with existing config, preserving its id
        configToSave = {
          ...existingByName,
          ...config,
          id: existingByName.id,
        }
      }
      else {
        // New config - assign order
        const maxOrder = configs.length === 0 ? 0 : Math.max(...configs.map((c: ClaudeConfig) => c.order ?? 0))
        configToSave = {
          ...config,
          order: config.order ?? (maxOrder + 1),
          enabled: config.enabled ?? true,
        }
      }
    }

    // Validate the final config
    const configValidation = claudeConfigSchema.safeParse(configToSave)
    if (!configValidation.success) {
      return NextResponse.json({
        error: 'Invalid configuration data',
        details: configValidation.error.issues,
      }, { status: 400 })
    }

    // Use ConfigManager.addConfig() which triggers S3 sync
    await configManager.addConfig(configValidation.data)

    const updatedConfigs = await getConfigs()
    return NextResponse.json({ success: true, configs: updatedConfigs })
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

    // Use ConfigManager.saveConfigFile() to ensure proper S3 sync
    const configFile = await configManager.load()
    await configManager.saveConfigFile({
      ...configFile,
      configs: validatedConfigs,
    })

    return NextResponse.json({ success: true, configs: validatedConfigs })
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
    await configManager.saveConfigFile({
      ...configFile,
      configs: reorderedConfigs,
    })

    return NextResponse.json({ success: true, configs: reorderedConfigs })
  }
  catch (error) {
    console.error('DELETE /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
  }
}
