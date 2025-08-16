import type {
  ConfigMigration,
  MigrationDetectionResult,
  MigrationOptions,
  MigrationResult,
  MigratorConfig,
} from './types'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CURRENT_CONFIG_VERSION, findMigrationPath, getAvailableMigrations } from './registry'

/**
 * Core migrator engine with dynamic import support for performance optimization
 */
export class Migrator {
  private config: MigratorConfig

  constructor(config: MigratorConfig) {
    this.config = config
  }

  /**
   * Detect if migration is needed for a given config file
   * This is lightweight and only reads the config file, no dynamic imports
   */
  detectMigrationNeeded(configPath: string): MigrationDetectionResult {
    if (!existsSync(configPath)) {
      return {
        needsMigration: false,
        currentVersion: this.config.currentVersion,
        targetVersion: this.config.currentVersion,
        availableMigrations: [],
      }
    }

    try {
      const configContent = readFileSync(configPath, 'utf8')
      const config = JSON.parse(configContent)
      const currentVersion = config.version || 1
      const targetVersion = this.config.currentVersion

      if (currentVersion >= targetVersion) {
        return {
          needsMigration: false,
          currentVersion,
          targetVersion,
          availableMigrations: [],
        }
      }

      const availableMigrations = getAvailableMigrations(currentVersion)
      const migrationPath = findMigrationPath(currentVersion, targetVersion)

      return {
        needsMigration: true,
        currentVersion,
        targetVersion,
        availableMigrations,
        migrationPath,
      }
    }
    catch (error) {
      throw new Error(`Failed to detect migration: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Execute migrations for a config file
   * Only loads migration modules when actually needed
   */
  async migrate(configPath: string, options: MigrationOptions = {}): Promise<MigrationResult> {
    const detection = this.detectMigrationNeeded(configPath)

    if (!detection.needsMigration) {
      return {
        success: true,
        fromVersion: detection.currentVersion,
        toVersion: detection.targetVersion,
        migrationsApplied: [],
      }
    }

    if (!detection.migrationPath) {
      throw new Error('Migration path not found')
    }

    let config: any
    let backupPath: string | undefined

    try {
      // Read current config
      const configContent = readFileSync(configPath, 'utf8')
      config = JSON.parse(configContent)

      // Create backup if requested
      if (options.backup !== false) {
        backupPath = this.createBackup(configPath)
      }

      // Dry run mode - don't actually apply changes
      if (options.dryRun) {
        return {
          success: true,
          fromVersion: detection.currentVersion,
          toVersion: detection.targetVersion,
          migrationsApplied: detection.migrationPath.map(m => m.description),
          backupPath,
        }
      }

      // Apply migrations sequentially
      const migrationsApplied: string[] = []

      for (const migrationEntry of detection.migrationPath) {
        if (options.verbose) {
          console.log(`Applying migration: ${migrationEntry.description}`)
        }

        // Handle structured migrations
        if (migrationEntry.structured) {
          const { StructuredMigrationProcessor } = await import('./structured-processor')

          // Create a file creator callback for S3 config files
          const fileCreator = async (filePath: string, content: any, configToModify: any): Promise<void> => {
            if (filePath.includes('s3-config.json')) {
              // Store S3 config in temporary location for the calling system to handle
              if (!configToModify.__migration_temp__) {
                configToModify.__migration_temp__ = {}
              }
              configToModify.__migration_temp__.s3ConfigToCreate = content
            }
            else {
              // For other files, write directly
              const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
              const fs = await import('node:fs')
              fs.writeFileSync(filePath, contentStr, 'utf8')
            }
          }

          config = await StructuredMigrationProcessor.execute(migrationEntry.structured, config, { fileCreator })
          migrationsApplied.push(migrationEntry.description)
        }
        // Handle class-based migrations
        else if (migrationEntry.moduleId && migrationEntry.exportName) {
          // Dynamic import - only load when needed
          const migrationModule = await import(migrationEntry.moduleId)
          const MigrationClass = migrationModule[migrationEntry.exportName]

          if (!MigrationClass) {
            throw new Error(`Migration class not found: ${migrationEntry.exportName} in ${migrationEntry.moduleId}`)
          }

          const migration: ConfigMigration = new MigrationClass()
          config = await migration.migrate(config)
          migrationsApplied.push(migrationEntry.description)
        }
        else {
          throw new Error(`Invalid migration entry: must have either 'structured' or 'moduleId' + 'exportName'`)
        }
      }

      // Write migrated config
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')

      return {
        success: true,
        fromVersion: detection.currentVersion,
        toVersion: detection.targetVersion,
        migrationsApplied,
        backupPath,
      }
    }
    catch (error) {
      return {
        success: false,
        fromVersion: detection.currentVersion,
        toVersion: detection.targetVersion,
        migrationsApplied: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        backupPath,
      }
    }
  }

  /**
   * Create a backup of the config file
   */
  private createBackup(configPath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = this.config.backupDirectory || join(dirname(configPath), 'backups')

    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true })
    }

    const backupPath = join(backupDir, `config-backup-${timestamp}.json`)
    copyFileSync(configPath, backupPath)
    return backupPath
  }

  /**
   * Get the latest config version
   */
  static getCurrentVersion(): number {
    return CURRENT_CONFIG_VERSION
  }
}
