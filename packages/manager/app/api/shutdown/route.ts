import type { NextRequest } from 'next/server'
import process from 'node:process'
import { NextResponse } from 'next/server'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { clearPendingShutdownTimer, hasPendingShutdown, setPendingShutdownTimer } from '@/lib/shutdown-state'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Grace period configuration
const SHUTDOWN_GRACE_PERIOD_MS = 3000 // Wait 3 seconds before actually shutting down

async function executeShutdown(): Promise<void> {
  console.log('[Shutdown] Executing shutdown...')

  // Check if running in VSCode plugin - if so, don't shutdown
  if (process.env.VSCODE_PLUGIN === 'true') {
    console.log('[Shutdown] Running in VSCode plugin - ignoring shutdown request')
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
  }

  // Schedule the server shutdown after a brief delay to allow response to be sent
  setTimeout(() => {
    console.log('[Shutdown] Manager server shutting down now...')
    process.exit(0)
  }, 200)

  // Fallback: Force exit after a longer delay if normal exit doesn't work
  setTimeout(() => {
    console.log('[Shutdown] Force killing manager server...')
    process.exit(1)
  }, 12000)
}

async function initiateShutdown(): Promise<void> {
  // If there's already a pending shutdown, don't start another one
  if (hasPendingShutdown()) {
    console.log('[Shutdown] Shutdown already pending, ignoring duplicate request')
    return
  }

  // Check if running in VSCode plugin - if so, don't shutdown
  if (process.env.VSCODE_PLUGIN === 'true') {
    console.log('[Shutdown] Running in VSCode plugin - ignoring shutdown request')
    return
  }

  console.log(`[Shutdown] Shutdown requested, waiting ${SHUTDOWN_GRACE_PERIOD_MS}ms grace period...`)

  // Start grace period timer
  const timer = setTimeout(async () => {
    clearPendingShutdownTimer()
    console.log('[Shutdown] Grace period expired, no new heartbeat received - proceeding with shutdown')
    await executeShutdown()
  }, SHUTDOWN_GRACE_PERIOD_MS)

  setPendingShutdownTimer(timer)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Handle both regular fetch requests and sendBeacon requests
    const contentType = request.headers.get('content-type')

    if (contentType?.includes('application/json')) {
      await request.json().catch(() => ({}))
    }

    console.log('[Shutdown] Shutdown request received')
    await initiateShutdown()

    return NextResponse.json({
      success: true,
      message: 'Shutdown initiated with grace period',
      gracePeriodMs: SHUTDOWN_GRACE_PERIOD_MS,
    })
  }
  catch (error) {
    console.error('[Shutdown] API error:', error)
    await initiateShutdown()
    return NextResponse.json(
      { error: 'Failed to process shutdown request, but shutdown initiated' },
      { status: 500 },
    )
  }
}

// Handle sendBeacon requests which might come as different HTTP methods
export async function GET(): Promise<NextResponse> {
  console.log('[Shutdown] Shutdown request received (GET)')
  await initiateShutdown()
  return NextResponse.json({
    success: true,
    message: 'Shutdown initiated with grace period',
    gracePeriodMs: SHUTDOWN_GRACE_PERIOD_MS,
  })
}

export async function PUT(): Promise<NextResponse> {
  console.log('[Shutdown] Shutdown request received (PUT)')
  await initiateShutdown()
  return NextResponse.json({
    success: true,
    message: 'Shutdown initiated with grace period',
    gracePeriodMs: SHUTDOWN_GRACE_PERIOD_MS,
  })
}
