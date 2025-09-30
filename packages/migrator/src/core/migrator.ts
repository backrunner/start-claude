import type {
  ConfigMigration,
  MigrationDetectionResult,
  MigrationOptions,
  MigrationResult,
  MigratorConfig,
} from '../types'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { StructuredMigrationProcessor } from '../processors/structured-processor'
import { MigrationFlagManager } from '../utils/flag-manager'
import { getCurrentDir } from '../utils/path'
import { CURRENT_CONFIG_VERSION, findMigrationPath, getAvailableMigrations } from './registry'

/**
 * Core migrator engine with dynamic import support for performance optimization
 */
export class Migrator {
  private config: MigratorConfig
  private flagManager: MigrationFlagManager

  constructor(config: MigratorConfig) {
    this.config = config
    this.flagManager = MigrationFlagManager.getInstance(config.backupDirectory ? dirname(config.backupDirectory) : undefined)
  }

  /**
   * Get the migrations scripts directory path, supporting both development and bundled environments
   */
  private getMigrationsScriptsDir(): string {
    // In bundled CLI environment: CLI is in bin/cli.mjs, migrations in bin/migrations/
    // In development: code is in src/migrator/src/core/, migrations in src/migrator/migrations/
    // In Next.js manager: code is in bin/manager/.next/server/chunks/, migrations in bin/migrations/

    const currentDir = getCurrentDir()
    const attemptedPaths: string[] = []

    // First try relative to bundled CLI location (most reliable)
    const bundledPath = join(currentDir, 'migrations', 'scripts')
    attemptedPaths.push(bundledPath)
    if (existsSync(bundledPath)) {
      return bundledPath
    }

    // Then try development environment path
    const devPath = join(currentDir, '../migrations/scripts')
    attemptedPaths.push(devPath)
    if (existsSync(devPath)) {
      return devPath
    }

    // Fallback for other bundled scenarios where migrations might be relative to the script
    const altBundledPath = join(currentDir, '..', 'migrations', 'scripts')
    attemptedPaths.push(altBundledPath)
    if (existsSync(altBundledPath)) {
      return altBundledPath
    }

    // For Next.js manager environment: navigate up from .next/server/chunks/ to bin/
    // Current dir might be: bin/manager/.next/server/chunks/
    // We need to go up to bin/ and then to bin/migrations/scripts
    const nextJsPath1 = join(currentDir, '../../../migrations/scripts')
    attemptedPaths.push(nextJsPath1)
    if (existsSync(nextJsPath1)) {
      return nextJsPath1
    }

    // Another Next.js scenario: from .next/server/
    const nextJsPath2 = join(currentDir, '../../migrations/scripts')
    attemptedPaths.push(nextJsPath2)
    if (existsSync(nextJsPath2)) {
      return nextJsPath2
    }

    // Try from bin/manager/ directory directly
    const managerPath = join(currentDir, '../../../../../bin/migrations/scripts')
    attemptedPaths.push(managerPath)
    if (existsSync(managerPath)) {
      return managerPath
    }

    throw new Error(`Migrations scripts directory not found. Tried: ${attemptedPaths.join(', ')}`)
  }

