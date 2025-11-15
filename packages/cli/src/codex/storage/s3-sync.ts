import type { S3ClientConfig } from '@aws-sdk/client-s3'
import type { CodexConfigFile, CodexSettings } from '../config/types'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import dayjs from 'dayjs'
import { UILogger } from '../../utils/cli/ui'

export interface CodexS3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  key: string
  endpointUrl?: string
}

export interface CodexSyncComparisonResult {
  shouldSync: boolean
  reason: string
  syncDirection: 'upload' | 'download' | 'conflict'
  hasVersionConflict: boolean
  hasConfigConflicts: boolean
}

interface AwsError {
  name?: string
  message?: string
  Code?: string
  $fault?: string
  $metadata?: {
    httpStatusCode?: number
  }
}

/**
 * S3 Sync Manager for Codex configurations
 */
export class CodexS3SyncManager {
  private static instance: CodexS3SyncManager
  private s3Client: S3Client | null = null
  private readonly CONFIG_PATH = join(homedir(), '.start-codex', 'config.json')

  constructor() {}

  static getInstance(): CodexS3SyncManager {
    if (!CodexS3SyncManager.instance) {
      CodexS3SyncManager.instance = new CodexS3SyncManager()
    }
    return CodexS3SyncManager.instance
  }

  private formatAwsError(error: unknown): string {
    const awsError = error as AwsError
    let errorMessage = 'Unknown error'
    let statusCode = ''

    if (error instanceof Error) {
      errorMessage = error.message
    }

    if (awsError.$metadata?.httpStatusCode) {
      statusCode = ` (HTTP ${awsError.$metadata.httpStatusCode})`
    }

    if (awsError.Code) {
      errorMessage = `${awsError.Code}: ${errorMessage}`
    }

    if (awsError.$fault) {
      errorMessage = `${awsError.$fault} - ${errorMessage}`
    }

    return `${errorMessage}${statusCode}`
  }

  private async getS3Config(): Promise<CodexS3Config | null> {
    const configManager = await this.getConfigManager()
    const s3Config = configManager.getSettings().s3Sync

    if (s3Config) {
      // Validate required fields
      if (!s3Config.bucket || !s3Config.region || !s3Config.accessKeyId || !s3Config.secretAccessKey) {
        throw new Error('S3 config is missing required fields: bucket, region, accessKeyId, or secretAccessKey')
      }

      return {
        bucket: s3Config.bucket,
        region: s3Config.region,
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
        key: s3Config.prefix ? `${s3Config.prefix}/config.json` : 'codex-configs/config.json',
        endpointUrl: s3Config.endpoint,
      }
    }

    return null
  }

  public getSystemSettings(): CodexSettings {
    const configManager = this.getConfigManager()
    return configManager.getSettings()
  }

  private getConfigManager(): any {
    // Lazy import to avoid circular dependency
    // eslint-disable-next-line ts/no-require-imports
    const { CodexConfigManager } = require('../config/manager') as typeof import('../config/manager')
    return CodexConfigManager.getInstance()
  }

  private normalizeS3Key(key: string | undefined | null): string {
    if (!key) {
      return 'codex-configs/config.json'
    }
    return key.trim()
  }

  private async initS3Client(): Promise<S3Client> {
    if (this.s3Client) {
      return this.s3Client
    }

    const s3Config = await this.getS3Config()
    if (!s3Config) {
      throw new Error('S3 configuration not found')
    }

    const clientConfig: S3ClientConfig = {
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
    }

    if (s3Config.endpointUrl) {
      clientConfig.endpoint = s3Config.endpointUrl
      clientConfig.forcePathStyle = true
    }

    this.s3Client = new S3Client(clientConfig)
    return this.s3Client
  }

  /**
   * Upload local config to S3
   * TODO: Add conflict detection and timestamp checking
   */
  async uploadConfigs(): Promise<boolean> {
    const ui = new UILogger()

    try {
      if (!existsSync(this.CONFIG_PATH)) {
        ui.displayError('Local config file not found')
        return false
      }

      const s3Config = await this.getS3Config()
      if (!s3Config) {
        ui.displayError('S3 configuration not found')
        return false
      }

      const client = await this.initS3Client()
      const configContent = readFileSync(this.CONFIG_PATH, 'utf-8')

      const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
        Body: configContent,
        ContentType: 'application/json',
      })

      await client.send(command)

      // Update last sync time
      const configManager = this.getConfigManager()
      const settings = configManager.getSettings()
      if (settings.s3Sync) {
        settings.s3Sync.lastSyncAt = dayjs().toISOString()
        configManager.updateSettings(settings, true)
      }

      ui.displaySuccess('Codex config uploaded to S3 successfully')
      return true
    }
    catch (error) {
      ui.displayError(`Failed to upload Codex config to S3: ${this.formatAwsError(error)}`)
      return false
    }
  }

  /**
   * Download config from S3 to local
   * TODO: Add conflict detection and timestamp checking
   */
  async downloadConfigs(): Promise<boolean> {
    const ui = new UILogger()

    try {
      const s3Config = await this.getS3Config()
      if (!s3Config) {
        ui.displayError('S3 configuration not found')
        return false
      }

      const client = await this.initS3Client()

      const command = new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
      })

      const response = await client.send(command)
      const configContent = await response.Body?.transformToString('utf-8')

      if (!configContent) {
        ui.displayError('Empty config received from S3')
        return false
      }

      // Validate JSON
      const configData = JSON.parse(configContent) as CodexConfigFile

      // Save to local
      const configManager = this.getConfigManager()
      configManager.saveConfigFile(configData, true)

      // Update last sync time
      const settings = configManager.getSettings()
      if (settings.s3Sync) {
        settings.s3Sync.lastSyncAt = dayjs().toISOString()
        configManager.updateSettings(settings, true)
      }

      ui.displaySuccess('Codex config downloaded from S3 successfully')
      return true
    }
    catch (error) {
      ui.displayError(`Failed to download Codex config from S3: ${this.formatAwsError(error)}`)
      return false
    }
  }

  /**
   * Check if S3 is configured
   */
  async isS3Configured(): Promise<boolean> {
    try {
      const config = await this.getS3Config()
      return config !== null
    }
    catch {
      return false
    }
  }

  /**
   * Auto-upload after config changes
   */
  async autoUploadAfterChange(): Promise<void> {
    try {
      const settings = this.getSystemSettings()
      if (settings.s3Sync?.enabled && settings.s3Sync?.autoSync) {
        await this.uploadConfigs()
      }
    }
    catch (error) {
      console.error('Auto-upload failed:', error)
    }
  }

  /**
   * Test S3 connection
   */
  async testConnection(): Promise<boolean> {
    const ui = new UILogger()

    try {
      const s3Config = await this.getS3Config()
      if (!s3Config) {
        ui.displayError('S3 configuration not found')
        return false
      }

      const client = await this.initS3Client()

      const command = new HeadObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
      })

      await client.send(command)
      ui.displaySuccess('S3 connection successful')
      return true
    }
    catch (error) {
      const awsError = error as AwsError
      if (awsError.$metadata?.httpStatusCode === 404) {
        ui.displayInfo('S3 bucket accessible (config file not found yet)')
        return true
      }
      ui.displayError(`S3 connection failed: ${this.formatAwsError(error)}`)
      return false
    }
  }
}
