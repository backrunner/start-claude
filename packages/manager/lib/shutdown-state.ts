/**
 * Shared state for shutdown coordination between API routes
 * This module maintains server-side state that persists across requests
 */

// Pending shutdown timer reference
let pendingShutdownTimer: NodeJS.Timeout | null = null
let shutdownRequestTime: number | null = null

/**
 * Set the pending shutdown timer
 */
export function setPendingShutdownTimer(timer: NodeJS.Timeout): void {
  pendingShutdownTimer = timer
  shutdownRequestTime = Date.now()
}

/**
 * Clear the pending shutdown timer
 */
export function clearPendingShutdownTimer(): void {
  if (pendingShutdownTimer) {
    clearTimeout(pendingShutdownTimer)
  }
  pendingShutdownTimer = null
  shutdownRequestTime = null
}

/**
 * Check if there's a pending shutdown
 */
export function hasPendingShutdown(): boolean {
  return pendingShutdownTimer !== null
}

/**
 * Get the time when shutdown was requested
 */
export function getShutdownRequestTime(): number | null {
  return shutdownRequestTime
}

/**
 * Cancel any pending shutdown (called when a new heartbeat is received)
 * Returns true if a shutdown was cancelled
 */
export function cancelPendingShutdown(): boolean {
  if (pendingShutdownTimer) {
    clearTimeout(pendingShutdownTimer)
    pendingShutdownTimer = null
    shutdownRequestTime = null
    console.log('[ShutdownState] Pending shutdown cancelled - received new heartbeat')
    return true
  }
  return false
}
