export { Migrator } from './core/migrator'
export { CURRENT_CONFIG_VERSION, findMigrationPath, getAvailableMigrations, MIGRATION_REGISTRY } from './core/registry'
export { StructuredMigrationProcessor } from './processors/structured-processor'

// Re-export types
export * from './types'

export { MigrationDetector } from './utils/detector'
