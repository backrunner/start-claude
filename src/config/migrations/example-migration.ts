import type { ConfigFile } from '../types'
import { ConfigMigration } from '../migration'

/**
 * Example migration from version 1 to version 2
 * This is just a template for future migrations
 */
export class ExampleMigration extends ConfigMigration {
  readonly fromVersion = 1
  readonly toVersion = 2
  readonly description = 'Add example field to system settings'

  migrate(config: ConfigFile): ConfigFile {
    // Example: Add new field to system settings
    const migratedConfig = {
      ...config,
      version: this.toVersion,
      settings: {
        ...config.settings,
        // exampleField: 'defaultValue',
      },
    }

    return migratedConfig
  }

  canMigrate(config: ConfigFile): boolean {
    // Additional validation if needed
    return config.version === this.fromVersion && config.settings !== undefined
  }
}

// To register this migration, add it to the migration registry:
// import { migrationRegistry } from '../migration'
// migrationRegistry.register(new ExampleMigration())
