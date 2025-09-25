import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { UILogger } from '../utils/cli/ui'

export async function handleMigrateCommand(options: { dryRun?: boolean, verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  const configPath = join(homedir(), '.start-claude', 'config.json')

  try {
    if (!existsSync(configPath)) {
      ui.displayInfo('No configuration file found; nothing to migrate')
      return
    }

    const migratorModule = await import('../migrator/src/index')
    const { Migrator, CURRENT_CONFIG_VERSION } = migratorModule

    const migrator = new Migrator({
      currentVersion: CURRENT_CONFIG_VERSION,
      backupDirectory: join(homedir(), '.start-claude', 'backups'),
    })

    const detection = migrator.detectMigrationNeeded(configPath)
    if (!detection.needsMigration) {
      ui.displayInfo('✅ No migration needed')
      return
    }

    ui.displayInfo(`Pending migrations: ${detection.migrationPath?.map(m => m.description).join(' -> ')}`)

    if (options.dryRun) {
      ui.displayInfo('Dry run: no changes will be applied')
      return
    }

    const result = await migrator.migrate(configPath, { backup: true, verbose: !!options.verbose })
    if (result.success) {
      ui.displaySuccess(`✅ Migration completed: ${result.migrationsApplied.join(' -> ')}`)
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

