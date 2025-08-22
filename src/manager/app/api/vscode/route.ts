import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Only allow this endpoint when running in VSCode plugin
    if (process.env.VSCODE_PLUGIN !== 'true') {
      return NextResponse.json({ error: 'This endpoint is only available in VSCode plugin' }, { status: 403 })
    }

    const { action, configName } = await request.json()

    if (action === 'start-claude') {
      if (!configName) {
        return NextResponse.json({ error: 'Configuration name is required' }, { status: 400 })
      }

      // Send message to VSCode extension to start Claude
      // This will be handled by the webview message system
      return NextResponse.json({ 
        success: true, 
        action: 'start-claude-terminal',
        configName,
        command: `start-claude ${configName}`
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  catch (error) {
    console.error('VSCode API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}