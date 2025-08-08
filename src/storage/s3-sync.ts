import type { ConfigFile } from '../core/types'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
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

export class S3SyncManager {
  private s3Client: S3Client | null = null
  private configManager: ConfigManager

  constructor() {
    this.configManager = new ConfigManager()
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

  async uploadConfigs(): Promise<boolean> {
    const s3Config = this.getS3Config()
    if (!s3Config) {
      displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
      return false
    }

    try {
      this.initializeS3Client(s3Config)

      const configFile = this.configManager.getConfigFile()
      const configData = JSON.stringify(configFile, null, 2)

      const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
        Body: configData,
        ContentType: 'application/json',
      })

      await this.s3Client!.send(command)
      displaySuccess('Configuration uploaded to S3 successfully!')
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

      const exists = await this.checkS3KeyExists(s3Config)
      if (!exists) {
        displayWarning('No configuration found on S3.')
        return false
      }

      // Check if local configs exist and prompt user
      const localConfigs = this.configManager.listConfigs()
      if (localConfigs.length > 0 && !force) {
        displayWarning('Local configurations exist. Use --force to overwrite or handle this in the calling code.')
        return false
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
      displaySuccess('Configuration downloaded from S3 successfully!')
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

    displayInfo('Syncing configurations with S3...')

    // First try to upload local configs
    const uploadSuccess = await this.uploadConfigs()
    if (uploadSuccess) {
      displayInfo('Local configurations synced to S3.')
    }

    return uploadSuccess
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
