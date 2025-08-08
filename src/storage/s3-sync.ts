import type { ConfigFile } from '../core/types'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import inquirer from 'inquirer'
import { ConfigManager } from '../core/config'
import { displayError, displayInfo, displaySuccess, displayWarning } from '../utils/ui'

export interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  key: string
  endpointUrl?: string // For S3-compatible services like Cloudflare R2, Backblaze B2
}

export interface FileMetadata {
  lastModified: Date
  localPath: string
}

export interface S3ObjectInfo {
  lastModified: Date
  size: number
  exists: boolean
}

export class S3SyncManager {
  private s3Client: S3Client | null = null
  private configManager: ConfigManager
  private readonly CONFIG_PATH = join(homedir(), '.start-claude', 'config.json')

  constructor() {
    this.configManager = new ConfigManager()
    
    // Set up auto-sync callback when config changes
    this.configManager.setAutoSyncCallback(() => this.autoUploadAfterChange())
  }

  private getS3Config(): S3Config | null {
    const settings = this.configManager.getSettings()
    return settings.s3Sync || null
  }

  public getSystemSettings(): any {
    return this.configManager.getSettings()
  }

  private normalizeS3Key(key: string): string {
    // Remove leading slash if present
    return key.startsWith('/') ? key.slice(1) : key
  }

  private initializeS3Client(config: S3Config): void {
    const clientConfig: any = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }

    // Add custom endpoint for S3-compatible services
    if (config.endpointUrl) {
      clientConfig.endpoint = config.endpointUrl
      // Force path-style addressing for S3-compatible services
      clientConfig.forcePathStyle = true
    }

