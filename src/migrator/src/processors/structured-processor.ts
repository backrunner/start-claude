import type { MigrationOperation, StructuredMigration } from '../types'

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface FileCreatorOptions {
  fileCreator?: (filePath: string, content: unknown, config: Record<string, unknown>) => Promise<void>
}

/**
 * Processor for structured declarative migrations
 * This allows migrations to be defined as data rather than code
 */
export class StructuredMigrationProcessor {
  /**
   * Execute a structured migration on a config object
   */
  static async execute<T extends Record<string, unknown>>(
    migration: StructuredMigration,
    config: any,
    options?: {
      fileCreator?: (filePath: string, content: any, config: any) => Promise<void>
      migrationsDir?: string // Directory containing migration scripts
    },
  ): Promise<any> {
    let result = JSON.parse(JSON.stringify(config)) // Deep clone

    for (const operation of migration.operations) {
      // Check condition if specified
      if (operation.condition && !operation.condition(result)) {
        continue
      }

      result = await this.executeOperation(operation, result, options)
    }

    // Update version
    ;(result as T & { version: number }).version = migration.toVersion

    return result
  }

  /**
   * Execute a single migration operation
   */
  private static async executeOperation(
    operation: MigrationOperation,
    config: any,
    options?: {
      fileCreator?: (filePath: string, content: any, config: any) => Promise<void>
      migrationsDir?: string
    },
  ): Promise<any> {
    switch (operation.type) {
      case 'move':
        if (!operation.source || !operation.target) {
          throw new Error('Move operation requires both source and target paths')
        }
        return this.moveProperty(config, operation.source, operation.target)

      case 'copy':
        if (!operation.source || !operation.target) {
          throw new Error('Copy operation requires both source and target paths')
        }
        return this.copyProperty(config, operation.source, operation.target)

      case 'delete':
        if (!operation.source) {
          throw new Error('Delete operation requires a source path')
        }
        return this.deleteProperty(config, operation.source)

      case 'transform':
        if (!operation.source || !operation.transform) {
          throw new Error('Transform operation requires both source path and transform function')
        }
        return this.transformProperty(config, operation.source, operation.transform)

      case 'create_file':
        if (!operation.filePath || !operation.fileContent) {
          throw new Error('Create file operation requires both filePath and fileContent')
        }
        // Call the file creator with the current config and allow it to modify the config
        await this.createFile(operation.filePath, operation.fileContent(config), options?.fileCreator, config)
        return config

      case 'run_script':
        return await this.runMigrationScript(operation, config, options?.migrationsDir)

      case 'custom':
        if (!operation.transform) {
          throw new Error('Custom operation requires a transform function')
        }
        // For custom operations, the transform function does the work
        return operation.transform(config)

      default:
        throw new Error(`Unknown operation type: ${(operation as any).type}`)
    }
  }

  /**
   * Run a migration script
   */
  private static async runMigrationScript(
    operation: MigrationOperation,
    config: any,
    migrationsDir?: string,
  ): Promise<any> {
    if (!operation.scriptPath) {
      throw new Error('scriptPath is required for run_script operation')
    }

    const scriptPath = migrationsDir
      ? join(migrationsDir, operation.scriptPath)
      : join(__dirname, '../migrations/scripts', operation.scriptPath)

    try {
      // Dynamic import of the migration script
      const scriptModule = await import(scriptPath)

      // Look for default export or 'migrate' function
      const migrateFn = scriptModule.default || scriptModule.migrate

      if (typeof migrateFn !== 'function') {
        throw new Error(`Migration script ${operation.scriptPath} must export a default function or 'migrate' function`)
      }

      // Execute the migration script with config and optional arguments
      const result = await migrateFn(config, operation.scriptArgs)

      return result || config // Return modified config or original if no return value
    }
    catch (error) {
      throw new Error(`Failed to execute migration script ${operation.scriptPath}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Move a property from source to target path
   */
  private static moveProperty(config: any, sourcePath: string, targetPath: string): any {
    const value = this.getProperty(config, sourcePath)
    if (value !== undefined) {
      this.setProperty(config, targetPath, value)
      this.deleteProperty(config, sourcePath)
    }
    return config
  }

  /**
   * Copy a property from source to target path
   */
  private static copyProperty(config: any, sourcePath: string, targetPath: string): any {
    const value = this.getProperty(config, sourcePath)
    if (value !== undefined) {
      this.setProperty(config, targetPath, value)
    }
    return config
  }

  /**
   * Delete a property at the given path
   */
  private static deleteProperty(config: any, path: string): any {
    const parts = path.split('.')
    let current = config

    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) {
        return config
      }
      current = current[parts[i]]
    }

    delete current[parts[parts.length - 1]]
    return config
  }

  /**
   * Transform a property using the provided function
   */
  private static transformProperty(config: any, path: string, transformer: (value: any) => any): any {
    const value = this.getProperty(config, path)
    if (value !== undefined) {
      this.setProperty(config, path, transformer(value))
    }
    return config
  }

  /**
   * Get a property value using dot notation path
   */
  private static getProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, part) => current?.[part], obj)
  }

  /**
   * Set a property value using dot notation path
   */
  private static setProperty(obj: any, path: string, value: any): void {
    const parts = path.split('.')
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) {
        current[parts[i]] = {}
      }
      current = current[parts[i]]
    }

    current[parts[parts.length - 1]] = value
  }

  /**
   * Create a new file with the given content
   */
  private static async createFile(
    filePath: string,
    content: any,
    fileCreator?: (filePath: string, content: any, config: any) => Promise<void>,
    config?: any,
  ): Promise<void> {
    if (fileCreator && config) {
      // Use provided file creator and pass the config for modification
      await fileCreator(filePath, content, config)
    }
    else {
      // Default file creation
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      writeFileSync(filePath, contentStr, 'utf8')
    }
  }
}
