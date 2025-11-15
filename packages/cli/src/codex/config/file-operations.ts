import type {
  CodexConfig,
  CodexConfigFile,
} from './types'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { UILogger } from '../../utils/cli/ui'
import {
  CURRENT_CODEX_VERSION,
  DEFAULT_CODEX_SETTINGS,
} from './types'

const CODEX_CONFIG_DIR = path.join(os.homedir(), '.start-codex')
const CODEX_CONFIG_FILE = path.join(CODEX_CONFIG_DIR, 'config.json')
const CODEX_SYNC_CONFIG_FILE = path.join(CODEX_CONFIG_DIR, 'sync.json')

/**
 * Central manager for Codex configuration file operations
 */
export class CodexFileOperations {
  private static instance: CodexFileOperations | null = null

  private constructor() {
    this.ensureConfigDir()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CodexFileOperations {
    if (!CodexFileOperations.instance) {
      CodexFileOperations.instance = new CodexFileOperations()
    }
    return CodexFileOperations.instance
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(CODEX_CONFIG_DIR)) {
      fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true })
    }
  }

  /**
   * Get the default/initial configuration file structure
   */
  private getDefaultConfigFile(): CodexConfigFile {
    return {
      version: CURRENT_CODEX_VERSION,
      configs: [],
      settings: { ...DEFAULT_CODEX_SETTINGS },
    }
  }

  /**
   * Get the actual config directory path (cloud or local)
   * If cloud sync is enabled, return the cloud directory
   */
  getActualConfigDir(): string {
    try {
      if (fs.existsSync(CODEX_SYNC_CONFIG_FILE)) {
        const syncConfigContent = fs.readFileSync(CODEX_SYNC_CONFIG_FILE, 'utf-8')
        const syncConfig = JSON.parse(syncConfigContent)

        // Only use cloud path for iCloud, OneDrive, custom (not S3)
        if (syncConfig.enabled && syncConfig.provider !== 's3') {
          const cloudPath = syncConfig.cloudPath || syncConfig.customPath
          if (cloudPath) {
            const cloudConfigDir = path.join(cloudPath, '.start-codex')
            // Verify cloud config directory exists
            if (fs.existsSync(cloudConfigDir)) {
              return cloudConfigDir
            }
          }
        }
      }
    }
    catch {
      // If any error reading sync config, fall back to local
    }

    return CODEX_CONFIG_DIR
  }

  /**
   * Get the actual config file path (cloud or local)
   */
  getActualConfigPath(): string {
    const configDir = this.getActualConfigDir()
    return path.join(configDir, 'config.json')
  }

  /**
   * Check if the configuration file exists
   */
  exists(): boolean {
    const actualPath = this.getActualConfigPath()
    return fs.existsSync(actualPath)
  }

  /**
   * Read and parse the configuration file
   */
  load(): CodexConfigFile {
    if (!this.exists()) {
      const defaultConfig = this.getDefaultConfigFile()
      this.save(defaultConfig)
      return defaultConfig
    }

    try {
      const actualPath = this.getActualConfigPath()
      const content = fs.readFileSync(actualPath, 'utf-8')
      const config: CodexConfigFile = JSON.parse(content)

      // Validate and normalize
      const normalized = this.validateAndNormalize(config)

      // Check if any configs were missing UUIDs and save if so
      const hadMissingUUIDs = config.configs.some(cfg => !cfg.id)
      if (hadMissingUUIDs) {
        this.save(normalized)
      }

      return normalized
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayWarning(`Error loading Codex config file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.displayInfo('Creating new Codex configuration file...')

      // Backup the corrupted file
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

  /**
   * Validate and normalize configuration
   */
  private validateAndNormalize(config: CodexConfigFile): CodexConfigFile {
    // Ensure version field
    if (!config.version) {
      config.version = CURRENT_CODEX_VERSION
    }

    // Ensure configs array
    if (!Array.isArray(config.configs)) {
      config.configs = []
    }

    // Ensure settings object
    if (!config.settings || typeof config.settings !== 'object') {
      config.settings = { ...DEFAULT_CODEX_SETTINGS }
    }

    // Normalize each config
    config.configs = config.configs.map(cfg => this.normalizeConfig(cfg))

    return config
  }

  /**
   * Normalize a single config
   */
  private normalizeConfig(config: CodexConfig): CodexConfig {
    // Ensure UUID
    if (!config.id) {
      config.id = randomUUID()
    }

    // Ensure required fields have defaults
    if (config.enabled === undefined) {
      config.enabled = true
    }

    if (config.isDefault === undefined) {
      config.isDefault = false
    }

    if (config.order === undefined) {
      config.order = 0
    }

    if (config.isDeleted === undefined) {
      config.isDeleted = false
    }

    return config
  }

  /**
   * Write configuration file
   */
  save(config: CodexConfigFile): void {
    try {
      // Ensure config directory exists (respects cloud sync)
      const actualConfigDir = this.getActualConfigDir()
      if (!fs.existsSync(actualConfigDir)) {
        fs.mkdirSync(actualConfigDir, { recursive: true })
      }

      const actualPath = this.getActualConfigPath()
      const content = JSON.stringify(config, null, 2)
      fs.writeFileSync(actualPath, content, 'utf-8')
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`Error saving Codex config file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  /**
   * Create a backup of the config file
   */
  createBackup(): string | null {
    try {
      const actualPath = this.getActualConfigPath()
      if (!fs.existsSync(actualPath)) {
        return null
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = `${actualPath}.backup.${timestamp}`
      fs.copyFileSync(actualPath, backupPath)
      return backupPath
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayWarning(`Error creating backup: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  /**
   * Get config directory path (local, not cloud)
   */
  getConfigDir(): string {
    return CODEX_CONFIG_DIR
  }

  /**
   * Get config file path (local, not cloud)
   */
  getConfigPath(): string {
    return CODEX_CONFIG_FILE
  }

  /**
   * Get sync config file path
   */
  getSyncConfigPath(): string {
    return CODEX_SYNC_CONFIG_FILE
  }
}
