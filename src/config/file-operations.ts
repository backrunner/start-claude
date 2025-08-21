import type { ConfigFile, LegacyConfigFile, MigrationInfo, SystemSettings } from './types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import dayjs from 'dayjs'
import { UILogger } from '../utils/cli/ui'
import { CURRENT_CONFIG_VERSION } from './types'

const CONFIG_DIR = path.join(os.homedir(), '.start-claude')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const MIGRATION_LOG_FILE = path.join(CONFIG_DIR, 'migrations.log')

/**
 * Central manager for configuration file operations with versioning and migration support
 */
export class ConfigFileManager {
  private static instance: ConfigFileManager | null = null
  private _needsImmediateUpdate: boolean = false

  private constructor() {
    this.ensureConfigDir()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigFileManager {
    if (!ConfigFileManager.instance) {
      ConfigFileManager.instance = new ConfigFileManager()
    }
    return ConfigFileManager.instance
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
  }

  /**
   * Get the default/initial configuration file structure
   */
  private getDefaultConfigFile(): ConfigFile {
    return {
      version: CURRENT_CONFIG_VERSION,
      configs: [],
      settings: {
        overrideClaudeCommand: false,
      },
    }
  }

  /**
   * Check if the configuration file exists
   */
  exists(): boolean {
    return fs.existsSync(CONFIG_FILE)
  }

  /**
   * Read and parse the configuration file with migration support
   */
  load(): ConfigFile {
    if (!this.exists()) {
      const defaultConfig = this.getDefaultConfigFile()
      this.save(defaultConfig)
      return defaultConfig
    }

    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const rawConfig = JSON.parse(content)

      // Check if this is a legacy config file (no version field)
      if (!('version' in rawConfig)) {
        return this.migrateLegacyConfig(rawConfig as LegacyConfigFile)
      }

      const config = rawConfig as ConfigFile

      // Check if config version is higher than CLI version - indicates CLI is outdated
      if (config.version > CURRENT_CONFIG_VERSION) {
        this.handleOutdatedCLI(config.version)
      }

      // Check if migration is needed
      if (config.version < CURRENT_CONFIG_VERSION) {
        return this.migrateConfig(config)
      }

      // Validate and fill in missing fields
      return this.validateAndNormalize(config)
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayWarning(`Error loading config file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.displayInfo('Creating new configuration file...')

      // Backup the corrupted file
      if (this.exists()) {
        const backupPath = `${CONFIG_FILE}.backup.${Date.now()}`
        fs.copyFileSync(CONFIG_FILE, backupPath)
        logger.displayInfo(`Corrupted config backed up to: ${backupPath}`)
      }

      const defaultConfig = this.getDefaultConfigFile()
      this.save(defaultConfig)
      return defaultConfig
    }
  }

  /**
   * Save configuration file
   */
  save(config: ConfigFile): void {
    this.ensureConfigDir()

    // Ensure the config has the current version
    const configToSave: ConfigFile = {
      ...config,
      version: CURRENT_CONFIG_VERSION,
    }

    // Validate before saving
    this.validateConfig(configToSave)

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2))
  }

  /**
   * Migrate legacy configuration (no version field) to current version
   */
  private migrateLegacyConfig(legacyConfig: LegacyConfigFile): ConfigFile {
    const logger = new UILogger()
    logger.displayInfo('Migrating legacy configuration to version 1...')

    // Convert legacy settings to new SystemSettings format
    const newSettings: SystemSettings = {
      overrideClaudeCommand: legacyConfig.settings.overrideClaudeCommand,
      s3Sync: legacyConfig.settings.s3Sync,
    }

    // Ensure all configs have the enabled field (default to true for existing configs)
    const migratedConfigs = legacyConfig.configs.map(config => ({
      ...config,
      enabled: config.enabled ?? true,
    }))

    const migratedConfig: ConfigFile = {
      version: 1,
      configs: migratedConfigs,
      settings: newSettings,
    }

    // Log migration
    this.logMigration({
      fromVersion: 0,
      toVersion: 1,
      description: 'Initial migration from legacy config format',
      timestamp: Date.now(),
    })

    // Save the migrated config
    this.save(migratedConfig)
    logger.displaySuccess('Successfully migrated configuration to version 1')

    return migratedConfig
  }

  /**
   * Migrate configuration from older version to current version
   */
  private migrateConfig(config: ConfigFile): ConfigFile {
    const fromVersion = config.version
    const toVersion = CURRENT_CONFIG_VERSION

    const logger = new UILogger()
    logger.displayInfo(`Migrating configuration from version ${fromVersion} to ${toVersion}...`)

    // For now, just update the version without complex migrations
    // This can be extended with proper migrations later
    const migratedConfig: ConfigFile = {
      ...config,
      version: toVersion,
    }

    // Save the migrated config
    this.save(migratedConfig)
    logger.displaySuccess(`Successfully migrated configuration to version ${toVersion}`)

    return migratedConfig
  }

  /**
   * Validate and normalize configuration file
   */
  private validateAndNormalize(config: ConfigFile): ConfigFile {
    // Ensure version is set
    if (!config.version) {
      config.version = CURRENT_CONFIG_VERSION
    }

    // Ensure configs array exists
    if (!config.configs) {
      config.configs = []
    }

    // Ensure settings exist with defaults
    if (!config.settings) {
      config.settings = { overrideClaudeCommand: false }
    }

    // Normalize each config
    config.configs = config.configs.map(cfg => ({
      ...cfg,
      enabled: cfg.enabled ?? true, // Default to enabled
    }))

    return config
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: ConfigFile): void {
    if (typeof config.version !== 'number') {
      throw new TypeError('Config version must be a number')
    }

    if (!Array.isArray(config.configs)) {
      throw new TypeError('Config.configs must be an array')
    }

    if (!config.settings || typeof config.settings !== 'object') {
      throw new Error('Config.settings must be an object')
    }

    // Validate each config has required fields
    config.configs.forEach((cfg, index) => {
      if (!cfg.name || typeof cfg.name !== 'string') {
        throw new Error(`Config at index ${index} must have a valid name`)
      }
    })
  }

  /**
   * Log migration for audit trail
   */
  private logMigration(info: MigrationInfo): void {
    const logEntry = `${dayjs(info.timestamp).format('YYYY-MM-DD HH:mm:ss')} - Migration ${info.fromVersion} → ${info.toVersion}: ${info.description}\n`

    try {
      fs.appendFileSync(MIGRATION_LOG_FILE, logEntry)
    }
    catch {
      // Don't fail if we can't write to log file
      console.error('Failed to write migration log')
    }
  }

  /**
   * Get migration history
   */
  getMigrationHistory(): MigrationInfo[] {
    if (!fs.existsSync(MIGRATION_LOG_FILE)) {
      return []
    }

    try {
      const content = fs.readFileSync(MIGRATION_LOG_FILE, 'utf-8')
      const lines = content.trim().split('\n').filter(line => line.trim())

      return lines.map((line) => {
        const match = line.match(/^(.+?) - Migration (\d+) → (\d+): (.+)$/)
        if (!match) {
          throw new Error(`Invalid migration log line: ${line}`)
        }

        return {
          timestamp: new Date(match[1]).getTime(),
          fromVersion: Number.parseInt(match[2]),
          toVersion: Number.parseInt(match[3]),
          description: match[4],
        }
      })
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayWarning(`Error reading migration history: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return []
    }
  }

  /**
   * Check if migration is needed
   */
  needsMigration(): boolean {
    if (!this.exists()) {
      return false
    }

    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const rawConfig = JSON.parse(content)

      // Legacy config (no version) needs migration
      if (!('version' in rawConfig)) {
        return true
      }

      // Check if version is outdated
      return rawConfig.version < CURRENT_CONFIG_VERSION
    }
    catch {
      // If we can't parse the file, we'll need to create a new one
      return true
    }
  }

