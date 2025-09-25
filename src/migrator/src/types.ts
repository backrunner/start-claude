/**
 * Base interface for configuration migrations
 */
export interface ConfigMigration<T = any, U = any> {
  readonly fromVersion: number
  readonly toVersion: number
  readonly description: string
  migrate: (config: T) => U | Promise<U>
}

/**
 * Structured migration operations for declarative migrations
 */
export interface MigrationOperation {
  type: 'move' | 'copy' | 'delete' | 'transform' | 'create_file' | 'custom' | 'run_script'
  source?: string
  target?: string
  transform?: (value: any) => any
  condition?: (config: any) => boolean | string // Support both function and string expression
  filePath?: string
  fileContent?: (config: any) => any | any // Support both function and static object
  scriptPath?: string // Path to migration script file (relative to migrations directory)
  scriptArgs?: any // Arguments to pass to the migration script
}

/**
 * JSON-based migration operation for file storage
 */
export interface JsonMigrationOperation {
  type: 'move' | 'copy' | 'delete' | 'transform' | 'create_file' | 'custom' | 'run_script'
  source?: string
  target?: string
  transform?: string // JavaScript expression as string
  condition?: string // JavaScript expression as string
  filePath?: string
  fileContent?: any // Static object or JavaScript expression strings
  scriptPath?: string // Path to migration script file (relative to migrations directory)
  scriptArgs?: any // Arguments to pass to the migration script
}

/**
 * Declarative migration definition using structured operations
 */
export interface StructuredMigration {
  fromVersion: number
  toVersion: number
  description: string
  operations: MigrationOperation[]
}

/**
 * JSON-based migration definition for file storage
 */
export interface JsonMigrationDefinition {
  fromVersion: number
  toVersion: number
  description: string
  operations: JsonMigrationOperation[]
}

/**
 * Migration registry entry - can be either class-based or structured
 */
export interface MigrationRegistryEntry {
  fromVersion: number
  toVersion: number
  description: string
  moduleId?: string
  exportName?: string
  structured?: StructuredMigration
}

/**
 * Migration detection result
 */
export interface MigrationDetectionResult {
  needsMigration: boolean
  currentVersion: number
  targetVersion: number
  availableMigrations: MigrationRegistryEntry[]
  migrationPath?: MigrationRegistryEntry[]
}

/**
 * Migration execution options
 */
export interface MigrationOptions {
  dryRun?: boolean
  backup?: boolean
  verbose?: boolean
  force?: boolean
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  success: boolean
  fromVersion: number
  toVersion: number
  migrationsApplied: string[]
  error?: string
  backupPath?: string
}

/**
 * Migrator configuration
 */
export interface MigratorConfig {
  registryPath?: string
  currentVersion: number
  backupDirectory?: string
  enableAutoMigration?: boolean
}
