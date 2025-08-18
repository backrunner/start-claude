import type { ClaudeConfig, ConfigFile } from './types'
import { ConfigFileManager } from './file-manager'

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

  load(): ConfigFile {
    return this.configFileManager.load()
  }

  async save(config: ConfigFile, skipSync = false): Promise<void> {
    this.configFileManager.save(config)

    // Trigger S3 sync unless explicitly skipped
    if (!skipSync) {
      await this.triggerS3Sync()
    }
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
    const configFile = this.load()

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
    const configFile = this.load()
    const initialLength = configFile.configs.length
    configFile.configs = configFile.configs.filter(c => c.name.toLowerCase() !== name.toLowerCase())

    if (configFile.configs.length < initialLength) {
      await this.save(configFile)
      return true
    }
    return false
  }

  getConfig(name: string): ClaudeConfig | undefined {
    const configFile = this.load()
    return configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())
  }

  getDefaultConfig(): ClaudeConfig | undefined {
    const configFile = this.load()
    return configFile.configs.find(c => c.isDefault)
  }

  async setDefaultConfig(name: string): Promise<boolean> {
    const configFile = this.load()

    configFile.configs.forEach(c => c.isDefault = false)

    const targetConfig = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (targetConfig) {
      targetConfig.isDefault = true
      await this.save(configFile)
      return true
    }
    return false
  }

  listConfigs(): ClaudeConfig[] {
    const configFile = this.load()
    return configFile.configs
  }

  async updateSettings(settings: Partial<ConfigFile['settings']>): Promise<void> {
    const configFile = this.load()
    configFile.settings = { ...configFile.settings, ...settings }
    await this.save(configFile)
  }

  getSettings(): ConfigFile['settings'] {
    const configFile = this.load()
    return configFile.settings
  }

  getConfigFile(): ConfigFile {
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
}
