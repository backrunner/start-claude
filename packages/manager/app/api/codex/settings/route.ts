import type { NextRequest } from 'next/server'
import { CodexConfigManager } from '@start-claude/cli/src/codex/config/manager'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const configManager = CodexConfigManager.getInstance()

/**
 * GET /api/codex/settings
 * Get Codex settings
 */
export async function GET(): Promise<NextResponse> {
  try {
    const settings = configManager.getSettings()
    return NextResponse.json({ success: true, settings })
  }
  catch (error) {
    console.error('GET /api/codex/settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch Codex settings' }, { status: 500 })
  }
}

/**
 * POST /api/codex/settings
 * Update Codex settings
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { settings } = body

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings data' }, { status: 400 })
    }

    // Update settings
    configManager.updateSettings(settings)

    const updatedSettings = configManager.getSettings()
    return NextResponse.json({ success: true, settings: updatedSettings })
  }
  catch (error) {
    console.error('POST /api/codex/settings error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update Codex settings' }, { status: 500 })
  }
}
