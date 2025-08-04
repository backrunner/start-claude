import type { ClaudeConfig, ConfigFile } from './types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CONFIG_DIR = path.join(os.homedir(), '.start-claude')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export class ConfigManager {
  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
  }

  private getDefaultConfigFile(): ConfigFile {
    return {
      configs: [],
      settings: {
        overrideClaudeCommand: false,
      },
    }
  }

  load(): ConfigFile {
    this.ensureConfigDir()

    if (!fs.existsSync(CONFIG_FILE)) {
      const defaultConfig = this.getDefaultConfigFile()
      this.save(defaultConfig)
      return defaultConfig
    }

    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const config = JSON.parse(content) as ConfigFile

      if (config.configs === undefined)
        config.configs = []
      if (config.settings === undefined)
        config.settings = { overrideClaudeCommand: false }

      return config
    }
    catch (error) {
      console.error('Error loading config:', error)
      return this.getDefaultConfigFile()
    }
  }

  save(config: ConfigFile): void {
    this.ensureConfigDir()
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
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