  /**
   * Detect if migration is needed for a given config file
   * This is lightweight and only reads the config file, no dynamic imports
   * Uses flag system by default instead of version-based detection
   */
  detectMigrationNeeded(configPath: string, options: { useFlagSystem?: boolean } = {}): MigrationDetectionResult {
    const useFlagSystem = options.useFlagSystem !== false // Default to true

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

      // Get all available migrations from current version to target
      const availableMigrations = getAvailableMigrations(currentVersion)
      const migrationPath = findMigrationPath(currentVersion, targetVersion)

      if (!migrationPath || migrationPath.length === 0) {
        return {
          needsMigration: false,
          currentVersion,
          targetVersion,
          availableMigrations,
        }
      }

      if (useFlagSystem) {
        // Use flag system: check which migrations haven't been completed yet
        const pendingMigrations = migrationPath.filter((migration) => {
          const migrationId = MigrationFlagManager.generateMigrationId(
            migration.fromVersion,
            migration.toVersion,
            migration.description,
          )
          return !this.flagManager.isMigrationCompleted(migrationId)
        })

        return {
          needsMigration: pendingMigrations.length > 0,
          currentVersion,
          targetVersion,
          availableMigrations,
          migrationPath: pendingMigrations,
        }
      }
      else {
        // Legacy version-based detection
        if (currentVersion >= targetVersion) {
          return {
            needsMigration: false,
            currentVersion,
            targetVersion,
            availableMigrations,
          }
        }

        return {
          needsMigration: true,
          currentVersion,
          targetVersion,
          availableMigrations,
          migrationPath,
        }
      }
    }
    catch (error) {
      throw new Error(`Failed to detect migration: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Execute migrations for a config file
   * Only loads migration modules when actually needed
   * Uses flag system to track completed migrations
   */
  async migrate(
    configPath: string,
    options: MigrationOptions = {},
    fileCreator?: (filePath: string, content: any, config: any) => Promise<void>,
  ): Promise<MigrationResult> {
    const useFlagSystem = options.useFlagSystem !== false // Default to true
    const detection = this.detectMigrationNeeded(configPath, { useFlagSystem })

    if (!detection.needsMigration) {
      return {
        success: true,
        fromVersion: detection.currentVersion,
        toVersion: detection.targetVersion,
        migrationsApplied: [],
        migrationsSkipped: [],
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
          migrationsSkipped: [],
          backupPath,
        }
      }

      // Apply migrations sequentially
      const migrationsApplied: string[] = []
      const migrationsSkipped: string[] = []

      for (const migrationEntry of detection.migrationPath) {
        const migrationId = MigrationFlagManager.generateMigrationId(
          migrationEntry.fromVersion,
          migrationEntry.toVersion,
          migrationEntry.description,
        )

        // Check flag system unless skipFlagCheck is enabled
        if (useFlagSystem && !options.skipFlagCheck && this.flagManager.isMigrationCompleted(migrationId)) {
          if (options.verbose) {
            console.log(`⏭️ Skipping migration (already completed): ${migrationEntry.description}`)
          }
          migrationsSkipped.push(migrationEntry.description)
          continue
        }

        if (options.verbose) {
          console.log(`🔄 Applying migration: ${migrationEntry.description}`)
        }

        let migrationSuccess = false

        try {
          // Handle structured migrations
          if (migrationEntry.structured) {
            config = await StructuredMigrationProcessor.execute(
              migrationEntry.structured,
              config,
              {
                fileCreator,
                migrationsDir: this.getMigrationsScriptsDir(),
              },
            )
            migrationSuccess = true
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
            migrationSuccess = true
          }
          else {
            throw new Error(`Invalid migration entry: must have either 'structured' or 'moduleId' + 'exportName'`)
          }

          // Mark migration as completed if it succeeded
          if (migrationSuccess && useFlagSystem) {
            const configChecksum = MigrationFlagManager.generateChecksum(JSON.stringify(config))
            this.flagManager.markMigrationCompleted(migrationId, migrationEntry.description, configChecksum)
          }

          migrationsApplied.push(migrationEntry.description)

          if (options.verbose) {
            console.log(`✅ Migration completed: ${migrationEntry.description}`)
          }
        }
        catch (migrationError) {
          console.error(`❌ Migration failed: ${migrationEntry.description}`)
          console.error(`   Error: ${migrationError instanceof Error ? migrationError.message : 'Unknown error'}`)

          // Don't mark migration as completed if it failed
          throw migrationError
        }
      }

      // Write migrated config
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')

      return {
        success: true,
        fromVersion: detection.currentVersion,
        toVersion: detection.targetVersion,
        migrationsApplied,
        migrationsSkipped,
        backupPath,
      }
    }
    catch (error) {
      return {
        success: false,
        fromVersion: detection.currentVersion,
        toVersion: detection.targetVersion,
        migrationsApplied: [],
        migrationsSkipped: [],
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
