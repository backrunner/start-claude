import type { ClaudeConfig, ConfigFile } from './types'
import dayjs from 'dayjs'
import { ConfigFileManager } from './file-operations'

export class ConfigManager {
  private static instance: ConfigManager
  private configFileManager: ConfigFileManager

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

    // Trigger S3 sync unless explicitly skipped
    if (!skipSync) {
      await this.triggerS3Sync()
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
      // Lazy import to avoid circular dependency at module level
      const { S3SyncManager } = await import('../storage/s3-sync')
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

  async addConfig(config: ClaudeConfig): Promise<void> {
    const configFile = await this.load()

    const existingIndex = configFile.configs.findIndex(c => c.name.toLowerCase() === config.name.toLowerCase())
    if (existingIndex >= 0) {
      configFile.configs[existingIndex] = config
    }
    else {
      configFile.configs.push(config)
    }

    await this.save(configFile)
  }

  async removeConfig(name: string): Promise<boolean> {
    const configFile = await this.load()
    const targetConfig = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())

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
    const config = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())
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

    const targetConfig = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase() && !c.isDeleted)
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
   */
  async cleanupDeletedConfig(name: string): Promise<boolean> {
    const configFile = await this.load()
    const initialLength = configFile.configs.length

    configFile.configs = configFile.configs.filter(c =>
      c.name.toLowerCase() !== name.toLowerCase() || !c.isDeleted,
    )

    if (configFile.configs.length < initialLength) {
      await this.save(configFile)
      return true
    }
    return false
  }

  /**
   * Restore a deleted config
   */
  async restoreConfig(name: string): Promise<boolean> {
    const configFile = await this.load()

    const config = configFile.configs.find(c =>
      c.name.toLowerCase() === name.toLowerCase() && c.isDeleted,
    )

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
