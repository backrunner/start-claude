import type { ExternalProductConfig, ExternalProductConfigFile, ExternalProductId } from './types'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { UILogger } from '../utils/cli/ui'
import { getProductDefinition } from './registry'
import { CURRENT_EXTERNAL_PRODUCT_CONFIG_VERSION } from './types'

export class ExternalProductFileOperations {
  private static instances = new Map<ExternalProductId, ExternalProductFileOperations>()
  private readonly productId: ExternalProductId

  private constructor(productId: ExternalProductId) {
    this.productId = productId
    this.ensureConfigDir()
  }

  static getInstance(productId: ExternalProductId): ExternalProductFileOperations {
    const existing = ExternalProductFileOperations.instances.get(productId)
    if (existing) {
      return existing
    }

    const instance = new ExternalProductFileOperations(productId)
    ExternalProductFileOperations.instances.set(productId, instance)
    return instance
  }

  private get definition() {
    return getProductDefinition(this.productId)
  }

  private get configDir(): string {
    return path.join(os.homedir(), this.definition.configDirName)
  }

  private get syncConfigPath(): string {
    return path.join(this.configDir, 'sync.json')
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true })
    }
  }

  private getDefaultConfigFile(): ExternalProductConfigFile {
    return {
      version: CURRENT_EXTERNAL_PRODUCT_CONFIG_VERSION,
      configs: [],
      settings: {},
    }
  }

  getActualConfigDir(configFile?: ExternalProductConfigFile): string {
    const syncConfig = configFile?.settings.sync || this.readSyncPointer()
    const cloudPath = syncConfig?.customPath || syncConfig?.cloudPath

    if (syncConfig?.enabled && cloudPath) {
      return path.join(cloudPath, this.definition.configDirName)
    }

    return this.configDir
  }

  getActualConfigPath(): string {
    return path.join(this.getActualConfigDir(), 'config.json')
  }

  exists(): boolean {
    return fs.existsSync(this.getActualConfigPath())
  }

  load(): ExternalProductConfigFile {
    if (!this.exists()) {
      const defaultConfig = this.getDefaultConfigFile()
      this.save(defaultConfig)
      return defaultConfig
    }

    try {
      const actualPath = this.getActualConfigPath()
      const rawConfig = JSON.parse(fs.readFileSync(actualPath, 'utf-8')) as Partial<ExternalProductConfigFile>
      const normalized = this.validateAndNormalize(rawConfig)

      const hadMissingUUIDs = rawConfig.configs?.some(config => !config.id) ?? false
      if (hadMissingUUIDs) {
        this.save(normalized)
      }

      return normalized
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayWarning(`Error loading ${this.definition.shortTitle} config file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.displayInfo(`Creating new ${this.definition.shortTitle} configuration file...`)

      if (this.exists()) {
        const actualPath = this.getActualConfigPath()
        const backupPath = `${actualPath}.backup.${Date.now()}`
        fs.copyFileSync(actualPath, backupPath)
        logger.displayInfo(`Corrupted config backed up to: ${backupPath}`)
      }

      const defaultConfig = this.getDefaultConfigFile()
      this.save(defaultConfig)
      return defaultConfig
    }
  }

  save(config: ExternalProductConfigFile): void {
    try {
      const actualConfigDir = this.getActualConfigDir(config)
      if (!fs.existsSync(actualConfigDir)) {
        fs.mkdirSync(actualConfigDir, { recursive: true })
      }

      this.writeSyncPointer(config)
      fs.writeFileSync(path.join(actualConfigDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8')
    }
    catch (error) {
      new UILogger().displayError(`Error saving ${this.definition.shortTitle} config file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  getConfigDir(): string {
    return this.configDir
  }

  getConfigPath(): string {
    return path.join(this.configDir, 'config.json')
  }

  private validateAndNormalize(config: Partial<ExternalProductConfigFile>): ExternalProductConfigFile {
    return {
      version: config.version || CURRENT_EXTERNAL_PRODUCT_CONFIG_VERSION,
      configs: Array.isArray(config.configs)
        ? config.configs.map(item => this.normalizeConfig(item))
        : [],
      settings: config.settings && typeof config.settings === 'object'
        ? config.settings
        : {},
    }
  }

  private normalizeConfig(config: ExternalProductConfig): ExternalProductConfig {
    return {
      ...config,
      id: config.id || randomUUID(),
      authMode: config.authMode || 'api-key',
      apiKeyEnvVar: config.apiKeyEnvVar || this.definition.defaultApiKeyEnvVar,
      enabled: config.enabled ?? true,
      isDefault: config.isDefault ?? false,
      order: config.order ?? 0,
      isDeleted: config.isDeleted ?? false,
    }
  }

  private readSyncPointer(): ExternalProductConfigFile['settings']['sync'] | undefined {
    try {
      if (fs.existsSync(this.syncConfigPath)) {
        return JSON.parse(fs.readFileSync(this.syncConfigPath, 'utf-8')) as ExternalProductConfigFile['settings']['sync']
      }

      const localConfigPath = path.join(this.configDir, 'config.json')
      if (fs.existsSync(localConfigPath)) {
        const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8')) as Partial<ExternalProductConfigFile>
        return localConfig.settings?.sync
      }
    }
    catch {
      return undefined
    }

    return undefined
  }

  private writeSyncPointer(config: ExternalProductConfigFile): void {
    try {
      fs.writeFileSync(this.syncConfigPath, JSON.stringify(config.settings.sync || { enabled: false }, null, 2), 'utf-8')
    }
    catch {
      // The pointer is a convenience for locating synced configs; the main save still succeeded.
    }
  }
}
