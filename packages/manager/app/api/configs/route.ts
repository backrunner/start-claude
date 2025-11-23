import type { ClaudeConfig, SystemSettings } from '@start-claude/cli/src/config/types'
import type { NextRequest } from 'next/server'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { findConfigByName } from '@start-claude/cli/src/config/name-utils'
import { S3ConfigFileManager } from '@start-claude/cli/src/config/s3-config'
import { NextResponse } from 'next/server'
import { LoadBalancerStrategy, SpeedTestStrategy } from '@/config/types'
import { claudeConfigSchema, configCreateRequestSchema, configUpdateRequestSchema } from '@/lib/validation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const configManager = ConfigManager.getInstance()
const s3ConfigManager = S3ConfigFileManager.getInstance()

/**
 * Validate that all enabled extension IDs exist in the extensions library
 */
async function validateEnabledExtensions(config: ClaudeConfig): Promise<{ valid: boolean, errors: string[] }> {
  const errors: string[] = []

  if (!config.enabledExtensions) {
    return { valid: true, errors: [] }
  }

  try {
    const configFile = await configManager.load()
    const library = configFile.settings.extensionsLibrary

    if (!library) {
      // No library exists yet, check if any extensions are enabled
      const hasExplicitLists = (
        (config.enabledExtensions.mcpServers && config.enabledExtensions.mcpServers.length > 0)
        || (config.enabledExtensions.skills && config.enabledExtensions.skills.length > 0)
        || (config.enabledExtensions.subagents && config.enabledExtensions.subagents.length > 0)
      )

      const hasOverrides = config.enabledExtensions.overrides && (
        (config.enabledExtensions.overrides.mcpServers?.add && config.enabledExtensions.overrides.mcpServers.add.length > 0)
        || (config.enabledExtensions.overrides.skills?.add && config.enabledExtensions.overrides.skills.add.length > 0)
        || (config.enabledExtensions.overrides.subagents?.add && config.enabledExtensions.overrides.subagents.add.length > 0)
      )

      if (hasExplicitLists || hasOverrides) {
        errors.push('Extensions library not initialized. Cannot enable extensions.')
      }
      return { valid: errors.length === 0, errors }
    }

    // Check if using override model or legacy explicit lists
    if (config.enabledExtensions.useGlobalDefaults && config.enabledExtensions.overrides) {
      // Validate override model: additions and removals
      const overrides = config.enabledExtensions.overrides
      const defaults = configFile.settings.defaultEnabledExtensions || {
        mcpServers: [],
        skills: [],
        subagents: [],
      }

      // Validate MCP server additions
      if (overrides.mcpServers?.add) {
        for (const id of overrides.mcpServers.add) {
          if (!library.mcpServers[id]) {
            errors.push(`MCP server "${id}" not found in extensions library`)
          }
        }
      }

      // Validate MCP server removals (must exist in defaults)
      if (overrides.mcpServers?.remove) {
        for (const id of overrides.mcpServers.remove) {
          if (!defaults.mcpServers.includes(id)) {
            errors.push(`Cannot remove MCP server "${id}" - not in global defaults`)
          }
        }
      }

      // Validate skill additions
      if (overrides.skills?.add) {
        for (const id of overrides.skills.add) {
          if (!library.skills[id]) {
            errors.push(`Skill "${id}" not found in extensions library`)
          }
        }
      }

      // Validate skill removals
      if (overrides.skills?.remove) {
        for (const id of overrides.skills.remove) {
          if (!defaults.skills.includes(id)) {
            errors.push(`Cannot remove skill "${id}" - not in global defaults`)
          }
        }
      }

      // Validate subagent additions
      if (overrides.subagents?.add) {
        for (const id of overrides.subagents.add) {
          if (!library.subagents[id]) {
            errors.push(`Subagent "${id}" not found in extensions library`)
          }
        }
      }

      // Validate subagent removals
      if (overrides.subagents?.remove) {
        for (const id of overrides.subagents.remove) {
          if (!defaults.subagents.includes(id)) {
            errors.push(`Cannot remove subagent "${id}" - not in global defaults`)
          }
        }
      }
    }
    else {
      // Validate legacy explicit lists
      // Validate MCP servers
      if (config.enabledExtensions.mcpServers) {
        for (const id of config.enabledExtensions.mcpServers) {
          if (!library.mcpServers[id]) {
            errors.push(`MCP server "${id}" not found in extensions library`)
          }
        }
      }

      // Validate skills
      if (config.enabledExtensions.skills) {
        for (const id of config.enabledExtensions.skills) {
          if (!library.skills[id]) {
            errors.push(`Skill "${id}" not found in extensions library`)
          }
        }
      }

      // Validate subagents
      if (config.enabledExtensions.subagents) {
        for (const id of config.enabledExtensions.subagents) {
          if (!library.subagents[id]) {
            errors.push(`Subagent "${id}" not found in extensions library`)
          }
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }
  catch (error) {
    console.error('[Configs API] Error validating enabled extensions:', error)
    return { valid: false, errors: ['Failed to validate extensions'] }
  }
}

async function getConfigs(): Promise<ClaudeConfig[]> {
  try {
    const configFile = await configManager.load()
    // Filter out deleted configs (soft delete tombstones)
    return (configFile.configs || []).filter(c => !c.isDeleted)
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

    // Use ConfigManager.addConfig() to ensure proper S3 sync and name conflict checking
    const configs = await getConfigs()

    // Use flexible name matching to find existing config
    const existingConfig = findConfigByName(configs, config.name)

    if (existingConfig) {
      // Merge existing config with new config
      const updatedConfig = {
        ...existingConfig,
        ...config,
      }

      // Validate enabled extensions
      const extensionsValidation = await validateEnabledExtensions(updatedConfig)
      if (!extensionsValidation.valid) {
        return NextResponse.json({
          error: 'Invalid enabled extensions',
          details: extensionsValidation.errors,
        }, { status: 400 })
      }

      // Validate the updated config
      const updatedConfigResult = claudeConfigSchema.safeParse(updatedConfig)

      if (!updatedConfigResult.success) {
        return NextResponse.json({
          error: 'Invalid configuration data',
          details: updatedConfigResult.error.issues,
        }, { status: 400 })
      }

      try {
        // Use ConfigManager.addConfig() which triggers S3 sync and checks for conflicts
        await configManager.addConfig(updatedConfigResult.data)
      }
      catch (error) {
        // Handle name conflict errors from ConfigManager
        if (error instanceof Error && error.message.includes('conflicts with existing configuration')) {
          return NextResponse.json({ error: error.message }, { status: 409 })
        }
        throw error
      }
    }
    else {
      // Calculate the next order value as max existing order + 1
      const maxOrder = configs.length === 0 ? 0 : Math.max(...configs.map(c => c.order ?? 0))

      // Validate new config
      const newConfig = {
        ...config,
        order: config.order ?? (maxOrder + 1),
        enabled: config.enabled ?? true,
      }

      // Validate enabled extensions
      const extensionsValidation = await validateEnabledExtensions(newConfig)
      if (!extensionsValidation.valid) {
        return NextResponse.json({
          error: 'Invalid enabled extensions',
          details: extensionsValidation.errors,
        }, { status: 400 })
      }

      const newConfigResult = claudeConfigSchema.safeParse(newConfig)

      if (!newConfigResult.success) {
        return NextResponse.json({
          error: 'Invalid configuration data',
          details: newConfigResult.error.issues,
        }, { status: 400 })
      }

      try {
        // Use ConfigManager.addConfig() which triggers S3 sync and checks for conflicts
        await configManager.addConfig(newConfigResult.data)
      }
      catch (error) {
        // Handle name conflict errors from ConfigManager
        if (error instanceof Error && error.message.includes('conflicts with existing configuration')) {
          return NextResponse.json({ error: error.message }, { status: 409 })
        }
        throw error
      }
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
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to save config',
    }, { status: 500 })
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
      // Validate enabled extensions
      const extensionsValidation = await validateEnabledExtensions(config)
      if (!extensionsValidation.valid) {
        return NextResponse.json({
          error: `Invalid enabled extensions for "${config.name}": ${extensionsValidation.errors.join(', ')}`,
        }, { status: 400 })
      }

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

    // Re-order remaining configs to create a continuous sequence (only non-deleted ones)
    const configs = await getConfigs()
    const reorderedConfigs = configs
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((config, index) => ({
        ...config,
        order: index + 1,
      }))

    // Save reordered configs using ConfigManager while preserving deleted configs (tombstones)
    const configFile = await configManager.load()
    const deletedConfigs = configFile.configs.filter(c => c.isDeleted)
    await configManager.save({
      ...configFile,
      configs: [...reorderedConfigs, ...deletedConfigs],
    })

    const settings = await getSettings()
    return NextResponse.json({ success: true, configs: reorderedConfigs, settings })
  }
  catch (error) {
    console.error('DELETE /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
  }
}
