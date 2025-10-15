import process from 'node:process'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Track last heartbeat from frontend
let lastFrontendHeartbeat = Date.now()
let monitoringInterval: NodeJS.Timeout | null = null

// Heartbeat monitoring configuration
const HEARTBEAT_TIMEOUT_MS = 30000 // 30 seconds without heartbeat = connection lost
const CHECK_INTERVAL_MS = 10000 // Check every 10 seconds

// Start monitoring frontend heartbeats
function startHeartbeatMonitoring(): void {
  if (monitoringInterval) {
    return // Already monitoring
  }

  console.log('[Heartbeat Monitor] Started monitoring frontend heartbeats')

  monitoringInterval = setInterval(() => {
    const timeSinceLastHeartbeat = Date.now() - lastFrontendHeartbeat

    if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      console.error(`[Heartbeat Monitor] No heartbeat received for ${Math.round(timeSinceLastHeartbeat / 1000)}s - shutting down`)

      // Stop monitoring
      if (monitoringInterval) {
        clearInterval(monitoringInterval)
        monitoringInterval = null
      }

      // Check if running in VSCode plugin - if so, don't shutdown
      if (process.env.VSCODE_PLUGIN === 'true') {
        console.log('[Heartbeat Monitor] Running in VSCode plugin - ignoring heartbeat timeout')
        return
      }

      // Gracefully shutdown the manager server
      console.log('[Heartbeat Monitor] Initiating graceful shutdown...')
      setTimeout(() => {
        process.exit(0)
      }, 1000)
    }
    else {
      console.log(`[Heartbeat Monitor] Last heartbeat: ${Math.round(timeSinceLastHeartbeat / 1000)}s ago`)
    }
  }, CHECK_INTERVAL_MS)
}

// Initialize monitoring on first health check
let initialized = false

export async function GET(): Promise<NextResponse> {
  // Update last heartbeat timestamp
  lastFrontendHeartbeat = Date.now()

  // Start monitoring on first request
  if (!initialized) {
    initialized = true
    startHeartbeatMonitoring()
    console.log('[Heartbeat Monitor] Initialized - will monitor for frontend heartbeats')
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    lastHeartbeat: lastFrontendHeartbeat,
  })
}
