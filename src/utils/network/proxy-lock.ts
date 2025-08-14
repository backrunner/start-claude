import * as fs from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { displayError, displayInfo, displayWarning } from '../cli/ui'

const PROXY_PORT = 2333
const LOCK_FILE = path.join(os.tmpdir(), 'start-claude-proxy.lock')

/**
 * Check if a port is already in use
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.listen(port, () => {
      server.close(() => resolve(false))
    })

    server.on('error', () => {
      resolve(true)
    })
  })
}

/**
 * Create a lock file with the current process ID
 */
function createLockFile(): void {
  try {
    fs.writeFileSync(LOCK_FILE, process.pid.toString(), 'utf8')
  }
  catch (error) {
    displayWarning(`Warning: Could not create proxy lock file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Remove the lock file
 */
export function removeLockFile(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE)
    }
  }
  catch {
    // Silently ignore lock file removal errors
  }
}

/**
 * Check if the process in the lock file is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without affecting it
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

/**
 * Check if proxy server is already running and handle accordingly
 * Returns true if this instance should continue, false if it should exit
 */
export async function checkAndHandleExistingProxy(): Promise<boolean> {
  const portInUse = await isPortInUse(PROXY_PORT)

  if (!portInUse) {
    // Port is free, clean up any stale lock file and proceed
    removeLockFile()
    createLockFile()
    return true
  }

  // Port is in use, check if it's our proxy server
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const pidStr = fs.readFileSync(LOCK_FILE, 'utf8').trim()
      const pid = Number.parseInt(pidStr, 10)

      if (!Number.isNaN(pid) && isProcessRunning(pid)) {
        displayInfo(`🔄 Proxy server is already running (PID: ${pid}) on port ${PROXY_PORT}`)
        displayInfo('Connecting to existing proxy server...')
        return false // Don't start a new server, use existing one
      }
      else {
        // Stale lock file, remove it and try to start server
        displayWarning('Found stale proxy lock file, cleaning up...')
        removeLockFile()

        // Double-check port is still in use after cleanup
        const stillInUse = await isPortInUse(PROXY_PORT)
        if (stillInUse) {
          displayError(`❌ Port ${PROXY_PORT} is in use by another process`)
          displayError('Please stop the other process or choose a different port')
          return false
        }

        createLockFile()
        return true
      }
    }
    catch (error) {
      displayWarning(`Warning: Could not read proxy lock file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Port is in use but no lock file - probably another application
  displayError(`❌ Port ${PROXY_PORT} is already in use by another application`)
  displayError('Please stop the other application or choose a different port for the proxy server')
  return false
}

/**
 * Setup cleanup handlers for the lock file
 */
export function setupProxyCleanup(): void {
  const cleanup = (): void => {
    removeLockFile()
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', () => {
    removeLockFile()
  })
}
