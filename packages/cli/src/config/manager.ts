import type { ClaudeConfig, ConfigFile } from './types'
import { randomUUID } from 'node:crypto'
import dayjs from 'dayjs'
import { S3SyncManager } from '../storage/s3-sync'
import { ConfigFileManager } from './file-operations'
import { configNamesMatch, findConfigByName, findNameConflict, getNameConflictMessage } from './name-utils'

export class ConfigManager {
  private static instance: ConfigManager
  private configFileManager: ConfigFileManager
  private pendingSyncs: Set<Promise<void>> = new Set()

  constructor() {
    this.configFileManager = ConfigFileManager.getInstance()
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  async load(): Promise<ConfigFile> {
    return this.configFileManager.load()
  }

  async save(config: ConfigFile, skipSync = false): Promise<void> {
    // Check if content has actually changed to avoid unnecessary syncs
    if (!skipSync) {
      const currentConfig = await this.load()
      const hasChanges = this.hasConfigChanges(currentConfig, config)

      if (!hasChanges) {
        // No changes detected, just save without sync
        this.configFileManager.save(config)
        return
      }
    }

    this.configFileManager.save(config)

    // Trigger S3 sync in background unless explicitly skipped
    // Track the sync promise to enable graceful shutdown
    if (!skipSync) {
      const syncPromise = this.triggerS3Sync()
        .finally(() => {
          // Remove from pending syncs when complete
          this.pendingSyncs.delete(syncPromise)
        })

      this.pendingSyncs.add(syncPromise)
    }
  }

  /**
   * Compare two config files to detect meaningful changes
   * Excludes version field and other auto-generated fields from comparison
   */
  private hasConfigChanges(current: ConfigFile, updated: ConfigFile): boolean {
    // Create normalized copies for comparison (exclude auto-generated fields)
    const normalizeConfig = (config: ConfigFile): Partial<ConfigFile> => ({
      ...config,
      // Exclude fields that don't represent user changes
      version: undefined,
    })

    const currentNormalized = normalizeConfig(current)
    const updatedNormalized = normalizeConfig(updated)

    // Deep comparison of the config objects
    return JSON.stringify(currentNormalized) !== JSON.stringify(updatedNormalized)
  }

  private async triggerS3Sync(): Promise<void> {
    try {
      const s3SyncManager = S3SyncManager.getInstance()

      // Only sync if S3 is configured
      if (await s3SyncManager.isS3Configured()) {
        await s3SyncManager.autoUploadAfterChange()
      }
    }
    catch (error) {
      // Silent fail for auto-sync, but log for debugging
      console.error('S3 sync failed:', error)
    }
  }

  /**
   * Wait for all pending S3 sync operations to complete
   * @param timeout Maximum time to wait in milliseconds (default: 10 seconds)
   * @returns Promise that resolves when all syncs are complete or timeout is reached
   */
  async waitForPendingSyncs(timeout = 10000): Promise<void> {
    if (this.pendingSyncs.size === 0) {
      return
    }

    console.log(`[ConfigManager] Waiting for ${this.pendingSyncs.size} pending S3 sync operations...`)

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn(`[ConfigManager] Timeout waiting for S3 syncs after ${timeout}ms`)
        resolve()
      }, timeout)
    })

    const allSyncsPromise = Promise.all(Array.from(this.pendingSyncs))
      .then(() => {
        console.log('[ConfigManager] All pending S3 syncs completed')
      })
      .catch((error) => {
        console.error('[ConfigManager] Error in pending S3 syncs:', error)
      })

    await Promise.race([allSyncsPromise, timeoutPromise])
  }

  /**
   * Check if there are any pending sync operations
   */
  hasPendingSyncs(): boolean {
    return this.pendingSyncs.size > 0
  }

  async addConfig(config: ClaudeConfig): Promise<void> {
    const configFile = await this.load()

    // Ensure the config has a UUID
    if (!config.id) {
      config.id = randomUUID()
    }

    // When updating, prefer to match by UUID if available, otherwise fall back to name
    let existingIndex = -1
    if (config.id) {
      existingIndex = configFile.configs.findIndex(c => c.id === config.id)
    }
    if (existingIndex === -1) {
      // Use flexible name matching (case-insensitive, space/hyphen equivalent)
      existingIndex = configFile.configs.findIndex(c => configNamesMatch(c.name, config.name))
    }

    if (existingIndex >= 0) {
      // Update existing config while preserving UUID
      const existingConfig = configFile.configs[existingIndex]

      // If updating and name changed, check for conflicts with other active configs
      if (!configNamesMatch(existingConfig.name, config.name)) {
        const activeConfigs = configFile.configs.filter(c => !c.isDeleted)
        const conflict = findNameConflict(activeConfigs, config.name, existingConfig)
        if (conflict) {
          throw new Error(getNameConflictMessage(config.name, conflict.name))
        }
      }

      configFile.configs[existingIndex] = {
        ...config,
        id: existingConfig.id || config.id, // Preserve existing UUID if present
      }
    }
    else {
      // Adding new config - check for name conflicts (only with active configs, not deleted ones)
      const activeConfigs = configFile.configs.filter(c => !c.isDeleted)
      const conflict = findNameConflict(activeConfigs, config.name)
      if (conflict) {
        throw new Error(getNameConflictMessage(config.name, conflict.name))
      }
      configFile.configs.push(config)
    }

    await this.save(configFile)
  }

  async removeConfig(name: string): Promise<boolean> {
    const configFile = await this.load()
    // Use flexible name matching
    const targetConfig = findConfigByName(configFile.configs, name)

    if (!targetConfig) {
      return false
    }

    // Mark config as deleted (tombstone approach)
    targetConfig.isDeleted = true
    targetConfig.deletedAt = dayjs().format('YYYY-MM-DD HH:mm:ss')

    // Clear sensitive data from deleted config
    delete targetConfig.apiKey

    await this.save(configFile)
    return true
  }

  /**
   * Remove configuration by UUID - preferred method for unique identification
   */
  async removeConfigById(id: string): Promise<boolean> {
    const configFile = await this.load()
    const targetConfig = configFile.configs.find(c => c.id === id)

    if (!targetConfig) {
      return false
    }

    // Mark config as deleted (tombstone approach)
    targetConfig.isDeleted = true
    targetConfig.deletedAt = dayjs().format('YYYY-MM-DD HH:mm:ss')

    // Clear sensitive data from deleted config
    delete targetConfig.apiKey

    await this.save(configFile)
    return true
  }

  async getConfig(name: string): Promise<ClaudeConfig | undefined> {
    const configFile = await this.load()
    // Use flexible name matching (supports "my api" and "my-api" as equivalent)
    const config = findConfigByName(configFile.configs, name)
    return config?.isDeleted ? undefined : config
  }

  /**
   * Get configuration by UUID - preferred method for unique identification
   */
  async getConfigById(id: string): Promise<ClaudeConfig | undefined> {
    const configFile = await this.load()
    const config = configFile.configs.find(c => c.id === id)
    return config?.isDeleted ? undefined : config
  }

  async getDefaultConfig(): Promise<ClaudeConfig | undefined> {
    const configFile = await this.load()
    const config = configFile.configs.find(c => c.isDefault && !c.isDeleted)
    return config
  }

  async setDefaultConfig(name: string): Promise<boolean> {
    const configFile = await this.load()

    configFile.configs.forEach(c => c.isDefault = false)

    // Use flexible name matching
    const targetConfig = findConfigByName(
      configFile.configs.filter(c => !c.isDeleted),
      name,
    )
    if (targetConfig) {
      targetConfig.isDefault = true
      await this.save(configFile)
      return true
    }
    return false
  }

  /**
   * Set default configuration by UUID - preferred method for unique identification
   */
  async setDefaultConfigById(id: string): Promise<boolean> {
    const configFile = await this.load()

    configFile.configs.forEach(c => c.isDefault = false)

    const targetConfig = configFile.configs.find(c => c.id === id && !c.isDeleted)
    if (targetConfig) {
      targetConfig.isDefault = true
      await this.save(configFile)
      return true
    }
    return false
  }

  async listConfigs(): Promise<ClaudeConfig[]> {
    const configFile = await this.load()
    return configFile.configs.filter(c => !c.isDeleted)
  }

  async updateSettings(settings: Partial<ConfigFile['settings']>, skipSync = false): Promise<void> {
    const configFile = await this.load()
    configFile.settings = { ...configFile.settings, ...settings }
    await this.save(configFile, skipSync)
  }

  async getSettings(): Promise<ConfigFile['settings']> {
    const configFile = await this.load()
    return configFile.settings
  }

  async getConfigFile(): Promise<ConfigFile> {
    return this.load()
  }

  async saveConfigFile(configFile: ConfigFile, skipSync = false): Promise<void> {
    await this.save(configFile, skipSync)
  }

  async initializeS3Sync(): Promise<void> {
    try {
      // Lazy import to avoid circular dependency at module level
      const { S3SyncManager } = await import('../storage/s3-sync')
      const s3SyncManager = S3SyncManager.getInstance()

      // Check if S3 is configured and perform initial sync if needed
      if (await s3SyncManager.isS3Configured()) {
        // Perform any initial S3 sync operations if necessary
        // This is a no-op for now but provides a hook for future initialization
      }
    }
    catch (error) {
      // Silent fail for initialization, but log for debugging
      console.error('S3 sync initialization failed:', error)
    }
  }

  /**
   * Permanently delete a config (cleanup tombstone)
   * Prefers UUID matching, falls back to name for legacy configs
   */
  async cleanupDeletedConfig(name: string): Promise<boolean> {
    const configFile = await this.load()
    const initialLength = configFile.configs.length

    // Find the config to cleanup (prefer by name since this is called from CLI)
    // Use flexible name matching
    const targetConfig = findConfigByName(
      configFile.configs.filter(c => c.isDeleted),
      name,
    )

    if (!targetConfig) {
      return false
    }

    // Remove by UUID if available, otherwise by name
    configFile.configs = configFile.configs.filter(c =>
      targetConfig.id ? c.id !== targetConfig.id : !configNamesMatch(c.name, name) || !c.isDeleted,
    )

    if (configFile.configs.length < initialLength) {
      await this.save(configFile)
      return true
    }
    return false
  }

  /**
   * Restore a deleted config
   * Prefers UUID matching, falls back to name for legacy configs
   */
  async restoreConfig(name: string): Promise<boolean> {
    const configFile = await this.load()

    // Find the deleted config by name using flexible matching
    const config = findConfigByName(
      configFile.configs.filter(c => c.isDeleted),
      name,
    )

    if (!config) {
      return false // Not found or not deleted
    }

    // Check if restoring would cause a conflict with active configs
    const conflict = findNameConflict(
      configFile.configs.filter(c => !c.isDeleted),
      config.name,
    )
    if (conflict) {
      throw new Error(getNameConflictMessage(config.name, conflict.name))
    }

    // Restore the config (UUID is preserved automatically)
    config.isDeleted = false
    delete config.deletedAt

    await this.save(configFile)
    return true
  }

  /**
   * Restore a deleted config by UUID - preferred method for unique identification
   */
  async restoreConfigById(id: string): Promise<boolean> {
    const configFile = await this.load()

    const config = configFile.configs.find(c => c.id === id && c.isDeleted)

    if (!config) {
      return false // Not found or not deleted
    }

    // Restore the config
    config.isDeleted = false
    delete config.deletedAt

    await this.save(configFile)
    return true
  }

  /**
   * Permanently delete a config by UUID (cleanup tombstone)
   */
  async cleanupDeletedConfigById(id: string): Promise<boolean> {
    const configFile = await this.load()
    const initialLength = configFile.configs.length

    configFile.configs = configFile.configs.filter(c => c.id !== id || !c.isDeleted)

    if (configFile.configs.length < initialLength) {
      await this.save(configFile)
      return true
    }
    return false
  }

  /**
   * Clean up old deleted configs (older than specified days)
   */
  async cleanupOldDeletions(daysOld = 30): Promise<number> {
    const configFile = await this.load()
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
    const initialLength = configFile.configs.length

    configFile.configs = configFile.configs.filter((config) => {
      if (!config.isDeleted || !config.deletedAt) {
        return true // Keep non-deleted configs
      }
      return new Date(config.deletedAt) > cutoffDate // Keep recent deletions
    })

    const cleaned = initialLength - configFile.configs.length
    if (cleaned > 0) {
      await this.save(configFile)
    }

    return cleaned
  }

  /**
   * Get list of deleted configs
   */
  async getDeletedConfigs(): Promise<ClaudeConfig[]> {
    const configFile = await this.load()
    return configFile.configs.filter(c => c.isDeleted)
  }

  /**
   * Check if an immediate update is needed due to outdated CLI
   */
  needsImmediateUpdate(): boolean {
    return this.configFileManager.needsImmediateUpdate()
  }

  /**
   * Reset the immediate update flag (for testing)
   */
  resetImmediateUpdateFlag(): void {
    this.configFileManager.resetImmediateUpdateFlag()
  }
}
