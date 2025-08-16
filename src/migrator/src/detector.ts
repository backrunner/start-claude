import { existsSync, readFileSync } from 'node:fs'

/**
 * Ultra-lightweight migration detector that only reads config files
 * No dynamic imports, no heavy dependencies - optimized for CLI startup performance
 */
export class MigrationDetector {
  /**
   * Quick check if a config file needs migration
   * Returns null if no migration needed, or version info if migration required
   */
  static quickCheck(configPath: string, currentVersion: number): {
    needsMigration: boolean
    fileVersion: number
    targetVersion: number
  } | null {
    if (!existsSync(configPath)) {
      return null
    }

    try {
      // Only read the minimum required data
      const content = readFileSync(configPath, 'utf8')

      // Fast JSON parsing - only extract version field
      const versionMatch = content.match(/"version"\s*:\s*(\d+)/)
      const fileVersion = versionMatch ? Number.parseInt(versionMatch[1], 10) : 1

      if (fileVersion >= currentVersion) {
        return {
          needsMigration: false,
          fileVersion,
          targetVersion: currentVersion,
        }
      }

      return {
        needsMigration: true,
        fileVersion,
        targetVersion: currentVersion,
      }
    }
    catch {
      // If we can't parse the config, assume it's valid
      return null
    }
  }

  /**
   * Batch check multiple config files
   */
  static batchCheck(configPaths: string[], currentVersion: number): Map<string, ReturnType<typeof MigrationDetector.quickCheck>> {
    const results = new Map<string, ReturnType<typeof MigrationDetector.quickCheck>>()

    for (const path of configPaths) {
      results.set(path, this.quickCheck(path, currentVersion))
    }

    return results
  }

  /**
   * Check if any config files in a list need migration
   */
  static anyNeedMigration(configPaths: string[], currentVersion: number): boolean {
    for (const path of configPaths) {
      const result = this.quickCheck(path, currentVersion)
      if (result?.needsMigration) {
        return true
      }
    }
    return false
  }
}
