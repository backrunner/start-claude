import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const CACHE_DIR = path.join(os.homedir(), '.start-claude', '.cache')
const UPDATE_CHECK_CACHE_FILE = path.join(CACHE_DIR, 'update-check.json')

interface UpdateCheckCacheData {
  lastCheckTimestamp?: number
  lastCheckVersion?: string
}

/**
 * Simple cache manager for update check metadata
 * Keeps update check data separate from user configuration
 */
export class UpdateCheckCache {
  private static instance: UpdateCheckCache | null = null

  private constructor() {
    this.ensureCacheDir()
  }

  static getInstance(): UpdateCheckCache {
    if (!UpdateCheckCache.instance) {
      UpdateCheckCache.instance = new UpdateCheckCache()
    }
    return UpdateCheckCache.instance
  }

  /**
   * Ensure the cache directory exists
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    }
  }

  /**
   * Get the last update check timestamp
   */
  getLastCheckTimestamp(): number | null {
    try {
      if (!fs.existsSync(UPDATE_CHECK_CACHE_FILE)) {
        return null
      }

      const content = fs.readFileSync(UPDATE_CHECK_CACHE_FILE, 'utf-8')
      const cache: UpdateCheckCacheData = JSON.parse(content)
      return cache.lastCheckTimestamp || null
    }
    catch {
      // Return null if we can't read the cache
      return null
    }
  }

  /**
   * Update the last check timestamp
   */
  setLastCheckTimestamp(timestamp: number, version?: string): void {
    try {
      this.ensureCacheDir()

      const cache: UpdateCheckCacheData = {
        lastCheckTimestamp: timestamp,
        lastCheckVersion: version,
      }

      fs.writeFileSync(UPDATE_CHECK_CACHE_FILE, JSON.stringify(cache, null, 2))
    }
    catch {
      // Silently fail if we can't write to cache
    }
  }

  /**
   * Check if we should perform an update check
   * Only checks once per day (24 hours) to improve startup performance
   */
  shouldCheckForUpdates(): boolean {
    const lastCheck = this.getLastCheckTimestamp()

    if (!lastCheck) {
      return true // Never checked before
    }

    const now = Date.now()
    const oneDayInMs = 24 * 60 * 60 * 1000 // 24 hours
    const timeSinceLastCheck = now - lastCheck

    return timeSinceLastCheck >= oneDayInMs
  }

  /**
   * Clear the update check cache (useful for testing)
   */
  clear(): void {
    try {
      if (fs.existsSync(UPDATE_CHECK_CACHE_FILE)) {
        fs.unlinkSync(UPDATE_CHECK_CACHE_FILE)
      }
    }
    catch {
      // Ignore errors when clearing cache
    }
  }
}
