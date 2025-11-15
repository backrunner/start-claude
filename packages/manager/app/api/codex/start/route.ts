import type { NextRequest } from 'next/server'
import { exec } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { CodexConfigManager } from '@start-claude/cli/src/codex/config/manager'
import { NextResponse } from 'next/server'

const execAsync = promisify(exec)

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/codex/start
 * Start Codex CLI with a configuration
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { configName } = body

    if (!configName) {
      return NextResponse.json({ error: 'Configuration name is required' }, { status: 400 })
    }

    const configManager = CodexConfigManager.getInstance()
    const config = configManager.getConfig(configName)

    if (!config) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 })
    }

    // Start Codex in a new terminal/process
    // This is a simplified implementation - in production you might want to use a process manager
    const command = process.platform === 'win32'
      ? `start cmd /c "start-codex ${configName}"`
      : `osascript -e 'tell application "Terminal" to do script "start-codex ${configName}"'`

    try {
      await execAsync(command)
      return NextResponse.json({ success: true, message: 'Codex started successfully' })
    }
    catch (error) {
      console.error('Failed to start Codex:', error)
      return NextResponse.json(
        { error: 'Failed to start Codex. Please ensure start-codex is installed and in your PATH.' },
        { status: 500 },
      )
    }
  }
  catch (error) {
    console.error('POST /api/codex/start error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to start Codex' }, { status: 500 })
  }
}
