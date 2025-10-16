import { Buffer } from 'node:buffer'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const CACHE_DIR = path.join(os.homedir(), '.start-claude', '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json')

interface CacheEntry {
  value: any
  timestamp: number
  ttl?: number // TTL in milliseconds, undefined means no expiration
}

interface CacheData {
  [key: string]: CacheEntry
}

/**
 * Universal cache manager for CLI state with key-value storage and TTL support
 * Replaces both cli-state-cache.ts and update-check-cache.ts
 */
export class CacheManager {
  private static instance: CacheManager | null = null

  private constructor() {
    this.ensureCacheDir()
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager()
    }
    return CacheManager.instance
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
   * Load the cache data from disk
   */
  private loadCacheData(): CacheData {
    try {
      if (!fs.existsSync(CACHE_FILE)) {
        return {}
      }

      const content = fs.readFileSync(CACHE_FILE, 'utf-8')
      const data: CacheData = JSON.parse(content)

      // Clean up expired entries while loading
      this.cleanupExpiredEntries(data)

      return data
    }
    catch {
      // Return empty object if we can't read the cache
      return {}
    }
  }

  /**
   * Save the cache data to disk
   */
  private saveCacheData(data: CacheData): void {
    try {
      this.ensureCacheDir()
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
    }
    catch {
      // Silently fail if we can't write to cache
    }
  }

  /**
   * Clean up expired entries from cache data
   */
  private cleanupExpiredEntries(data: CacheData): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, entry] of Object.entries(data)) {
      if (entry.ttl && (now - entry.timestamp) > entry.ttl) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      delete data[key]
    }
  }

  /**
   * Check if a cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    if (!entry.ttl) {
      return false // No TTL means never expires
    }

    const now = Date.now()
    return (now - entry.timestamp) > entry.ttl
  }

  /**
   * Generate a hash for complex objects to use as cache keys
   */
  private generateHash(obj: any): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64').substring(0, 16)
  }

  /**
   * Set a value in the cache with optional TTL
   */
  set(key: string, value: any, ttlMs?: number): void {
    const data = this.loadCacheData()

    data[key] = {
      value,
      timestamp: Date.now(),
      ttl: ttlMs,
    }

    this.saveCacheData(data)
  }

  /**
   * Get a value from the cache, returns null if not found or expired
   */
  get(key: string): any {
    const data = this.loadCacheData()
    const entry = data[key]

    if (!entry) {
      return null
    }

    if (this.isExpired(entry)) {
      // Clean up expired entry
      delete data[key]
      this.saveCacheData(data)
      return null
    }

    return entry.value
  }

  /**
   * Check if a key exists in the cache and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: string): void {
    const data = this.loadCacheData()
    delete data[key]
    this.saveCacheData(data)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE)
      }
    }
    catch {
      // Ignore errors when clearing cache
    }
  }

  /**
   * Get all keys in the cache (non-expired only)
   */
  keys(): string[] {
    const data = this.loadCacheData()
    return Object.keys(data)
  }

  /**
   * Clean up all expired entries
   */
  cleanup(): void {
    const data = this.loadCacheData()
    this.cleanupExpiredEntries(data)
    this.saveCacheData(data)
  }

  // Convenience methods for common cache patterns

  /**
   * Set a value with TTL in seconds (convenience method)
   */
  setWithTTL(key: string, value: any, ttlSeconds: number): void {
    this.set(key, value, ttlSeconds * 1000)
  }

  /**
   * Set a value that expires after 24 hours (common for update checks)
   */
  setDaily(key: string, value: any): void {
    this.set(key, value, 24 * 60 * 60 * 1000) // 24 hours in ms
  }

  /**
   * Store a complex object using its content hash as key
   */
  setByHash(obj: any, value: any, ttlMs?: number): string {
    const hash = this.generateHash(obj)
    this.set(hash, value, ttlMs)
    return hash
  }

  /**
   * Retrieve a value by its content hash
   */
  getByHash(obj: any): any {
    const hash = this.generateHash(obj)
    return this.get(hash)
  }

  /**
   * Check if an object (by content hash) exists in cache
   */
  hasByHash(obj: any): boolean {
    const hash = this.generateHash(obj)
    return this.has(hash)
  }

  // Legacy compatibility methods for existing cache systems

  /**
   * Update check timestamp (replaces UpdateCheckCache functionality)
   */
  getUpdateCheckTimestamp(): number | null {
    return this.get('updateCheck.lastTimestamp')
  }

  /**
   * Set update check timestamp
   */
  setUpdateCheckTimestamp(timestamp: number, version?: string): void {
    this.set('updateCheck.lastTimestamp', timestamp)
    if (version) {
      this.set('updateCheck.lastVersion', version)
    }
  }

  /**
   * Check if we should perform an update check
   * @param intervalMs - Custom interval in milliseconds (default: 24 hours)
   */
  shouldCheckForUpdates(intervalMs: number = 24 * 60 * 60 * 1000): boolean {
    const lastCheck = this.getUpdateCheckTimestamp()

    if (!lastCheck) {
      return true // Never checked before
    }

    const now = Date.now()
    const timeSinceLastCheck = now - lastCheck

    return timeSinceLastCheck >= intervalMs
  }

  /**
   * Statusline conflict decision storage
   */
  getStatuslineConflictDecision(existingConfig: any, proposedConfig: any): 'replace' | 'keep' | null {
    // Try exact match first
    const combinedKey = `statusline.conflict.${this.generateHash({ existing: existingConfig, proposed: proposedConfig })}`
    let decision = this.get(combinedKey)
    if (decision) {
      return decision.userChoice
    }

    // Try existing config hash
    const existingKey = `statusline.conflict.${this.generateHash(existingConfig)}`
    decision = this.get(existingKey)
    if (decision) {
      return decision.userChoice
    }

    return null
  }

  /**
   * Store statusline conflict decision
   */
  setStatuslineConflictDecision(
    existingConfig: any,
    proposedConfig: any,
    userChoice: 'replace' | 'keep',
  ): void {
    const combinedKey = `statusline.conflict.${this.generateHash({ existing: existingConfig, proposed: proposedConfig })}`

    this.set(combinedKey, {
      userChoice,
      timestamp: Date.now(),
      existingConfig,
      proposedConfig,
    })
  }

  /**
   * Clear statusline conflict decisions
   */
  clearStatuslineConflictDecisions(): void {
    const data = this.loadCacheData()
    const keysToDelete = Object.keys(data).filter(key => key.startsWith('statusline.conflict.'))

    for (const key of keysToDelete) {
      delete data[key]
    }

    this.saveCacheData(data)
  }

  /**
   * Claude installation check (permanent cache - only check once)
   */
  isClaudeInstalled(): boolean | null {
    return this.get('claude.installed')
  }

  /**
   * Set Claude installation status (permanent - no expiration)
   */
  setClaudeInstalled(isInstalled: boolean, version?: string): void {
    this.set('claude.installed', isInstalled) // No TTL = permanent
    if (version) {
      this.set('claude.version', version)
    }
  }

  /**
   * Get cached Claude version
   */
  getClaudeVersion(): string | null {
    return this.get('claude.version')
  }

  /**
   * Clear Claude installation cache (force re-check on next startup)
   */
  clearClaudeInstallationCache(): void {
    this.delete('claude.installed')
    this.delete('claude.version')
  }
}
