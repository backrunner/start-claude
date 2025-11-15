import type { CodexConfig, CodexConfigFile, CodexSettings } from './types'
import { randomUUID } from 'node:crypto'
import dayjs from 'dayjs'
import { CodexFileOperations } from './file-operations'

/**
 * Manager for Codex configurations with cloud sync support
 */
export class CodexConfigManager {
  private static instance: CodexConfigManager
  private fileOperations: CodexFileOperations
  private pendingSyncs: Set<Promise<void>> = new Set()

  constructor() {
    this.fileOperations = CodexFileOperations.getInstance()
  }

  static getInstance(): CodexConfigManager {
    if (!CodexConfigManager.instance) {
      CodexConfigManager.instance = new CodexConfigManager()
    }
    return CodexConfigManager.instance
  }

  load(): CodexConfigFile {
    return this.fileOperations.load()
  }

  save(config: CodexConfigFile, skipSync = false): void {
    // Check if content has actually changed to avoid unnecessary syncs
    if (!skipSync) {
      const currentConfig = this.load()
      const hasChanges = this.hasConfigChanges(currentConfig, config)

      if (!hasChanges) {
        // No changes detected, just save without sync
        this.fileOperations.save(config)
        return
      }
    }

    this.fileOperations.save(config)

    // Trigger S3 sync in background unless explicitly skipped
    if (!skipSync) {
      const syncPromise = this.triggerS3Sync()
        .finally(() => {
          this.pendingSyncs.delete(syncPromise)
        })

      this.pendingSyncs.add(syncPromise)
    }
  }

  /**
   * Compare two config files to detect meaningful changes
   */
  private hasConfigChanges(current: CodexConfigFile, updated: CodexConfigFile): boolean {
    const normalizeConfig = (config: CodexConfigFile): Partial<CodexConfigFile> => ({
      ...config,
      version: undefined,
    })

    const currentNormalized = normalizeConfig(current)
    const updatedNormalized = normalizeConfig(updated)

    return JSON.stringify(currentNormalized) !== JSON.stringify(updatedNormalized)
  }

  private async triggerS3Sync(): Promise<void> {
    try {
      // Lazy import to avoid circular dependency
      const { CodexS3SyncManager } = await import('../storage/s3-sync')
      const s3SyncManager = CodexS3SyncManager.getInstance()

      // Only sync if S3 is configured
      if (await s3SyncManager.isS3Configured()) {
        await s3SyncManager.autoUploadAfterChange()
      }
    }
    catch (error) {
      // Silent fail for auto-sync, but log for debugging
      console.error('Codex S3 sync failed:', error)
    }
  }