  /**
   * Get current configuration version
   */
  getCurrentVersion(): number {
    if (!this.exists()) {
      return CURRENT_CONFIG_VERSION
    }

    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const rawConfig = JSON.parse(content)
      return rawConfig.version || 0
    }
    catch {
      return 0
    }
  }

  /**
   * Get configuration file path for external tools
   */
  getConfigPath(): string {
    return CONFIG_FILE
  }

  /**
   * Get configuration directory path
   */
  getConfigDir(): string {
    return CONFIG_DIR
  }

  /**
   * Handle case where config version is higher than CLI version
   * This indicates the CLI tool is outdated and needs to be updated
   */
  private handleOutdatedCLI(configVersion: number): void {
    const logger = new UILogger()
    logger.displayWarning(`⚠️ Configuration version (${configVersion}) is newer than CLI version (${CURRENT_CONFIG_VERSION})`)
    logger.displayWarning('⚠️ Your CLI tool is outdated and needs to be updated to avoid compatibility issues.')
    logger.displayInfo('💡 An update check will be performed immediately.')

    // Set a flag that can be checked by the CLI startup code
    this._needsImmediateUpdate = true
  }

  /**
   * Check if an immediate update is needed due to outdated CLI
   */
  needsImmediateUpdate(): boolean {
    return this._needsImmediateUpdate
  }

  /**
   * Reset the immediate update flag (for testing)
   */
  resetImmediateUpdateFlag(): void {
    this._needsImmediateUpdate = false
  }
}
