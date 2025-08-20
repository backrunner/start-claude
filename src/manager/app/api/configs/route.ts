import type { NextRequest } from 'next/server'
import type { ClaudeConfig } from '@/config/types'
import { NextResponse } from 'next/server'
import { claudeConfigSchema, configCreateRequestSchema, configUpdateRequestSchema } from '@/lib/validation'
import { ConfigManager } from '../../../../config/manager'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const configManager = ConfigManager.getInstance()

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
    return configFile.settings || { overrideClaudeCommand: false }
  }
  catch (error) {
    console.error('Error reading settings:', error)
    return { overrideClaudeCommand: false }
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

    // Use ConfigManager.addConfig() to ensure proper S3 sync
    const configs = await getConfigs()
    const existingIndex = configs.findIndex((c: ClaudeConfig) => c.name === config.name)

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
      const maxOrder = configs.length === 0 ? 0 : Math.max(...configs.map((c: ClaudeConfig) => c.order ?? 0))

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
        order: index,
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
