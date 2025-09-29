import type { MigrationResult } from '@start-claude/migrator'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CURRENT_CONFIG_VERSION, MigrationFlagManager, Migrator } from '@start-claude/migrator'
import { UILogger } from '../utils/cli/ui'

export async function handleMigrateCommand(options: {
  dryRun?: boolean
  verbose?: boolean
  useLegacyVersionCheck?: boolean // Use old version-based detection instead of flag system
  force?: boolean // Force re-run migrations (skip flag check)
} = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  const configPath = join(homedir(), '.start-claude', 'config.json')

  try {
    if (!existsSync(configPath)) {
      ui.displayInfo('No configuration file found; nothing to migrate')
      return
    }

    const migrator = new Migrator({
      currentVersion: CURRENT_CONFIG_VERSION,
      backupDirectory: join(homedir(), '.start-claude', 'backups'),
    })

    // Use flag system by default, legacy version check if explicitly requested
    const useFlagSystem = !options.useLegacyVersionCheck

    if (options.verbose) {
      ui.displayInfo(`Using ${useFlagSystem ? 'flag-based' : 'version-based'} migration detection`)
    }

    const detection = migrator.detectMigrationNeeded(configPath, { useFlagSystem })

    if (!detection.needsMigration) {
      if (useFlagSystem) {
        // Show flag status for verbose output
        const flagManager = MigrationFlagManager.getInstance()
        const completedMigrations = flagManager.getCompletedMigrations()

        if (completedMigrations.length > 0) {
          ui.displayInfo(`✅ No migration needed (${completedMigrations.length} migrations already completed)`)
          if (options.verbose) {
            ui.displayInfo('Completed migrations:')
            completedMigrations.forEach((flag: { description: string, completedAt: string }) => {
              ui.displayInfo(`  - ${flag.description} (${flag.completedAt})`)
            })
          }
        }
        else {
          ui.displayInfo('✅ No migration needed')
        }
      }
      else {
        ui.displayInfo('✅ No migration needed')
      }
      return
    }

    const pendingMigrations = detection.migrationPath?.map((m: { description: string }) => m.description).join(' -> ') || 'unknown'
    ui.displayInfo(`Pending migrations: ${pendingMigrations}`)

    if (options.dryRun) {
      ui.displayInfo('Dry run: no changes will be applied')
      return
    }

    const migrationOptions = {
      backup: true,
      verbose: !!options.verbose,
      useFlagSystem,
      skipFlagCheck: !!options.force,
    }

    if (options.force && useFlagSystem) {
      ui.displayWarning('⚠️ Force mode: migrations will re-run even if marked as completed')
    }

    const result: MigrationResult = await migrator.migrate(configPath, migrationOptions)

    if (result.success) {
      ui.displaySuccess(`✅ Migration completed: ${result.migrationsApplied.join(' -> ')}`)

      if (result.migrationsSkipped && result.migrationsSkipped.length > 0) {
        ui.displayInfo(`⏭️ Skipped ${result.migrationsSkipped.length} previously completed migrations`)
        if (options.verbose) {
          result.migrationsSkipped.forEach((migration: string) => {
            ui.displayInfo(`  - ${migration}`)
          })
        }
      }

      if (result.backupPath) {
        ui.displayInfo(`Backup created at: ${result.backupPath}`)
      }
    }
    else {
      ui.displayError(`❌ Migration failed: ${result.error || 'Unknown error'}`)
    }
  }
  catch (error) {
    ui.displayError(`❌ Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