    this.s3Client = new S3Client(clientConfig)
  }

  async setupS3Sync(config: S3Config): Promise<boolean> {
    try {
      this.initializeS3Client(config)

      // Test the connection by trying to check if the key exists
      const remoteExists = await this.checkS3KeyExists(config)

      // Save the S3 configuration with normalized key
      this.configManager.updateSettings({
        s3Sync: {
          ...config,
          key: this.normalizeS3Key(config.key),
        },
      })

      displaySuccess('S3 sync configuration saved successfully!')

      // Check local configs existence
      const localConfigs = this.configManager.listConfigs()
      const hasLocalConfigs = localConfigs.length > 0

      if (remoteExists && !hasLocalConfigs) {
        // Remote exists, no local configs - auto download
        displayInfo('Remote configuration found, downloading automatically...')
        await this.downloadConfigs(true)
        return true
      }
      else if (!remoteExists && hasLocalConfigs) {
        // No remote, has local configs - auto upload
        displayInfo('No remote configuration found, uploading local configs...')
        await this.uploadConfigs()
        return false
      }
      else if (remoteExists && hasLocalConfigs) {
        // Both exist - prompt user to decide
        displayWarning('Both remote and local configurations exist.')

        const overwriteAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Download remote configuration and overwrite local configs?',
            default: false,
          },
        ])

        if (overwriteAnswer.overwrite) {
          await this.downloadConfigs(true)
        }
        return true
      }

      // Neither exists - just return false
      return false
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      displayError(`Failed to setup S3 sync: ${errorMessage}`)
      return false
    }
  }

  private async checkS3KeyExists(config: S3Config): Promise<boolean> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized')
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: config.bucket,
        Key: this.normalizeS3Key(config.key),
      })

      await this.s3Client.send(command)
      return true
    }
    catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false
      }
      throw error
    }
  }

  private async getS3ObjectInfo(config: S3Config): Promise<S3ObjectInfo> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized')
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: config.bucket,
        Key: this.normalizeS3Key(config.key),
      })

      const response = await this.s3Client.send(command)
      return {
        lastModified: response.LastModified || new Date(),
        size: response.ContentLength || 0,
        exists: true,
      }
    }
    catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return {
          lastModified: new Date(0),
          size: 0,
          exists: false,
        }
      }
      throw error
    }
  }

  private getLocalFileInfo(): FileMetadata {
    if (!existsSync(this.CONFIG_PATH)) {
      return {
        lastModified: new Date(0),
        localPath: this.CONFIG_PATH,
      }
    }

    const stats = statSync(this.CONFIG_PATH)
    return {
      lastModified: stats.mtime,
      localPath: this.CONFIG_PATH,
    }
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    })
  }

  async uploadConfigs(force = false): Promise<boolean> {
    const s3Config = this.getS3Config()
    if (!s3Config) {
      displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
      return false
    }

    try {
      this.initializeS3Client(s3Config)

      // Get file timestamps for comparison
      const localFile = this.getLocalFileInfo()
      const remoteInfo = await this.getS3ObjectInfo(s3Config)

      // Check if we need to warn about overwriting newer remote file
      if (!force && remoteInfo.exists && remoteInfo.lastModified > localFile.lastModified) {
        displayWarning('⚠️  Remote file is newer than local file!')
        displayInfo(`Local file:  ${this.formatTimestamp(localFile.lastModified)}`)
        displayInfo(`Remote file: ${this.formatTimestamp(remoteInfo.lastModified)}`)
        
        const overwriteAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Upload local file and overwrite newer remote configuration?',
            default: false,
          },
        ])

        if (!overwriteAnswer.overwrite) {
          displayInfo('Upload cancelled.')
          return false
        }
      }

      const configFile = this.configManager.getConfigFile()
      const configData = JSON.stringify(configFile, null, 2)
      const now = new Date()

      const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
        Body: configData,
        ContentType: 'application/json',
        Metadata: {
          'upload-timestamp': now.toISOString(),
          'local-modified': localFile.lastModified.toISOString(),
        },
      })

      await this.s3Client!.send(command)
      displaySuccess(`Configuration uploaded to S3 successfully! (${this.formatTimestamp(now)})`)
      return true
    }
    catch (error) {
      displayError(`Failed to upload to S3: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  async downloadConfigs(force = false): Promise<boolean> {
    const s3Config = this.getS3Config()
    if (!s3Config) {
      displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
      return false
    }

    try {
      this.initializeS3Client(s3Config)

      const remoteInfo = await this.getS3ObjectInfo(s3Config)
      if (!remoteInfo.exists) {
        displayWarning('No configuration found on S3.')
        return false
      }

      // Get local file info for comparison
      const localFile = this.getLocalFileInfo()
      const localConfigs = this.configManager.listConfigs()
      
      // Check if local configs exist and we're not forcing
      if (localConfigs.length > 0 && !force) {
        // Check timestamps and warn if local is newer
        if (localFile.lastModified > remoteInfo.lastModified) {
          displayWarning('⚠️  Local file is newer than remote file!')
          displayInfo(`Local file:  ${this.formatTimestamp(localFile.lastModified)}`)
          displayInfo(`Remote file: ${this.formatTimestamp(remoteInfo.lastModified)}`)
          
          const overwriteAnswer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: 'Download older remote file and overwrite local configuration?',
              default: false,
            },
          ])

          if (!overwriteAnswer.overwrite) {
            displayInfo('Download cancelled.')
            return false
          }
        } else {
          // Remote is newer or same, show timestamps
          displayInfo(`Local file:  ${this.formatTimestamp(localFile.lastModified)}`)
          displayInfo(`Remote file: ${this.formatTimestamp(remoteInfo.lastModified)}`)
          
          const overwriteAnswer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: 'Download remote configuration and overwrite local configs?',
              default: remoteInfo.lastModified > localFile.lastModified,
            },
          ])

          if (!overwriteAnswer.overwrite) {
            displayInfo('Download cancelled.')
            return false
          }
        }
      }

      const command = new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
      })

      const response = await this.s3Client!.send(command)
      const configData = await response.Body!.transformToString()
      const remoteConfigFile: ConfigFile = JSON.parse(configData)

      // Save the downloaded configuration
      this.configManager.saveConfigFile(remoteConfigFile)
      displaySuccess(`Configuration downloaded from S3 successfully! (${this.formatTimestamp(remoteInfo.lastModified)})`)
      return true
    }
    catch (error) {
      displayError(`Failed to download from S3: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  async syncConfigs(): Promise<boolean> {
    const s3Config = this.getS3Config()
    if (!s3Config) {
      displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
      return false
    }

    try {
      this.initializeS3Client(s3Config)
      
      const localFile = this.getLocalFileInfo()
      const remoteInfo = await this.getS3ObjectInfo(s3Config)
      
      if (!remoteInfo.exists) {
        // No remote file, upload local
        displayInfo('No remote configuration found, uploading local configs...')
        return await this.uploadConfigs(true)
      }
      
      if (localFile.lastModified.getTime() === 0) {
        // No local file, download remote
        displayInfo('No local configuration found, downloading from S3...')
        return await this.downloadConfigs(true)
      }
      
      // Both files exist, compare timestamps
      if (localFile.lastModified > remoteInfo.lastModified) {
        displayInfo('Local file is newer, uploading to S3...')
        return await this.uploadConfigs(true)
      } else if (remoteInfo.lastModified > localFile.lastModified) {
        displayInfo('Remote file is newer, downloading from S3...')
        return await this.downloadConfigs(true)
      } else {
        displayInfo('Files are in sync.')
        return true
      }
    }
    catch (error) {
      displayError(`Failed to sync configs: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Check if automatic sync should occur and perform it silently
   * Returns true if sync was performed or not needed
   */
  async checkAutoSync(): Promise<boolean> {
    if (!this.isS3Configured()) {
      return true // No S3 config, nothing to sync
    }

    try {
      this.initializeS3Client(this.getS3Config()!)
      
      const localFile = this.getLocalFileInfo()
      const remoteInfo = await this.getS3ObjectInfo(this.getS3Config()!)
      
      if (!remoteInfo.exists) {
        // No remote file, upload local if it exists
        if (localFile.lastModified.getTime() > 0) {
          return await this.uploadConfigs(true)
        }
        return true
      }
      
      if (localFile.lastModified.getTime() === 0) {
        // No local file, download remote
        return await this.downloadConfigs(true)
      }
      
      // Both files exist, auto-sync only if one is clearly newer
      const timeDiffMs = Math.abs(localFile.lastModified.getTime() - remoteInfo.lastModified.getTime())
      const fiveMinutesMs = 5 * 60 * 1000
      
      if (timeDiffMs < fiveMinutesMs) {
        // Files are very close in time, don't auto-sync
        return true
      }
      
      if (localFile.lastModified > remoteInfo.lastModified) {
        return await this.uploadConfigs(true)
      } else {
        return await this.downloadConfigs(true)
      }
    }
    catch (error) {
      // Silent fail for auto-sync
      return true
    }
  }

  /**
   * Check for remote updates with user prompt (for balance mode)
   */
  async checkRemoteUpdates(): Promise<boolean> {
    if (!this.isS3Configured()) {
      return false
    }

    try {
      this.initializeS3Client(this.getS3Config()!)
      
      const localFile = this.getLocalFileInfo()
      const remoteInfo = await this.getS3ObjectInfo(this.getS3Config()!)
      
      if (!remoteInfo.exists) {
        return false
      }
      
      if (localFile.lastModified.getTime() === 0) {
        // No local file, download remote
        displayInfo('Remote configuration found, downloading...')
        return await this.downloadConfigs(true)
      }
      
      // Check if remote is newer
      if (remoteInfo.lastModified > localFile.lastModified) {
        const timeDiff = Math.round((remoteInfo.lastModified.getTime() - localFile.lastModified.getTime()) / 1000)
        displayWarning(`🔄 Newer configuration available on S3 (${timeDiff} seconds newer)`)
        displayInfo(`Local file:  ${this.formatTimestamp(localFile.lastModified)}`)
        displayInfo(`Remote file: ${this.formatTimestamp(remoteInfo.lastModified)}`)
        
        const updateAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'update',
            message: 'Download newer configuration from S3?',
            default: true,
          },
        ])

        if (updateAnswer.update) {
          return await this.downloadConfigs(true)
        }
      }
      
      return false
    }
    catch (error) {
      displayError(`Failed to check remote updates: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Trigger automatic upload after local config changes
   */
  async autoUploadAfterChange(): Promise<void> {
    if (!this.isS3Configured()) {
      return
    }

    try {
      // Small delay to ensure file is written completely
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      await this.uploadConfigs(true)
    }
    catch (error) {
      // Silent fail for auto-upload, but log for debugging
      console.error('Auto-upload failed:', error)
    }
  }

  isS3Configured(): boolean {
    return this.getS3Config() !== null
  }

  getS3Status(): string {
    const config = this.getS3Config()
    if (!config) {
      return 'Not configured'
    }
    const endpoint = config.endpointUrl ? ` Endpoint: ${config.endpointUrl},` : ''
    return `Configured (Bucket: ${config.bucket}, Region: ${config.region},${endpoint} Key: ${this.normalizeS3Key(config.key)})`
  }
}
