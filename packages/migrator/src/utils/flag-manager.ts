import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Interface for migration flag data
 */
export interface MigrationFlag {
  migrationId: string
  description: string
  completedAt: string
  checksum?: string // Optional checksum for additional validation
}

/**
 * Interface for migration flags file structure
 */
export interface MigrationFlagsFile {
  version: number
  flags: MigrationFlag[]
  lastUpdated: string
}

/**
 * Migration flag manager to track completed migrations
 * This ensures migrations are only run once, regardless of config file version
 */
export class MigrationFlagManager {
  private static instance: MigrationFlagManager | null = null
  private readonly configDir: string
  private readonly flagsFilePath: string

  private constructor(configDir?: string) {
    this.configDir = configDir || join(homedir(), '.start-claude')
    this.flagsFilePath = join(this.configDir, 'migration-flags.json')
    this.ensureConfigDir()
  }

  /**
   * Get singleton instance
   */
  static getInstance(configDir?: string): MigrationFlagManager {
    if (!MigrationFlagManager.instance) {
      MigrationFlagManager.instance = new MigrationFlagManager(configDir)
    }
    return MigrationFlagManager.instance
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    MigrationFlagManager.instance = null
  }

  /**
   * Ensure config directory exists
   */
  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true })
    }
  }

  /**
   * Load migration flags from file
   */
  private loadFlags(): MigrationFlagsFile {
    if (!existsSync(this.flagsFilePath)) {
      return {
        version: 1,
        flags: [],
        lastUpdated: new Date().toISOString(),
      }
    }

    try {
      const content = readFileSync(this.flagsFilePath, 'utf8')
      const flagsFile = JSON.parse(content) as MigrationFlagsFile

      // Ensure the file has the expected structure
      if (!flagsFile.flags || !Array.isArray(flagsFile.flags)) {
        return {
          version: 1,
          flags: [],
          lastUpdated: new Date().toISOString(),
        }
      }

      return flagsFile
    }
    catch (error) {
      console.error(`Error reading migration flags: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return {
        version: 1,
        flags: [],
        lastUpdated: new Date().toISOString(),
      }
    }
  }

  /**
   * Save migration flags to file
   */
  private saveFlags(flagsFile: MigrationFlagsFile): void {
    try {
      flagsFile.lastUpdated = new Date().toISOString()
      writeFileSync(this.flagsFilePath, JSON.stringify(flagsFile, null, 2), 'utf8')
    }
    catch (error) {
      console.error(`Error saving migration flags: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw new Error(`Failed to save migration flags: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Check if a migration has already been completed
   */
  isMigrationCompleted(migrationId: string): boolean {
    const flagsFile = this.loadFlags()
    return flagsFile.flags.some(flag => flag.migrationId === migrationId)
  }

  /**
   * Mark a migration as completed
   */
  markMigrationCompleted(migrationId: string, description: string, checksum?: string): void {
    const flagsFile = this.loadFlags()

    // Check if already marked as completed
    if (this.isMigrationCompleted(migrationId)) {
      console.log(`Migration ${migrationId} already marked as completed, skipping`)
      return
    }

    // Add new flag
    const newFlag: MigrationFlag = {
      migrationId,
      description,
      completedAt: new Date().toISOString(),
      ...(checksum && { checksum }),
    }

    flagsFile.flags.push(newFlag)
    this.saveFlags(flagsFile)
  }

  /**
   * Get all completed migration flags
   */
  getCompletedMigrations(): MigrationFlag[] {
    const flagsFile = this.loadFlags()
    return [...flagsFile.flags] // Return a copy to prevent external modification
  }

  /**
   * Remove a migration flag (useful for testing or forced re-runs)
   */
  removeMigrationFlag(migrationId: string): boolean {
    const flagsFile = this.loadFlags()
    const initialLength = flagsFile.flags.length

    flagsFile.flags = flagsFile.flags.filter(flag => flag.migrationId !== migrationId)

    if (flagsFile.flags.length < initialLength) {
      this.saveFlags(flagsFile)
      return true
    }

    return false
  }

  /**
   * Clear all migration flags (use with caution!)
   */
  clearAllFlags(): void {
    const flagsFile: MigrationFlagsFile = {
      version: 1,
      flags: [],
      lastUpdated: new Date().toISOString(),
    }
    this.saveFlags(flagsFile)
  }

  /**
   * Generate a migration ID from migration metadata
   */
  static generateMigrationId(fromVersion: number, toVersion: number, description: string): string {
    // Create a consistent, unique identifier for a migration
    const normalizedDescription = description.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return `${fromVersion}-to-${toVersion}-${normalizedDescription}`
  }

  /**
   * Generate checksum for additional validation (optional)
   */
  static generateChecksum(data: string): string {
    // Simple checksum implementation
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  /**
   * Get the path to the flags file (useful for debugging)
   */
  getFlagsFilePath(): string {
    return this.flagsFilePath
  }
}
