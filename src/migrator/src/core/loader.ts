/* eslint-disable ts/no-implied-eval */
/* eslint-disable no-new-func */
import type { JsonMigrationDefinition, MigrationRegistryEntry, StructuredMigration } from '../types'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCurrentDir } from '../utils/path'

/**
 * Migration loader that automatically discovers and loads migration files
 */
export class MigrationLoader {
  private static migrationsCache: MigrationRegistryEntry[] | null = null

  /**
   * Get the migrations directory path, supporting both development and bundled environments
   */
  private static getMigrationsDir(): string {
    // In bundled CLI environment: CLI is in bin/cli.mjs, migrations in bin/migrations/
    // In development: code is in src/migrator/src/core/, migrations in src/migrator/migrations/

    const currentDir = getCurrentDir()

    // First try relative to bundled CLI location (most reliable)
    const bundledPath = join(currentDir, 'migrations', 'definitions')
    if (existsSync(bundledPath)) {
      return bundledPath
    }

    // Then try development environment path
    const devPath = join(currentDir, '../migrations/definitions')
    if (existsSync(devPath)) {
      return devPath
    }

    // Fallback for other bundled scenarios where migrations might be relative to the script
    const altBundledPath = join(currentDir, '..', 'migrations', 'definitions')
    if (existsSync(altBundledPath)) {
      return altBundledPath
    }

    throw new Error(`Migrations directory not found. Tried: ${bundledPath}, ${devPath}, ${altBundledPath}`)
  }

  /**
   * Load all migrations from the migrations directory
   */
  static loadMigrations(): MigrationRegistryEntry[] {
    // Use cache to avoid repeated file system operations
    if (this.migrationsCache) {
      return this.migrationsCache
    }

    const migrations: MigrationRegistryEntry[] = []

    try {
      // Read all JSON files from migrations directory
      const migrationsDir = this.getMigrationsDir()
      const files = readdirSync(migrationsDir)
        .filter(file => file.endsWith('.json'))
        .sort() // Ensure consistent ordering

      for (const file of files) {
        try {
          const filePath = join(migrationsDir, file)
          const content = readFileSync(filePath, 'utf-8')
          const jsonMigration: JsonMigrationDefinition = JSON.parse(content)

          // Convert JSON migration to structured migration
          const structuredMigration: StructuredMigration = this.convertJsonToStructured(jsonMigration)

          migrations.push({
            fromVersion: jsonMigration.fromVersion,
            toVersion: jsonMigration.toVersion,
            description: jsonMigration.description,
            structured: structuredMigration,
          })
        }
        catch (error) {
          console.error(`Error loading migration file ${file}:`, error)
          // Continue loading other migrations
        }
      }

      // Cache the results
      this.migrationsCache = migrations
      return migrations
    }
    catch (error) {
      console.error('Error reading migrations directory:', error)
      return []
    }
  }

  /**
   * Convert JSON migration definition to structured migration
   */
  private static convertJsonToStructured(jsonMigration: JsonMigrationDefinition): StructuredMigration {
    return {
      fromVersion: jsonMigration.fromVersion,
      toVersion: jsonMigration.toVersion,
      description: jsonMigration.description,
      operations: jsonMigration.operations.map(op => ({
        ...op,
        // Convert string expressions to functions
        condition: typeof op.condition === 'string'
          ? this.createConditionFunction(op.condition)
          : undefined,
        transform: typeof op.transform === 'string'
          ? this.createTransformFunction(op.transform)
          : undefined,
        fileContent: typeof op.fileContent === 'object' && op.fileContent !== null
          ? this.createFileContentFunction(op.fileContent)
          : op.fileContent,
        // Keep scriptPath as-is for script operations
        scriptPath: op.scriptPath,
        scriptArgs: op.scriptArgs,
      })),
    }
  }

  /**
   * Create condition function from string expression
   */
  private static createConditionFunction(expression: string): (config: any) => boolean {
    return (config: any) => {
      try {
        // Safe evaluation of condition expression
        return new Function('config', `return ${expression}`)(config)
      }
      catch (error) {
        console.error(`Error evaluating condition: ${expression}`, error)
        return false
      }
    }
  }

  /**
   * Create transform function from string expression
   */
  private static createTransformFunction(expression: string): (value: any) => any {
    return (value: any) => {
      try {
        // Safe evaluation of transform expression
        return new Function('value', `return ${expression}`)(value)
      }
      catch (error) {
        console.error(`Error evaluating transform: ${expression}`, error)
        return value
      }
    }
  }

  /**
   * Create file content function from object definition
   */
  private static createFileContentFunction(contentDef: any): (config: any) => any {
    return (config: any) => {
      try {
        // Process the content definition, evaluating any string expressions
        return this.processContentObject(contentDef, config)
      }
      catch (error) {
        console.error('Error creating file content:', error)
        return contentDef
      }
    }
  }

  /**
   * Process content object, evaluating JavaScript expressions in strings
   */
  private static processContentObject(obj: any, config: any): any {
    if (typeof obj === 'string') {
      // Check if string looks like a JavaScript expression (contains dots or function calls)
      if (obj.includes('config.') || obj.includes('new Date()') || obj.includes('()')) {
        try {
          return new Function('config', `return ${obj}`)(config)
        }
        catch {
          return obj // Return as literal string if evaluation fails
        }
      }
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.processContentObject(item, config))
    }

    if (obj && typeof obj === 'object') {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.processContentObject(value, config)
      }
      return result
    }

    return obj
  }

  /**
   * Clear the migrations cache (useful for testing)
   */
  static clearCache(): void {
    this.migrationsCache = null
  }
}
