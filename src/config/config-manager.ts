import type { ClaudeConfig, ConfigFile } from './types'
import { ConfigFileManager } from './file-operations'

export class ConfigManager {
  private autoSyncCallback?: () => Promise<void>
  private configFileManager: ConfigFileManager
  private configCache: ConfigFile | null = null

  constructor() {
    // Auto-sync callback will be set by S3SyncManager when needed
    this.configFileManager = ConfigFileManager.getInstance()
  }

  setAutoSyncCallback(callback: (() => Promise<void>) | null): void {
    this.autoSyncCallback = callback || undefined
  }

  async load(): Promise<ConfigFile> {
    this.configCache = await this.configFileManager.load()
    return this.configCache
  }

  save(config: ConfigFile): void {
    this.configFileManager.save(config)
    this.configCache = config

    // Trigger auto-sync if callback is set
    if (this.autoSyncCallback) {
      // Run async without blocking
      this.autoSyncCallback().catch((error) => {
        console.error('Auto-sync failed:', error)
      })
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

    this.save(configFile)
  }

  async removeConfig(name: string): Promise<boolean> {
    const configFile = await this.load()
    const initialLength = configFile.configs.length
    configFile.configs = configFile.configs.filter(c => c.name.toLowerCase() !== name.toLowerCase())

    if (configFile.configs.length < initialLength) {
      this.save(configFile)
      return true
    }
    return false
  }

  async getConfig(name: string): Promise<ClaudeConfig | undefined> {
    const configFile = await this.load()
    return configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())
  }

  async getDefaultConfig(): Promise<ClaudeConfig | undefined> {
    const configFile = await this.load()
    return configFile.configs.find(c => c.isDefault)
  }

  async setDefaultConfig(name: string): Promise<boolean> {
    const configFile = await this.load()

    configFile.configs.forEach(c => c.isDefault = false)

    const targetConfig = configFile.configs.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (targetConfig) {
      targetConfig.isDefault = true
      this.save(configFile)
      return true
    }
    return false
  }

  async listConfigs(): Promise<ClaudeConfig[]> {
    const configFile = await this.load()
    return configFile.configs
  }

  async updateSettings(settings: Partial<ConfigFile['settings']>): Promise<void> {
    const configFile = await this.load()
    configFile.settings = { ...configFile.settings, ...settings }
    this.save(configFile)
  }

  async getSettings(): Promise<ConfigFile['settings']> {
    const configFile = await this.load()
    return configFile.settings
  }

  async getConfigFile(): Promise<ConfigFile> {
    return this.load()
  }

  saveConfigFile(configFile: ConfigFile): void {
    this.save(configFile)
  }
}
