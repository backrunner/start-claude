import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { version } from '../../package.json'

const execAsync = promisify(exec)

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  updateCommand: string
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const { stdout } = await execAsync('pnpm view start-claude version', { timeout: 5000 })
    const latestVersion = stdout.trim()

    const hasUpdate = compareVersions(version, latestVersion) < 0

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

export async function performAutoUpdate(): Promise<boolean> {
  try {
    const { stderr } = await execAsync('pnpm add -g start-claude@latest', { timeout: 30000 })

    // Check if the update was successful
    if (stderr && (stderr.includes('error') || stderr.includes('failed'))) {
      return false
    }

    return true
  }
  catch {
    return false
  }
}
