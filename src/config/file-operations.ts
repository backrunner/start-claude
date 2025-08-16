import type { ConfigFile, LegacyConfigFile, SystemSettings } from './types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { displayInfo, displaySuccess, displayWarning } from '../utils/cli/ui'
import { CURRENT_CONFIG_VERSION } from './types'

const CONFIG_DIR = path.join(os.homedir(), '.start-claude')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

/**
 * Central manager for configuration file operations with migrator integration
 */
export class ConfigFileManager {
  private static instance: ConfigFileManager | null = null

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
   * Migration is now handled by the dedicated migrator package
   */
  async load(): Promise<ConfigFile> {
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

      // Check if migration is needed - delegate to migrator package
      if (config.version < CURRENT_CONFIG_VERSION) {
        return await this.migrateConfigWithMigrator(config)
      }

      // Validate and fill in missing fields
      return this.validateAndNormalize(config)
    }
    catch (error) {
      displayWarning(`Error loading config file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      displayInfo('Creating new configuration file...')

      // Backup the corrupted file
      if (this.exists()) {
        const backupPath = `${CONFIG_FILE}.backup.${Date.now()}`
        fs.copyFileSync(CONFIG_FILE, backupPath)
        displayInfo(`Corrupted config backed up to: ${backupPath}`)
      }

      const defaultConfig = this.getDefaultConfigFile()
      this.save(defaultConfig)
      return defaultConfig
    }
  }

  /**
   * Migrate legacy configuration (no version field) to current version
   */
  private migrateLegacyConfig(legacyConfig: LegacyConfigFile): ConfigFile {
    displayInfo('Migrating legacy configuration to version 1...')

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

    // Save the migrated config - it will be further migrated by the migrator if needed
    this.save(migratedConfig)
    displaySuccess('Successfully migrated configuration to version 1')

    return migratedConfig
  }

  /**
   * Migrate configuration using the new migrator package
   */
  private async migrateConfigWithMigrator(config: ConfigFile): Promise<ConfigFile> {
    const fromVersion = config.version
    const toVersion = CURRENT_CONFIG_VERSION

    displayInfo(`Migrating configuration from version ${fromVersion} to ${toVersion}...`)

    try {
      // Use dynamic import to load migrator package
      const { Migrator } = await import('@start-claude/migrator')

      const migrator = new Migrator({
        currentVersion: CURRENT_CONFIG_VERSION,
        backupDirectory: path.join(CONFIG_DIR, 'backups'),
        enableAutoMigration: true,
      })

      // Create a temporary file for migration
      const tempConfigPath = path.join(CONFIG_DIR, 'temp-migration.json')
      fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2))

      try {
        const result = await migrator.migrate(tempConfigPath, {
          backup: true,
          verbose: true,
        })

        if (!result.success) {
          throw new Error(result.error || 'Migration failed')
        }

        // Read the migrated config
        const migratedContent = fs.readFileSync(tempConfigPath, 'utf-8')
        const migratedConfig = JSON.parse(migratedContent) as ConfigFile

        // Handle any S3 config that needs to be created
        if ((migratedConfig as any).__migration_temp__?.s3ConfigToCreate) {
          const { S3ConfigFileManager } = await import('../config/s3-config')
          const s3ConfigManager = S3ConfigFileManager.getInstance()
          s3ConfigManager.createFromMigration((migratedConfig as any).__migration_temp__.s3ConfigToCreate)

          // Clean up temporary migration data
          delete (migratedConfig as any).__migration_temp__
        }

        displaySuccess(`Successfully migrated configuration to version ${toVersion}`)
        displayInfo(`Applied migrations: ${result.migrationsApplied.join(', ')}`)

        return migratedConfig
      }
      finally {
        // Clean up temp file
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath)
        }
      }
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      displayWarning(`Migration failed: ${errorMsg}`)
      displayInfo('Using configuration as-is without migration')
      return config
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
   * Check if migration is needed using lightweight detection
   */
  needsMigration(): boolean {
    if (!this.exists()) {
      return false
    }

    try {
      // Fallback method - just check version
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
}
