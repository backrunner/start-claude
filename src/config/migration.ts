import type { ConfigFile } from './types'

/**
 * Abstract base class for config file migrations
 */
export abstract class ConfigMigration {
  abstract readonly fromVersion: number
  abstract readonly toVersion: number
  abstract readonly description: string

  /**
   * Perform the migration from one version to another
   * @param config The config file to migrate
   * @returns The migrated config file
   */
  abstract migrate(config: ConfigFile): ConfigFile

  /**
   * Validate that this migration can be applied to the given config
   * @param config The config file to validate
   * @returns True if migration can be applied
   */
  canMigrate(config: ConfigFile): boolean {
    return config.version === this.fromVersion
  }

  /**
   * Get migration info for logging
   */
  getMigrationInfo(): string {
    return `${this.fromVersion} → ${this.toVersion}: ${this.description}`
  }
}

/**
 * Migration registry to manage all available migrations
 */
export class MigrationRegistry {
  private migrations: Map<number, ConfigMigration[]> = new Map()

  /**
   * Register a migration
   */
  register(migration: ConfigMigration): void {
    const fromVersion = migration.fromVersion
    if (!this.migrations.has(fromVersion)) {
      this.migrations.set(fromVersion, [])
    }
    this.migrations.get(fromVersion)!.push(migration)

    // Sort by target version to ensure consistent migration order
    this.migrations.get(fromVersion)!.sort((a, b) => a.toVersion - b.toVersion)
  }

  /**
   * Get all migrations from a specific version
   */
  getMigrationsFrom(version: number): ConfigMigration[] {
    return this.migrations.get(version) || []
  }

  /**
   * Find migration path from one version to another
   */
  findMigrationPath(fromVersion: number, toVersion: number): ConfigMigration[] {
    const path: ConfigMigration[] = []
    let currentVersion = fromVersion

    while (currentVersion < toVersion) {
      const availableMigrations = this.getMigrationsFrom(currentVersion)

      if (availableMigrations.length === 0) {
        throw new Error(`No migration available from version ${currentVersion}`)
      }

      // Find the migration that gets us closest to the target version
      const bestMigration = availableMigrations.reduce((best, current) => {
        if (current.toVersion <= toVersion) {
          return current.toVersion > best.toVersion ? current : best
        }
        return best
      })

      if (bestMigration.toVersion <= currentVersion) {
        throw new Error(`No valid migration path from version ${currentVersion} to ${toVersion}`)
      }

      path.push(bestMigration)
      currentVersion = bestMigration.toVersion
    }

    return path
  }

  /**
   * Get all registered migrations for debugging
   */
  getAllMigrations(): ConfigMigration[] {
    const allMigrations: ConfigMigration[] = []
    for (const migrations of Array.from(this.migrations.values())) {
      allMigrations.push(...migrations)
    }
    return allMigrations.sort((a, b) => a.fromVersion - b.fromVersion)
  }
}

/**
 * Global migration registry instance
 */
export const migrationRegistry = new MigrationRegistry()
