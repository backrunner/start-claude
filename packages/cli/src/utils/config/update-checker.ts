import type { Buffer } from 'node:buffer'
import { exec, spawn } from 'node:child_process'
import https from 'node:https'
import process from 'node:process'
import { version } from '../../../package.json'
import { isGlobalNodePath } from '../system/path-utils'
import { CacheManager } from './cache-manager'

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  updateCommand: string
}

/**
 * Fetch latest version from npm registry via HTTP
 * Much faster than spawning pnpm subprocess
 */
async function fetchLatestVersionFromNpm(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = 3000 // Reduced to 3 seconds

    const req = https.get('https://registry.npmjs.org/start-claude/latest', {
      timeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'start-claude-cli',
      },
    }, (res: any) => {
      let data = ''

      res.on('data', (chunk: Buffer) => {
        data += chunk.toString()
      })

      res.on('end', () => {
        try {
          const pkg = JSON.parse(data)
          resolve(pkg.version)
        }
        catch {
          reject(new Error('Failed to parse npm registry response'))
        }
      })
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.on('error', (error: Error) => {
      reject(error)
    })
  })
}

export async function checkForUpdates(forceCheck = false): Promise<UpdateInfo | null> {
  try {
    const cache = CacheManager.getInstance()

    // Check if we should skip the update check based on last check time
    if (!forceCheck && !cache.shouldCheckForUpdates()) {
      return null
    }

    // Use HTTP request instead of spawning pnpm subprocess
    const latestVersion = await fetchLatestVersionFromNpm()

    const hasUpdate = compareVersions(version, latestVersion) < 0

    // Update the last check timestamp
    cache.setUpdateCheckTimestamp(Date.now(), version)

    return {
      currentVersion: version,
      latestVersion,
      hasUpdate,
      updateCommand: 'pnpm add -g start-claude@latest',
    }
  }
  catch {
    // Silently fail if update check fails (network issues, etc.)
    return null
  }
}

function compareVersions(current: string, latest: string): number {
  const currentParts = current.split('.').map(Number)
  const latestParts = latest.split('.').map(Number)

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0
    const latestPart = latestParts[i] || 0

    if (currentPart < latestPart)
      return -1
    if (currentPart > latestPart)
      return 1
  }

  return 0
}

export interface UpdateResult {
  success: boolean
  error?: string
}

export async function performAutoUpdate(): Promise<UpdateResult> {
  try {
    const result = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      exec('pnpm add -g start-claude@latest', { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(error)
        }
        else {
          resolve({ stdout, stderr })
        }
      })
    })

    // Check if the update was successful
    if (result.stderr && (result.stderr.includes('error') || result.stderr.includes('failed'))) {
      return {
        success: false,
        error: result.stderr.trim(),
      }
    }

    return { success: true }
  }
  catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred during update',
    }
  }
}

/**
 * Detect if the CLI is running from a global installation
 */
function isGlobalInstall(): boolean {
  // Check if we're running via the global binary (not via node script.js)
  // When running globally, process.argv[1] should be the global binary path
  // or we can check if the script path is in a global node path
  if (!process.argv[1]) {
    return false
  }

  const scriptPath = process.argv[1]

  // Check if we're running via direct node execution (local development)
  if (scriptPath.endsWith('.js') || scriptPath.endsWith('.cjs') || scriptPath.endsWith('.mjs')) {
    // Check if the script is in a global Node.js installation path
    return isGlobalNodePath(scriptPath)
  }

  // If we're running via a binary (like start-claude command), it's global
  return true
}

/**
 * Restarts the CLI with the same arguments after an update
 * This ensures the user continues with their original command
 */
export function relaunchCLI(): void {
  // Get the original command and arguments
  const args = process.argv.slice(2) // Remove 'node' and script path
  const executable = process.argv[0] // node executable

  let commandToRun: string[]

  if (isGlobalInstall()) {
    // Running globally - use the binary name directly
    // Find the binary name from process.argv[1] or use 'start-claude'
    const binaryName = process.argv[1] && !process.argv[1].includes('/')
      ? process.argv[1]
      : 'start-claude'
    commandToRun = [binaryName, ...args]
  }
  else {
    // Running locally - use node with the script path
    const scriptPath = process.argv[1] // script path
    commandToRun = [scriptPath, ...args]
  }

  // Spawn a new process with the same arguments
  const child = spawn(executable, commandToRun, {
    detached: true,
    stdio: 'inherit',
  })

  // Allow the parent process to exit independently
  child.unref()

  // Exit the current process
  process.exit(0)
}
