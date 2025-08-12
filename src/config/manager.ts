import type { ClaudeConfig, ConfigFile } from './types'
import { ConfigFileManager } from './file-manager'

export class ConfigManager {
  private autoSyncCallback?: () => Promise<void>
  private configFileManager: ConfigFileManager

  constructor() {
    // Auto-sync callback will be set by S3SyncManager when needed
    this.configFileManager = ConfigFileManager.getInstance()
  }

  setAutoSyncCallback(callback: (() => Promise<void>) | null): void {
    this.autoSyncCallback = callback || undefined
  }

  load(): ConfigFile {
    return this.configFileManager.load()
  }

  save(config: ConfigFile): void {
    this.configFileManager.save(config)

    // Trigger auto-sync if callback is set
    if (this.autoSyncCallback) {
      // Run async without blocking
      this.autoSyncCallback().catch((error) => {
        console.error('Auto-sync failed:', error)
      })
    }
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
