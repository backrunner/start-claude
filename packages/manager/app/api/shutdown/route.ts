import type { NextRequest } from 'next/server'
import process from 'node:process'
import { NextResponse } from 'next/server'
import { ConfigManager } from '@start-claude/cli/src/config/manager'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function initiateShutdown(): Promise<void> {
  console.log('Shutdown initiated...')

  // Check if running in VSCode plugin - if so, don't shutdown
  if (process.env.VSCODE_PLUGIN === 'true') {
    console.log('Running in VSCode plugin - ignoring shutdown request')
    return
  }

  // Wait for any pending S3 sync operations to complete
  try {
    const configManager = ConfigManager.getInstance()

    if (configManager.hasPendingSyncs()) {
      console.log('[Shutdown] Waiting for pending S3 sync operations to complete...')
      await configManager.waitForPendingSyncs(10000) // 10 second timeout
      console.log('[Shutdown] All pending syncs completed or timed out')
    }
    else {
      console.log('[Shutdown] No pending sync operations')
    }
  }
  catch (error) {
    console.error('[Shutdown] Error waiting for pending syncs:', error)
    // Continue with shutdown even if there's an error
  }

  // Schedule the server shutdown after a brief delay to allow response to be sent
  setTimeout(() => {
    console.log('Manager server shutting down now...')
    process.exit(0)
  }, 200)

  // Fallback: Force exit after a longer delay if normal exit doesn't work
  setTimeout(() => {
    console.log('Force killing manager server...')
    process.exit(1)
  }, 12000) // Increased to 12 seconds to account for sync timeout
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Handle both regular fetch requests and sendBeacon requests
    const contentType = request.headers.get('content-type')

    if (contentType?.includes('application/json')) {
      // Regular JSON request
      await request.json().catch(() => ({})) // Don't fail if body is empty
    }

    console.log('Shutdown request received')
    await initiateShutdown()

    return NextResponse.json({ success: true, message: 'Server shutdown initiated' })
  }
  catch (error) {
    console.error('Shutdown API error:', error)
    // Still initiate shutdown even if there's an error
    await initiateShutdown()
    return NextResponse.json({ error: 'Failed to process shutdown request, but shutdown initiated' }, { status: 500 })
  }
}

// Handle sendBeacon requests which might come as different HTTP methods
export async function GET(): Promise<NextResponse> {
  console.log('Shutdown request received (GET)')
  await initiateShutdown()
  return NextResponse.json({ success: true, message: 'Server shutdown initiated' })
}

export async function PUT(): Promise<NextResponse> {
  console.log('Shutdown request received (PUT)')
  await initiateShutdown()
  return NextResponse.json({ success: true, message: 'Server shutdown initiated' })
}
