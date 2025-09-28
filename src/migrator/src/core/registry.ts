import type { MigrationRegistryEntry } from '../types'
import { MigrationLoader } from './loader'

/**
 * Migration registry defining all available migrations
 * This file is the single source of truth for all migrations
 *
 * Migrations are now loaded automatically from the migrations directory
 * All migration definitions should be stored as JSON files in src/migrator/migrations/
 */

/**
 * Get all migration registry entries (loaded from JSON files)
 */
function loadMigrationRegistry(): MigrationRegistryEntry[] {
  return MigrationLoader.loadMigrations()
}

/**
 * Migration registry - automatically populated from JSON files
 */
export const MIGRATION_REGISTRY: MigrationRegistryEntry[] = loadMigrationRegistry()

/**
 * Get the current supported config version
 */
export const CURRENT_CONFIG_VERSION = Math.max(...MIGRATION_REGISTRY.map(m => m.toVersion), 1)

/**
 * Find migration path from source to target version
 */
export function findMigrationPath(fromVersion: number, toVersion: number): MigrationRegistryEntry[] {
  if (fromVersion === toVersion) {
    return []
  }

  if (fromVersion > toVersion) {
    throw new Error(`Downgrade migrations are not supported (${fromVersion} -> ${toVersion})`)
  }

  const path: MigrationRegistryEntry[] = []
  let currentVersion = fromVersion

  while (currentVersion < toVersion) {
    const migration = MIGRATION_REGISTRY.find(m => m.fromVersion === currentVersion)
    if (!migration) {
      throw new Error(`No migration found from version ${currentVersion}`)
    }
    path.push(migration)
    currentVersion = migration.toVersion
  }

  return path
}

/**
 * Get all available migrations for a given source version
 */
export function getAvailableMigrations(fromVersion: number): MigrationRegistryEntry[] {
  return MIGRATION_REGISTRY.filter(m => m.fromVersion >= fromVersion)
}