  /**
   * Wait for all pending S3 sync operations to complete
   */
  async waitForPendingSyncs(timeout = 10000): Promise<void> {
    if (this.pendingSyncs.size === 0) {
      return
    }

    console.log(`[CodexConfigManager] Waiting for ${this.pendingSyncs.size} pending S3 sync operations...`)

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn(`[CodexConfigManager] Timeout waiting for S3 syncs after ${timeout}ms`)
        resolve()
      }, timeout)
    })

    const allSyncsPromise = Promise.all(Array.from(this.pendingSyncs))
      .then(() => {
        console.log('[CodexConfigManager] All pending S3 syncs completed')
      })
      .catch((error) => {
        console.error('[CodexConfigManager] Error in pending S3 syncs:', error)
      })

    await Promise.race([allSyncsPromise, timeoutPromise])
  }

  /**
   * Check if there are any pending sync operations
   */
  hasPendingSyncs(): boolean {
    return this.pendingSyncs.size > 0
  }

  /**
   * Add or update a configuration
   */
  addConfig(config: CodexConfig): void {
    const configFile = this.load()

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
      existingIndex = configFile.configs.findIndex(c => c.name.toLowerCase() === config.name.toLowerCase())
    }

    if (existingIndex >= 0) {
      // Update existing config while preserving UUID
      const existingConfig = configFile.configs[existingIndex]
      configFile.configs[existingIndex] = {
        ...config,
        id: existingConfig.id || config.id,
      }
    }
    else {
      configFile.configs.push(config)
    }

    this.save(configFile)
  }

  /**
   * Remove configuration by name (soft delete)
   */
  removeConfig(name: string): boolean {
    const configFile = this.load()
    const targetConfig = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())

    if (!targetConfig) {
      return false
    }

    // Mark config as deleted (tombstone approach)
    targetConfig.isDeleted = true
    targetConfig.deletedAt = dayjs().format('YYYY-MM-DD HH:mm:ss')

    // Clear sensitive data from deleted config
    delete targetConfig.apiKey

    this.save(configFile)
    return true
  }

  /**
   * Remove configuration by UUID (soft delete)
   */
  removeConfigById(id: string): boolean {
    const configFile = this.load()
    const targetConfig = configFile.configs.find(c => c.id === id)

    if (!targetConfig) {
      return false
    }

    // Mark config as deleted (tombstone approach)
    targetConfig.isDeleted = true
    targetConfig.deletedAt = dayjs().format('YYYY-MM-DD HH:mm:ss')

    // Clear sensitive data from deleted config
    delete targetConfig.apiKey

    this.save(configFile)
    return true
  }

  /**
   * Get configuration by name
   */
  getConfig(name: string): CodexConfig | undefined {
    const configFile = this.load()
    const config = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())
    return config?.isDeleted ? undefined : config
  }

  /**
   * Get configuration by UUID
   */
  getConfigById(id: string): CodexConfig | undefined {
    const configFile = this.load()
    const config = configFile.configs.find(c => c.id === id)
    return config?.isDeleted ? undefined : config
  }

  /**
   * Get the default configuration
   */
  getDefaultConfig(): CodexConfig | undefined {
    const configFile = this.load()
    const config = configFile.configs.find(c => c.isDefault && !c.isDeleted)
    return config
  }

  /**
   * Set default configuration by name
   */
  setDefaultConfig(name: string): boolean {
    const configFile = this.load()

    configFile.configs.forEach(c => c.isDefault = false)

    const targetConfig = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase() && !c.isDeleted)
    if (targetConfig) {
      targetConfig.isDefault = true
      this.save(configFile)
      return true
    }
    return false
  }

  /**
   * Set default configuration by UUID
   */
  setDefaultConfigById(id: string): boolean {
    const configFile = this.load()

    configFile.configs.forEach(c => c.isDefault = false)

    const targetConfig = configFile.configs.find(c => c.id === id && !c.isDeleted)
    if (targetConfig) {
      targetConfig.isDefault = true
      this.save(configFile)
      return true
    }
    return false
  }

  /**
   * List all non-deleted configurations
   */
  listConfigs(): CodexConfig[] {
    const configFile = this.load()
    return configFile.configs.filter(c => !c.isDeleted)
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<CodexSettings>, skipSync = false): void {
    const configFile = this.load()
    configFile.settings = { ...configFile.settings, ...settings }
    this.save(configFile, skipSync)
  }

  /**
   * Get current settings
   */
  getSettings(): CodexSettings {
    const configFile = this.load()
    return configFile.settings
  }

  /**
   * Get entire config file
   */
  getConfigFile(): CodexConfigFile {
    return this.load()
  }

  /**
   * Save entire config file
   */
  saveConfigFile(configFile: CodexConfigFile, skipSync = false): void {
    this.save(configFile, skipSync)
  }

  /**
   * Permanently delete a config (cleanup tombstone)
   */
  cleanupDeletedConfig(name: string): boolean {
    const configFile = this.load()
    const initialLength = configFile.configs.length

    configFile.configs = configFile.configs.filter(c =>
      !(c.isDeleted && c.name.toLowerCase() === name.toLowerCase()),
    )

    if (configFile.configs.length < initialLength) {
      this.save(configFile)
      return true
    }
    return false
  }

  /**
   * Permanently delete a config by UUID
   */
  cleanupDeletedConfigById(id: string): boolean {
    const configFile = this.load()
    const initialLength = configFile.configs.length

    configFile.configs = configFile.configs.filter(c =>
      !(c.isDeleted && c.id === id),
    )

    if (configFile.configs.length < initialLength) {
      this.save(configFile)
      return true
    }
    return false
  }

  /**
   * Get file operations instance (for path access)
   */
  getFileOperations(): CodexFileOperations {
    return this.fileOperations
  }
}
