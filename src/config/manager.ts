import type { ClaudeConfig, ConfigFile } from './types'
import { ConfigFileManager } from './file-manager'

// Lazy import to avoid circular dependency
let S3SyncManager: any = null

export class ConfigManager {
  private static instance: ConfigManager
  private autoSyncCallback?: () => Promise<void>
  private configFileManager: ConfigFileManager
  private s3SyncInitialized = false

  constructor() {
    this.configFileManager = ConfigFileManager.getInstance()
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  /**
   * Initialize S3 sync if configured
   * This should be called once at application startup
   */
  async initializeS3Sync(): Promise<void> {
    if (this.s3SyncInitialized) {
      return
    }

    try {
      // Lazy import to avoid circular dependency
      if (!S3SyncManager) {
        const module = await import('../storage/s3-sync')
        S3SyncManager = module.S3SyncManager
      }

      // Check if S3 is configured
      const settings = this.getSettings()
      if (settings.s3Sync) {
        // Get S3SyncManager singleton instance which will set up the auto-sync callback
        S3SyncManager.getInstance()
        this.s3SyncInitialized = true
      }
    }
    catch (error) {
      console.error('Failed to initialize S3 sync:', error)
    }
  }

  setAutoSyncCallback(callback: (() => Promise<void>) | null): void {
    this.autoSyncCallback = callback || undefined
  }

  private async triggerAutoSync(): Promise<void> {
    if (this.autoSyncCallback) {
      // Run async without blocking
      this.autoSyncCallback().catch((error) => {
        console.error('Auto-sync failed:', error)
      })
    }
  }

  load(): ConfigFile {
    return this.configFileManager.load()
  }

  save(config: ConfigFile): void {
    this.configFileManager.save(config)
    // Trigger auto-sync after save
    void this.triggerAutoSync()
  }

  addConfig(config: ClaudeConfig): void {
    const configFile = this.load()

    const existingIndex = configFile.configs.findIndex(c => c.name.toLowerCase() === config.name.toLowerCase())
    if (existingIndex >= 0) {
      configFile.configs[existingIndex] = config
    }
    else {
      configFile.configs.push(config)
    }

    this.save(configFile)
  }

  removeConfig(name: string): boolean {
    const configFile = this.load()
    const initialLength = configFile.configs.length
    configFile.configs = configFile.configs.filter(c => c.name.toLowerCase() !== name.toLowerCase())

    if (configFile.configs.length < initialLength) {
      this.save(configFile)
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

  setDefaultConfig(name: string): boolean {
    const configFile = this.load()

    configFile.configs.forEach(c => c.isDefault = false)

    const targetConfig = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (targetConfig) {
      targetConfig.isDefault = true
      this.save(configFile)
      return true
    }
    return false
  }

  listConfigs(): ClaudeConfig[] {
    const configFile = this.load()
    return configFile.configs
  }

  updateSettings(settings: Partial<ConfigFile['settings']>): void {
    const configFile = this.load()
    configFile.settings = { ...configFile.settings, ...settings }
    this.save(configFile)
  }

  getSettings(): ConfigFile['settings'] {
    const configFile = this.load()
    return configFile.settings
  }

  getConfigFile(): ConfigFile {
    return this.load()
  }

  saveConfigFile(configFile: ConfigFile): void {
    this.save(configFile)
  }
}
