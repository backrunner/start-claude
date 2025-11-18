import type { CodexConfig, CodexSettings } from '@start-claude/cli/src/codex/config/types'
import type { NextRequest } from 'next/server'
import { CodexConfigManager } from '@start-claude/cli/src/codex/config/manager'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const configManager = CodexConfigManager.getInstance()

async function getConfigs(): Promise<CodexConfig[]> {
  try {
    return configManager.listConfigs()
  }
  catch (error) {
    console.error('Error reading Codex configs:', error)
    return []
  }
}

async function getSettings(): Promise<CodexSettings> {
  try {
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

/**
 * GET /api/codex
 * Get all Codex configurations and settings
 */
export async function GET(): Promise<NextResponse> {
  try {
    const configs = await getConfigs()
    const settings = await getSettings()
    return NextResponse.json({ success: true, configs, settings })
  }
  catch (error) {
    console.error('GET /api/codex error:', error)
    return NextResponse.json({ error: 'Failed to fetch Codex configs' }, { status: 500 })
  }
}

/**
 * POST /api/codex
 * Create or update a Codex configuration
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { config } = body

    if (!config || !config.name) {
      return NextResponse.json({ error: 'Configuration name is required' }, { status: 400 })
    }

    // Validate required fields
    if (!config.apiKey) {
      return NextResponse.json({ error: 'API Key is required' }, { status: 400 })
    }

    // Add or update the config
    configManager.addConfig(config)

    const updatedConfigs = await getConfigs()
    const settings = await getSettings()
    return NextResponse.json({ success: true, configs: updatedConfigs, settings })
  }
  catch (error) {
    console.error('POST /api/codex error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to save Codex config' }, { status: 500 })
  }
}

/**
 * PUT /api/codex
 * Update multiple Codex configurations (for drag & drop reordering)
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { configs } = body

    if (!Array.isArray(configs)) {
      return NextResponse.json({ error: 'Configs must be an array' }, { status: 400 })
    }

    // Save all configs
    const configFile = configManager.getConfigFile()
    configManager.saveConfigFile({
      ...configFile,
      configs,
    })

    const settings = await getSettings()
    return NextResponse.json({ success: true, configs, settings })
  }
  catch (error) {
    console.error('PUT /api/codex error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update Codex configs' }, { status: 500 })
  }
}

/**
 * DELETE /api/codex?id=xxx or DELETE /api/codex?name=xxx
 * Delete a Codex configuration
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const name = searchParams.get('name')

    if (!id && !name) {
      return NextResponse.json({ error: 'Config id or name is required' }, { status: 400 })
    }

    let success = false
    if (id) {
      success = configManager.removeConfigById(id)
    }
    else if (name) {
      success = configManager.removeConfig(name)
    }

    if (!success) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    // Re-order remaining configs (only non-deleted ones)
    const configs = await getConfigs()
    const reorderedConfigs = configs
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((config, index) => ({
        ...config,
        order: index + 1,
      }))

    // Save reordered configs while preserving deleted configs (tombstones)
    const configFile = configManager.getConfigFile()
    const deletedConfigs = configFile.configs.filter(c => c.isDeleted)
    configManager.saveConfigFile({
      ...configFile,
      configs: [...reorderedConfigs, ...deletedConfigs],
    })

    const settings = await getSettings()
    return NextResponse.json({ success: true, configs: reorderedConfigs, settings })
  }
  catch (error) {
    console.error('DELETE /api/codex error:', error)
    return NextResponse.json({ error: 'Failed to delete Codex config' }, { status: 500 })
  }
}
