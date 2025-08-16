import type { MigrationRegistryEntry } from './types'

/**
 * Migration registry defining all available migrations
 * This file is the single source of truth for all migrations
 *
 * Migrations can be either:
 * 1. Structured (data-driven, less code) - preferred for simple operations
 * 2. Class-based (code-driven) - for complex migrations requiring custom logic
 */
export const MIGRATION_REGISTRY: MigrationRegistryEntry[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    description: 'Extract S3 configuration to separate file for cloud sync support',
    // Use structured migration for this simple operation
    structured: {
      fromVersion: 1,
      toVersion: 2,
      description: 'Extract S3 configuration to separate file for cloud sync support',
      operations: [
        {
          type: 'create_file',
          condition: config => config.settings?.s3Sync !== undefined,
          filePath: 's3-config.json',
          fileContent: config => ({
            version: 1,
            s3Config: config.settings.s3Sync,
            metadata: {
              createdAt: new Date().toISOString(),
              lastModified: new Date().toISOString(),
              migratedFrom: 'system-settings',
            },
          }),
        },
        {
          type: 'delete',
          source: 'settings.s3Sync',
          condition: config => config.settings?.s3Sync !== undefined,
        },
      ],
    },
  },
  // Future migrations can be added here using either structured or class-based approach
  //
  // Example structured migration:
  // {
  //   fromVersion: 2,
  //   toVersion: 3,
  //   description: 'Rename setting field',
  //   structured: {
  //     fromVersion: 2,
  //     toVersion: 3,
  //     description: 'Rename setting field',
  //     operations: [
  //       {
  //         type: 'move',
  //         source: 'settings.oldFieldName',
  //         target: 'settings.newFieldName'
  //       }
  //     ]
  //   }
  // }
  //
  // Example class-based migration:
  // {
  //   fromVersion: 3,
  //   toVersion: 4,
  //   description: 'Complex migration requiring custom logic',
  //   moduleId: './migrations/version-3-to-4',
  //   exportName: 'Version3To4Migration'
  // }
]

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
