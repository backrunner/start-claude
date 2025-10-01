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
   * Also checks cloud directory if cloud sync is enabled
   */
  private loadFlags(): MigrationFlagsFile {
    // Try loading from cloud first if available
    const cloudFlags = this.loadFlagsFromCloud()
    if (cloudFlags) {
      // Merge with local flags and save back to local
      const localFlags = this.loadFlagsFromLocal()
      const mergedFlags = this.mergeFlagsFiles(localFlags, cloudFlags)

      // Save merged flags locally
      if (mergedFlags.flags.length > localFlags.flags.length) {
        this.saveFlags(mergedFlags)
      }

      return mergedFlags
    }

    // Fall back to local flags
    return this.loadFlagsFromLocal()
  }

  /**
   * Load migration flags from local directory
   */
  private loadFlagsFromLocal(): MigrationFlagsFile {
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
   * Load migration flags from cloud directory if cloud sync is enabled
   */
  private loadFlagsFromCloud(): MigrationFlagsFile | null {
    try {
      const syncConfigPath = join(this.configDir, 'sync.json')
      if (!existsSync(syncConfigPath)) {
        return null
      }

      const syncConfig = JSON.parse(readFileSync(syncConfigPath, 'utf-8'))

      // Only load from cloud for iCloud, OneDrive, or custom sync (not S3)
      if (!syncConfig.enabled || syncConfig.provider === 's3') {
        return null
      }

      const cloudPath = syncConfig.cloudPath || syncConfig.customPath
      if (!cloudPath) {
        return null
      }

      const cloudFlagsPath = join(cloudPath, '.start-claude', 'migration-flags.json')
      if (!existsSync(cloudFlagsPath)) {
        return null
      }

      const content = readFileSync(cloudFlagsPath, 'utf8')
      const flagsFile = JSON.parse(content) as MigrationFlagsFile

      // Ensure the file has the expected structure
      if (!flagsFile.flags || !Array.isArray(flagsFile.flags)) {
        return null
      }

      return flagsFile
    }
    catch (error) {
      console.error(`Error loading migration flags from cloud: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  /**
   * Merge two flags files, keeping the union of all flags
   */
  private mergeFlagsFiles(local: MigrationFlagsFile, cloud: MigrationFlagsFile): MigrationFlagsFile {
    const allFlags = [...local.flags, ...cloud.flags]

    // Deduplicate by migrationId, keeping the earliest completion
    const flagMap = new Map<string, MigrationFlag>()
    for (const flag of allFlags) {
      const existing = flagMap.get(flag.migrationId)
      if (!existing || new Date(flag.completedAt) < new Date(existing.completedAt)) {
        flagMap.set(flag.migrationId, flag)
      }
    }

    return {
      version: Math.max(local.version, cloud.version),
      flags: Array.from(flagMap.values()),
      lastUpdated: new Date().toISOString(),
    }
  }

  /**
   * Save migration flags to file
   * Also syncs to cloud if cloud sync is enabled
   */
  private saveFlags(flagsFile: MigrationFlagsFile): void {
    try {
      flagsFile.lastUpdated = new Date().toISOString()
      writeFileSync(this.flagsFilePath, JSON.stringify(flagsFile, null, 2), 'utf8')

      // Also save to cloud if available
      this.saveFlagsToCloud(flagsFile)
    }
    catch (error) {
      console.error(`Error saving migration flags: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw new Error(`Failed to save migration flags: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Save migration flags to cloud directory if cloud sync is enabled
   */
  private saveFlagsToCloud(flagsFile: MigrationFlagsFile): void {
    try {
      const syncConfigPath = join(this.configDir, 'sync.json')
      if (!existsSync(syncConfigPath)) {
        return
      }

      const syncConfig = JSON.parse(readFileSync(syncConfigPath, 'utf-8'))

      // Only save to cloud for iCloud, OneDrive, or custom sync (not S3)
      if (!syncConfig.enabled || syncConfig.provider === 's3') {
        return
      }

      const cloudPath = syncConfig.cloudPath || syncConfig.customPath
      if (!cloudPath) {
        return
      }

      const cloudConfigDir = join(cloudPath, '.start-claude')
      if (!existsSync(cloudConfigDir)) {
        mkdirSync(cloudConfigDir, { recursive: true })
      }

      const cloudFlagsPath = join(cloudConfigDir, 'migration-flags.json')
      writeFileSync(cloudFlagsPath, JSON.stringify(flagsFile, null, 2), 'utf8')
    }
    catch (error) {
      // Don't throw - cloud sync is not critical
      console.error(`Failed to sync migration flags to cloud: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
