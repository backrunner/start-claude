import type {
  ExternalProductConfig,
  ExternalProductConfigFile,
  ExternalProductId,
  ExternalProductSettings,
} from './types'
import { randomUUID } from 'node:crypto'
import dayjs from 'dayjs'
import { configNamesMatch, findConfigByName, findNameConflict, getNameConflictMessage } from '../config/name-utils'
import { ExternalProductFileOperations } from './file-operations'

export class ExternalProductConfigManager {
  private static instances = new Map<ExternalProductId, ExternalProductConfigManager>()
  private readonly fileOperations: ExternalProductFileOperations

  private constructor(productId: ExternalProductId) {
    this.fileOperations = ExternalProductFileOperations.getInstance(productId)
  }

  static getInstance(productId: ExternalProductId): ExternalProductConfigManager {
    const existing = ExternalProductConfigManager.instances.get(productId)
    if (existing) {
      return existing
    }

    const instance = new ExternalProductConfigManager(productId)
    ExternalProductConfigManager.instances.set(productId, instance)
    return instance
  }

  load(): ExternalProductConfigFile {
    return this.fileOperations.load()
  }

  save(configFile: ExternalProductConfigFile): void {
    this.fileOperations.save(configFile)
  }

  addConfig(config: ExternalProductConfig): void {
    const configFile = this.load()
    const normalizedConfig = {
      ...config,
      id: config.id || randomUUID(),
      enabled: config.enabled ?? true,
      authMode: config.authMode || 'api-key',
    }

    let existingIndex = -1
    if (normalizedConfig.id) {
      existingIndex = configFile.configs.findIndex(item => item.id === normalizedConfig.id)
    }
    if (existingIndex === -1) {
      existingIndex = configFile.configs.findIndex(item => configNamesMatch(item.name, normalizedConfig.name))
    }

    let savedConfigId = normalizedConfig.id

    if (existingIndex >= 0) {
      const existingConfig = configFile.configs[existingIndex]
      savedConfigId = existingConfig.id || normalizedConfig.id

      if (!configNamesMatch(existingConfig.name, normalizedConfig.name)) {
        const activeConfigs = configFile.configs.filter(item => !item.isDeleted)
        const conflict = findNameConflict(activeConfigs, normalizedConfig.name, existingConfig)
        if (conflict) {
          throw new Error(getNameConflictMessage(normalizedConfig.name, conflict.name))
        }
      }

      configFile.configs[existingIndex] = {
        ...normalizedConfig,
        id: savedConfigId,
      }
    }
    else {
      const activeConfigs = configFile.configs.filter(item => !item.isDeleted)
      const conflict = findNameConflict(activeConfigs, normalizedConfig.name)
      if (conflict) {
        throw new Error(getNameConflictMessage(normalizedConfig.name, conflict.name))
      }

      configFile.configs.push(normalizedConfig)
    }

    if (normalizedConfig.isDefault) {
      configFile.configs.forEach((item) => {
        item.isDefault = item.id === savedConfigId
      })
    }

    this.save(configFile)
  }

  removeConfig(name: string): boolean {
    const configFile = this.load()
    const targetConfig = findConfigByName(configFile.configs, name)
    if (!targetConfig) {
      return false
    }

    targetConfig.isDeleted = true
    targetConfig.deletedAt = dayjs().format('YYYY-MM-DD HH:mm:ss')
    delete targetConfig.apiKey

    this.save(configFile)
    return true
  }

  removeConfigById(id: string): boolean {
    const configFile = this.load()
    const targetConfig = configFile.configs.find(item => item.id === id)
    if (!targetConfig) {
      return false
    }

    targetConfig.isDeleted = true
    targetConfig.deletedAt = dayjs().format('YYYY-MM-DD HH:mm:ss')
    delete targetConfig.apiKey

    this.save(configFile)
    return true
  }

  getConfig(name: string): ExternalProductConfig | undefined {
    const config = findConfigByName(this.load().configs, name)
    return config?.isDeleted ? undefined : config
  }

  getConfigById(id: string): ExternalProductConfig | undefined {
    const config = this.load().configs.find(item => item.id === id)
    return config?.isDeleted ? undefined : config
  }

  getDefaultConfig(): ExternalProductConfig | undefined {
    return this.load().configs.find(item => item.isDefault && !item.isDeleted)
  }

  setDefaultConfig(name: string): boolean {
    const configFile = this.load()
    const targetConfig = findConfigByName(configFile.configs.filter(item => !item.isDeleted), name)
    if (!targetConfig) {
      return false
    }

    configFile.configs.forEach((item) => {
      item.isDefault = item.id === targetConfig.id
    })
    this.save(configFile)
    return true
  }

  listConfigs(): ExternalProductConfig[] {
    return this.load().configs.filter(item => !item.isDeleted)
  }

  updateSettings(settings: Partial<ExternalProductSettings>): void {
    const configFile = this.load()
    configFile.settings = { ...configFile.settings, ...settings }
    this.save(configFile)
  }

  getSettings(): ExternalProductSettings {
    return this.load().settings
  }

  getConfigFile(): ExternalProductConfigFile {
    return this.load()
  }

  saveConfigFile(configFile: ExternalProductConfigFile): void {
    this.save(configFile)
  }

  getFileOperations(): ExternalProductFileOperations {
    return this.fileOperations
  }
}
