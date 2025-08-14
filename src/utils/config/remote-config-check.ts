import type { S3SyncManager } from '../../storage/s3-sync'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { displayInfo, displayVerbose } from '../cli/ui'

export interface RemoteConfigCheckResult {
  hasRemoteUpdate: boolean
  lastCheckTime: Date
  skipUntil?: Date
}

const CHECK_CACHE_KEY = 'remote-config-check'

/**
 * Check for remote config updates with rate limiting
 * Only checks once per day unless forced
 */
export async function checkRemoteConfigUpdates(
  s3SyncManager: S3SyncManager,
  options: { verbose?: boolean, force?: boolean } = {},
): Promise<RemoteConfigCheckResult> {
  const now = new Date()

  try {
    // Check if S3 is configured
    if (!s3SyncManager.isS3Configured()) {
      displayVerbose('S3 not configured, skipping remote config check', options.verbose)
      return {
        hasRemoteUpdate: false,
        lastCheckTime: now,
      }
    }

    // Get cached check time to implement daily check limit
    const lastCheck = getCachedCheckTime()
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000))

    // Skip if we've checked recently and not forcing
    if (!options.force && lastCheck && lastCheck > oneDayAgo) {
      displayVerbose('Remote config check skipped (already checked today)', options.verbose)
      return {
        hasRemoteUpdate: false,
        lastCheckTime: lastCheck,
      }
    }

    displayVerbose('Checking for remote config updates...', options.verbose)

    // Perform the remote check
    const hasUpdate = await s3SyncManager.checkRemoteUpdates()

    // Cache the check time
    setCachedCheckTime(now)

    if (hasUpdate) {
      displayInfo('✨ Remote configuration updated successfully')
    }
    else {
      displayVerbose('No remote config updates found', options.verbose)
    }

    return {
      hasRemoteUpdate: hasUpdate,
      lastCheckTime: now,
    }
  }
  catch (error) {
    displayVerbose(`Remote config check failed: ${error instanceof Error ? error.message : 'Unknown error'}`, options.verbose)

    return {
      hasRemoteUpdate: false,
      lastCheckTime: now,
    }
  }
}

/**
 * Silent check for remote config - no user prompts
 * Used for automatic checks before starting services
 */
export async function silentRemoteConfigCheck(
  s3SyncManager: S3SyncManager,
  options: { verbose?: boolean } = {},
): Promise<boolean> {
  try {
    if (!s3SyncManager.isS3Configured()) {
      displayVerbose('S3 not configured, skipping silent config check', options.verbose)
      return false
    }

    displayVerbose('Performing silent remote config check...', options.verbose)

    // Use the auto-sync method which is designed to be silent
    const syncResult = await s3SyncManager.checkAutoSync()

    if (syncResult) {
      displayVerbose('Silent config check completed', options.verbose)
      return true
    }

    return false
  }
  catch (error) {
    displayVerbose(`Silent config check failed: ${error instanceof Error ? error.message : 'Unknown error'}`, options.verbose)
    return false
  }
}

// Utility functions for caching check times
function getCachedCheckTime(): Date | null {
  try {
    const cached = process.env[`SC_${CHECK_CACHE_KEY.toUpperCase()}`]
    if (cached) {
      return new Date(cached)
    }

    // Also try to read from a temp file as fallback
    const cacheFile = join(tmpdir(), `.start-claude-${CHECK_CACHE_KEY}`)
    if (existsSync(cacheFile)) {
      const content = readFileSync(cacheFile, 'utf8')
      return new Date(content.trim())
    }
  }
  catch {
    // Ignore errors
  }

  return null
}

function setCachedCheckTime(time: Date): void {
  try {
    // Store in environment variable for current process
    process.env[`SC_${CHECK_CACHE_KEY.toUpperCase()}`] = time.toISOString()

    // Also store in temp file for persistence across runs
    const cacheFile = join(tmpdir(), `.start-claude-${CHECK_CACHE_KEY}`)
    writeFileSync(cacheFile, time.toISOString())
  }
  catch {
    // Ignore errors
  }
}
