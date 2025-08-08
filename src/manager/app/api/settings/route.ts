import type { NextRequest } from 'next/server'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { settingsUpdateRequestSchema, systemSettingsSchema } from '@/lib/validation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CONFIG_DIR = join(homedir(), '.start-claude')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

function getSettings(): any {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    if (!existsSync(CONFIG_PATH)) {
      return {
        overrideClaudeCommand: false,
        balanceMode: {
          enableByDefault: false,
          healthCheck: {
            enabled: true,
            intervalMs: 30000,
          },
          failedEndpoint: {
            banDurationSeconds: 300,
          },
        },
      }
    }
    const data = readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(data)
    const settings = parsed.settings || { overrideClaudeCommand: false }

    // Ensure balanceMode structure exists with defaults
    if (!settings.balanceMode) {
      settings.balanceMode = {
        enableByDefault: false,
        healthCheck: {
          enabled: true,
          intervalMs: 30000,
        },
        failedEndpoint: {
          banDurationSeconds: 300,
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
        healthCheck: {
          enabled: true,
          intervalMs: 30000,
        },
        failedEndpoint: {
          banDurationSeconds: 300,
        },
      },
    }
  }
}

function saveSettings(settings: any): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    let existingData = {
      configs: [],
      settings: {
        overrideClaudeCommand: false,
        balanceMode: {
          enableByDefault: false,
          healthCheck: {
            enabled: true,
            intervalMs: 30000,
          },
          failedEndpoint: {
            banDurationSeconds: 300,
          },
        },
      },
    }
    if (existsSync(CONFIG_PATH)) {
      const data = readFileSync(CONFIG_PATH, 'utf8')
      existingData = JSON.parse(data)
    }

    const updatedData = {
      ...existingData,
      settings: { ...existingData.settings, ...settings },
    }

    writeFileSync(CONFIG_PATH, JSON.stringify(updatedData, null, 2))
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
