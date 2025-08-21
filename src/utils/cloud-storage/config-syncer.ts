import { copyFileSync, existsSync, mkdirSync, readlinkSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import inquirer from 'inquirer'
import { UILogger } from '../cli/ui'

export interface ConfigFileInfo {
  name: string
  localPath: string
  cloudFileName: string
  description: string
}

export interface CloudSyncOptions {
  cloudPath: string
  overwritePromptMessage?: string
  backupOnReplace?: boolean
  verbose?: boolean
}

/**
 * Generalized cloud storage sync utility for configuration files
 * This replaces specific methods like syncS3ConfigToCloud with a reusable approach
 */
export class CloudConfigSyncer {
  /**
   * Check if a file is a symlink with Windows compatibility
   */
  private static isSymlinkCompatible(filePath: string): boolean {
    try {
      // On Windows, check if we can read the symlink target
      if (process.platform === 'win32') {
        try {
          readlinkSync(filePath)
          return true
        }
        catch {
          return false
        }
      }
      else {
        // On Unix systems, use standard isSymbolicLink check
        const stats = statSync(filePath)
        return stats.isSymbolicLink()
      }
    }
    catch {
      return false
    }
  }

  /**
   * Create symlink for a config file
   */
  private static createSymlink(sourcePath: string, targetPath: string): void {
    if (process.platform === 'win32') {
      symlinkSync(sourcePath, targetPath, 'file')
    }
    else {
      symlinkSync(sourcePath, targetPath)
    }
  }

  /**
   * Sync a single configuration file to cloud storage
   */
  static async syncConfigFileToCloud(
    configInfo: ConfigFileInfo,
    options: CloudSyncOptions,
  ): Promise<void> {
    if (!existsSync(configInfo.localPath)) {
      if (options.verbose) {
        new UILogger().displayInfo(`ℹ️  No ${configInfo.description} found to sync`)
      }
      return
    }

    const cloudConfigDir = join(options.cloudPath, '.start-claude')
    const cloudConfigPath = join(cloudConfigDir, configInfo.cloudFileName)

    try {
      // Ensure cloud config directory exists
      if (!existsSync(cloudConfigDir)) {
        mkdirSync(cloudConfigDir, { recursive: true })
      }

      // Handle existing cloud config
      if (existsSync(cloudConfigPath)) {
        const promptMessage = options.overwritePromptMessage
          || `${configInfo.description} already exists in cloud folder. Overwrite with local version?`

        const { overwrite } = await inquirer.prompt([{
          type: 'confirm',
          name: 'overwrite',
          message: promptMessage,
          default: false,
        }])

        if (overwrite) {
          copyFileSync(configInfo.localPath, cloudConfigPath)
          new UILogger().displayInfo(`📤 Copied local ${configInfo.description} to cloud folder`)
        }
        else {
          new UILogger().displayInfo(`📥 Using existing ${configInfo.description} from cloud folder`)
        }
      }
      else {
        copyFileSync(configInfo.localPath, cloudConfigPath)
        new UILogger().displayInfo(`📤 Copied ${configInfo.description} to cloud folder`)
      }

      // Create symlink if not already a symlink
      if (!this.isSymlinkCompatible(configInfo.localPath)) {
        // Backup original file if requested
        if (options.backupOnReplace) {
          const backupPath = `${configInfo.localPath}.backup.${Date.now()}`
          copyFileSync(configInfo.localPath, backupPath)
          new UILogger().displayInfo(`💾 Backed up ${configInfo.description} to: ${backupPath}`)
        }

        // Remove original and create symlink
        unlinkSync(configInfo.localPath)
        this.createSymlink(cloudConfigPath, configInfo.localPath)
        new UILogger().displayInfo(`🔗 Created symlink for ${configInfo.description} to cloud storage`)
      }
    }
    catch (error) {
      new UILogger().displayWarning(`⚠️  Failed to sync ${configInfo.description} to cloud: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Sync multiple configuration files to cloud storage
   */
  static async syncConfigFilesToCloud(
    configFiles: ConfigFileInfo[],
    options: CloudSyncOptions,
  ): Promise<void> {
    for (const configFile of configFiles) {
      await this.syncConfigFileToCloud(configFile, options)
    }
  }

  /**
   * Get standard configuration files for syncing
   */
  static getStandardConfigFiles(): ConfigFileInfo[] {
    const configDir = join(homedir(), '.start-claude')

    return [
      {
        name: 'main-config',
        localPath: join(configDir, 'config.json'),
        cloudFileName: 'config.json',
        description: 'main configuration',
      },
      {
        name: 's3-config',
        localPath: join(configDir, 's3-config.json'),
        cloudFileName: 's3-config.json',
        description: 'S3 configuration',
      },
    ]
  }
}
