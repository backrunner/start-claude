import type { NextRequest } from 'next/server'
import type { ClaudeConfig } from '@/config/types'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { claudeConfigSchema, configCreateRequestSchema, configUpdateRequestSchema } from '@/lib/validation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CONFIG_DIR = join(homedir(), '.start-claude')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

function getConfigs(): ClaudeConfig[] {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    if (!existsSync(CONFIG_PATH)) {
      return []
    }
    const data = readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(data)
    return parsed.configs || []
  }
  catch (error) {
    console.error('Error reading configs:', error)
    return []
  }
}

function getSettings(): any {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    if (!existsSync(CONFIG_PATH)) {
      return { overrideClaudeCommand: false }
    }
    const data = readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(data)
    return parsed.settings || { overrideClaudeCommand: false }
  }
  catch (error) {
    console.error('Error reading settings:', error)
    return { overrideClaudeCommand: false }
  }
}

function saveConfigs(configs: ClaudeConfig[], settings?: any): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    const currentSettings = settings || getSettings()
    const data = {
      configs,
      settings: currentSettings,
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2))
  }
  catch (error) {
    console.error('Error saving configs:', error)
    throw error
  }
}

// Simple S3 sync check function for the manager
async function checkS3Sync(): Promise<void> {
  try {
    const settings = getSettings()
    if (!settings.s3Sync) {
      return // No S3 config, skip sync check
    }

    // Check if local file was recently modified (within last 30 seconds)
    // If so, skip sync check to avoid conflicts during rapid changes
    const localStats = statSync(CONFIG_PATH)
    const timeSinceModified = Date.now() - localStats.mtime.getTime()
    if (timeSinceModified < 30000) {
      // File was recently modified, skip sync
    }

    // Basic check completed - in a full implementation, we'd check S3 here
    // For now, we'll let the CLI handle the heavy S3 operations
  }
  catch (error) {
    // Silent fail for sync checks
    console.error('S3 sync check failed:', error)
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    // Perform basic sync check when manager opens
    await checkS3Sync()

    const configs = getConfigs()
    const settings = getSettings()
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

    const configs = getConfigs()
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

      configs[existingIndex] = updatedConfigResult.data
    }
    else {
      // Validate new config
      const newConfigResult = claudeConfigSchema.safeParse({
        ...config,
        order: config.order ?? configs.length,
        enabled: config.enabled ?? true,
      })

      if (!newConfigResult.success) {
        return NextResponse.json({
          error: 'Invalid configuration data',
          details: newConfigResult.error.issues,
        }, { status: 400 })
      }

      configs.push(newConfigResult.data)
    }

    saveConfigs(configs)
    return NextResponse.json({ success: true, configs })
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

    saveConfigs(validatedConfigs)
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

    const configs = getConfigs()
    const filteredConfigs = configs.filter(c => c.name !== name)

    if (filteredConfigs.length === configs.length) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    saveConfigs(filteredConfigs)
    return NextResponse.json({ success: true, configs: filteredConfigs })
  }
  catch (error) {
    console.error('DELETE /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
  }
}
