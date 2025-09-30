import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'

const LOCK_DIR = path.join(os.homedir(), '.start-claude')
const LOCK_FILE = path.join(LOCK_DIR, 'manager.lock')

// Maximum age of a lock file before it's considered stale (24 hours)
const MAX_LOCK_AGE_MS = 24 * 60 * 60 * 1000

// Time window for server startup before considering it crashed (30 seconds)
const SERVER_STARTUP_TIMEOUT_MS = 30000

// Heartbeat interval for updating lock timestamp (5 minutes)
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

export interface ManagerLockInfo {
  pid: number
  port: number
  timestamp: number
  hostname: string
  lastHeartbeat?: number
}

/**
 * Check if a process is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually sending a signal
    process.kill(pid, 0)
    return true
  }
  catch (error: any) {
    // ESRCH means process doesn't exist
    // EPERM means process exists but we don't have permission (still running)
    return error.code === 'EPERM'
  }
}

/**
 * Check if the manager server at given port is responsive
 */
async function isServerResponsive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      method: 'GET',
      path: '/api/health',
      timeout: 2000,
    }, (res) => {
      resolve(res.statusCode === 200)
    })

    req.on('error', () => {
      resolve(false)
    })

    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })

    req.end()
  })
}

/**
 * Read existing lock file
 */
function readLockFile(): ManagerLockInfo | null {
  try {
    if (!existsSync(LOCK_FILE)) {
      return null
    }

    const content = readFileSync(LOCK_FILE, 'utf-8')
    const lockInfo: ManagerLockInfo = JSON.parse(content)
    return lockInfo
  }
  catch {
    // Invalid lock file, treat as no lock
    return null
  }
}

/**
 * Check if a lock file is stale based on multiple factors
 */
function isLockStale(lockInfo: ManagerLockInfo): boolean {
  const now = Date.now()
  const age = now - lockInfo.timestamp
  const lastHeartbeat = lockInfo.lastHeartbeat || lockInfo.timestamp
  const heartbeatAge = now - lastHeartbeat

  // 1. Check if lock is older than maximum age (24 hours)
  if (age > MAX_LOCK_AGE_MS) {
    return true
  }

  // 2. Check if last heartbeat is too old (15 minutes without heartbeat)
  if (heartbeatAge > HEARTBEAT_INTERVAL_MS * 3) {
    return true
  }

  // 3. Check if hostname doesn't match (network shared directory scenario)
  if (lockInfo.hostname !== os.hostname()) {
    // Lock from different machine - could be network share
    // Only consider stale if very old (1 hour)
    return age > 60 * 60 * 1000
  }

  return false
}

/**
 * Check if there's a valid existing manager instance
 * @returns Lock info if a valid instance exists, null otherwise
 */
export async function checkExistingInstance(): Promise<ManagerLockInfo | null> {
  const lockInfo = readLockFile()

  if (!lockInfo) {
    return null
  }

  // Step 1: Check if lock is stale based on age and heartbeat
  // This catches locks that are too old regardless of process state
  if (isLockStale(lockInfo)) {
    removeLock()
    return null
  }

  // Step 2: Check if the process is still running (only on same machine)
  // This is the fastest check and should be done first for local processes
  const isSameMachine = lockInfo.hostname === os.hostname()

  if (isSameMachine) {
    if (!isProcessRunning(lockInfo.pid)) {
      // Process no longer exists, remove stale lock immediately
      // This handles the case where manager was killed/crashed
      removeLock()
      return null
    }

    // Process exists, but we need to verify it's actually the manager server
    // The PID might have been reused by another process
  }

  // Step 3: Check if the server is responsive
  // This verifies the process is actually a manager server
  const isResponsive = await isServerResponsive(lockInfo.port)

  if (!isResponsive) {
    // Server is not responsive
    const age = Date.now() - lockInfo.timestamp

    if (isSameMachine) {
      // On same machine: process exists but server not responsive

      // If just started (< 30s), give it time to start up
      if (age < SERVER_STARTUP_TIMEOUT_MS) {
        return lockInfo
      }

      // Server should be responsive by now
      // Either it crashed or the PID was reused by a different process
      removeLock()
      return null
    }
    else {
      // On different machine (network share scenario)
      // We can't check the process, so we rely on timeout

      // If very recent, assume it's still starting up
      if (age < SERVER_STARTUP_TIMEOUT_MS) {
        return lockInfo
      }

      // Not responsive and past startup window - consider it dead
      removeLock()
      return null
    }
  }

  // Server is responsive - valid instance exists
  return lockInfo
}

/**
 * Create a lock file for the current manager instance
 */
export function createLock(port: number): void {
  try {
    // Ensure lock directory exists
    if (!existsSync(LOCK_DIR)) {
      mkdirSync(LOCK_DIR, { recursive: true })
    }

    const lockInfo: ManagerLockInfo = {
      pid: process.pid,
      port,
      timestamp: Date.now(),
      hostname: os.hostname(),
    }

    writeFileSync(LOCK_FILE, JSON.stringify(lockInfo, null, 2), 'utf-8')
  }
  catch (error) {
    console.error('Failed to create lock file:', error)
    // Non-fatal, continue anyway
  }
}

/**
 * Remove the lock file
 */
export function removeLock(): void {
  try {
    if (existsSync(LOCK_FILE)) {
      rmSync(LOCK_FILE)
    }
  }
  catch (error) {
    console.error('Failed to remove lock file:', error)
    // Non-fatal
  }
}

/**
 * Update the heartbeat timestamp in the lock file
 * This should be called periodically to indicate the process is still alive
 */
export function updateHeartbeat(): void {
  try {
    const lockInfo = readLockFile()
    if (lockInfo && lockInfo.pid === process.pid) {
      lockInfo.lastHeartbeat = Date.now()
      writeFileSync(LOCK_FILE, JSON.stringify(lockInfo, null, 2), 'utf-8')
    }
  }
  // eslint-disable-next-line unused-imports/no-unused-vars
  catch (error) {
    // Non-fatal, heartbeat update failed
    // The lock will still be valid based on process check
  }
}

/**
 * Start heartbeat updates to keep the lock alive
 * @returns A cleanup function to stop the heartbeat
 */
export function startHeartbeat(): () => void {
  // Update heartbeat immediately
  updateHeartbeat()

  // Set up periodic heartbeat updates
  const intervalId = setInterval(() => {
    updateHeartbeat()
  }, HEARTBEAT_INTERVAL_MS)

  // Return cleanup function
  return () => {
    clearInterval(intervalId)
  }
}

/**
 * Get the lock file path (for testing/debugging)
 */
export function getLockFilePath(): string {
  return LOCK_FILE
}

/**
 * Force remove a stale lock file (for manual cleanup or testing)
 * This bypasses all checks and removes the lock file
 */
export function forceRemoveLock(): void {
  removeLock()
}
