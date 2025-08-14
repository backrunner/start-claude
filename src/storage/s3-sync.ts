import type { S3ClientConfig } from '@aws-sdk/client-s3'
import type { ConfigFile, SystemSettings } from '../config/types'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import inquirer from 'inquirer'
import { ConfigManager } from '../config/manager'
import { displayError, displayInfo, displaySuccess, displayWarning } from '../utils/cli/ui'
import { displayConflictResolution, resolveConfigConflicts } from '../utils/config/conflict-resolver'

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
  version?: number
  configVersion?: number
}

export interface SyncComparisonResult {
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

export class S3SyncManager {
  private s3Client: S3Client | null = null
  private configManager: ConfigManager
  private readonly CONFIG_PATH = join(homedir(), '.start-claude', 'config.json')

  constructor() {
    this.configManager = new ConfigManager()

    // Set up auto-sync callback when config changes
    this.configManager.setAutoSyncCallback(async () => this.autoUploadAfterChange())
  }

  private disableAutoSync(): void {
    this.configManager.setAutoSyncCallback(null)
  }

  private enableAutoSync(): void {
    this.configManager.setAutoSyncCallback(async () => this.autoUploadAfterChange())
  }

  private formatAwsError(error: unknown): string {
    const awsError = error as AwsError
    let errorMessage = 'Unknown error'
    let statusCode = ''

    if (error instanceof Error) {
      errorMessage = error.message
    }

    // Extract AWS SDK specific error details
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

  private getS3Config(): S3Config | null {
    const settings = this.configManager.getSettings()
    return settings.s3Sync || null
  }

  public getSystemSettings(): SystemSettings {
    return this.configManager.getSettings()
  }

  private normalizeS3Key(key: string): string {
    // Remove leading slash if present
    return key.startsWith('/') ? key.slice(1) : key
  }

  private initializeS3Client(config: S3Config): void {
    const clientConfig: S3ClientConfig = {
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
    catch (error: unknown) {
      const awsError = error as AwsError
      if (awsError.name === 'NotFound' || awsError.$metadata?.httpStatusCode === 404) {
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

      // Extract version info from metadata if available
      const configVersion = response.Metadata?.['config-version']
        ? Number.parseInt(response.Metadata['config-version'])
        : undefined

      return {
        lastModified: response.LastModified || new Date(),
        size: response.ContentLength || 0,
        exists: true,
        configVersion,
      }
    }
    catch (error: unknown) {
      const awsError = error as AwsError
      if (awsError.name === 'NotFound' || awsError.$metadata?.httpStatusCode === 404) {
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

  /**
   * Analyzes local and remote configurations to determine sync requirements
   */
  private async analyzeSyncRequirements(
    localConfig: ConfigFile,
    remoteInfo: S3ObjectInfo,
    localFileInfo: FileMetadata,
  ): Promise<SyncComparisonResult> {
    // If remote doesn't exist, upload local
    if (!remoteInfo.exists) {
      return {
        shouldSync: true,
        reason: 'Remote configuration does not exist',
        syncDirection: 'upload',
        hasVersionConflict: false,
        hasConfigConflicts: false,
      }
    }

    // If local doesn't exist, download remote
    if (localFileInfo.lastModified.getTime() === 0) {
      return {
        shouldSync: true,
        reason: 'Local configuration does not exist',
        syncDirection: 'download',
        hasVersionConflict: false,
        hasConfigConflicts: false,
      }
    }

    // Fetch remote config to compare versions and content
    let remoteConfig: ConfigFile | null = null
    try {
      const s3Config = this.getS3Config()!
      const command = new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
      })
      const response = await this.s3Client!.send(command)
      const configData = await response.Body!.transformToString()
      remoteConfig = JSON.parse(configData)
    }
    catch {
      // If we can't read remote config, fall back to timestamp comparison
      return this.fallbackTimestampComparison(localFileInfo, remoteInfo)
    }

    // Compare versions
    const localVersion = localConfig.version || 1
    const remoteVersion = remoteConfig?.version || 1
    const hasVersionConflict = localVersion !== remoteVersion

    // Detect configuration conflicts
    const conflictResolution = remoteConfig
      ? resolveConfigConflicts(localConfig, remoteConfig, { autoResolve: true })
      : { hasConflicts: false, conflicts: [] }
    const hasConfigConflicts = conflictResolution.hasConflicts

    // Version-based decision making
    if (localVersion > remoteVersion) {
      return {
        shouldSync: true,
        reason: `Local version (${localVersion}) is newer than remote (${remoteVersion})`,
        syncDirection: 'upload',
        hasVersionConflict,
        hasConfigConflicts,
      }
    }

    if (remoteVersion > localVersion) {
      return {
        shouldSync: true,
        reason: `Remote version (${remoteVersion}) is newer than local (${localVersion})`,
        syncDirection: 'download',
        hasVersionConflict,
        hasConfigConflicts,
      }
    }

    // Same version - check for conflicts
    if (hasConfigConflicts) {
      return {
        shouldSync: true,
        reason: 'Configuration conflicts detected requiring smart merge',
        syncDirection: 'conflict',
        hasVersionConflict,
        hasConfigConflicts,
      }
    }

    // Same version, no conflicts - check timestamps as tiebreaker
    const timeDiff = localFileInfo.lastModified.getTime() - remoteInfo.lastModified.getTime()
    const fiveMinutesMs = 5 * 60 * 1000

    if (Math.abs(timeDiff) < fiveMinutesMs) {
      return {
        shouldSync: false,
        reason: 'Configurations are in sync',
        syncDirection: 'download',
        hasVersionConflict,
        hasConfigConflicts,
      }
    }

    return {
      shouldSync: true,
      reason: timeDiff > 0 ? 'Local file is newer' : 'Remote file is newer',
      syncDirection: timeDiff > 0 ? 'upload' : 'download',
      hasVersionConflict,
      hasConfigConflicts,
    }
  }

  /**
   * Fallback comparison when remote config can't be parsed
   */
  private fallbackTimestampComparison(
    localFileInfo: FileMetadata,
    remoteInfo: S3ObjectInfo,
  ): SyncComparisonResult {
    const timeDiff = localFileInfo.lastModified.getTime() - remoteInfo.lastModified.getTime()

    if (Math.abs(timeDiff) < 5 * 60 * 1000) {
      return {
        shouldSync: false,
        reason: 'Files are in sync (timestamp comparison)',
        syncDirection: 'download',
        hasVersionConflict: false,
        hasConfigConflicts: false,
      }
    }

    return {
      shouldSync: true,
      reason: timeDiff > 0 ? 'Local file is newer (timestamp)' : 'Remote file is newer (timestamp)',
      syncDirection: timeDiff > 0 ? 'upload' : 'download',
      hasVersionConflict: false,
      hasConfigConflicts: false,
    }
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
          'config-version': configFile.version.toString(),
        },
      })

      await this.s3Client!.send(command)
      displaySuccess(`Configuration uploaded to S3 successfully! (${this.formatTimestamp(now)})`)
      return true
    }
    catch (error: unknown) {
      displayError(`Failed to upload to S3: ${this.formatAwsError(error)}`)
      return false
    }
  }

  async downloadConfigs(force = false, options: { silent?: boolean, verbose?: boolean } = {}): Promise<boolean> {
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

      // Get local config for comparison
      const localConfig = this.configManager.getConfigFile()
      const localFile = this.getLocalFileInfo()

      // Fetch remote config
      const command = new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
      })

      const response = await this.s3Client!.send(command)
      const configData = await response.Body!.transformToString()
      const remoteConfigFile: ConfigFile = JSON.parse(configData)

      // Smart conflict resolution
      if (localFile.lastModified.getTime() > 0 && !force) {
        const conflictResolution = resolveConfigConflicts(localConfig, remoteConfigFile, {
          autoResolve: options.silent,
          verbose: options.verbose,
        })

        if (conflictResolution.hasConflicts && !options.silent) {
          displayConflictResolution(conflictResolution, { verbose: options.verbose })

          const resolutionAnswer = await inquirer.prompt([
            {
              type: 'list',
              name: 'resolution',
              message: 'How would you like to resolve the configuration conflicts?',
              choices: [
                { name: 'Use smart merge (recommended)', value: 'merge' },
                { name: 'Use remote configuration', value: 'remote' },
                { name: 'Keep local configuration', value: 'local' },
                { name: 'Cancel download', value: 'cancel' },
              ],
              default: 'merge',
            },
          ])

          if (resolutionAnswer.resolution === 'cancel') {
            displayInfo('Download cancelled.')
            return false
          }

          let configToSave: ConfigFile
          switch (resolutionAnswer.resolution) {
            case 'merge':
              configToSave = conflictResolution.resolvedConfig
              displayInfo('✅ Applied smart merge resolution')
              break
            case 'remote':
              configToSave = remoteConfigFile
              displayInfo('✅ Using remote configuration')
              break
            case 'local':
              displayInfo('✅ Keeping local configuration')
              return true
            default:
              configToSave = conflictResolution.resolvedConfig
          }

          // Save the resolved configuration
          this.disableAutoSync()
          try {
            this.configManager.saveConfigFile(configToSave)
            displaySuccess(`Configuration synchronized with conflict resolution! (${this.formatTimestamp(remoteInfo.lastModified)})`)
            return true
          }
          finally {
            this.enableAutoSync()
          }
        }
        else if (conflictResolution.hasConflicts && options.silent) {
          // Silent mode with conflicts - use smart merge
          this.disableAutoSync()
          try {
            this.configManager.saveConfigFile(conflictResolution.resolvedConfig)
            if (options.verbose) {
              displayInfo(`✅ Silent conflict resolution applied (${conflictResolution.conflicts.length} conflicts resolved)`)
            }
            return true
          }
          finally {
            this.enableAutoSync()
          }
        }
      }

      // No conflicts or force mode - direct download
      this.disableAutoSync()
      try {
        this.configManager.saveConfigFile(remoteConfigFile)
        displaySuccess(`Configuration downloaded from S3 successfully! (${this.formatTimestamp(remoteInfo.lastModified)})`)
        return true
      }
      finally {
        this.enableAutoSync()
      }
    }
    catch (error: unknown) {
      console.error(error)
      displayError(`Failed to download from S3: ${this.formatAwsError(error)}`)
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
      }
      else if (remoteInfo.lastModified > localFile.lastModified) {
        displayInfo('Remote file is newer, downloading from S3...')
        return await this.downloadConfigs(true)
      }
      else {
        displayInfo('Files are in sync.')
        return true
      }
    }
    catch (error: unknown) {
      displayError(`Failed to sync configs: ${this.formatAwsError(error)}`)
      return false
    }
  }

  /**
   * Check if automatic sync should occur and perform it silently
   * Returns true if sync was performed or not needed
   * Enhanced with version checking and smart conflict resolution
   */
  async checkAutoSync(): Promise<boolean> {
    if (!this.isS3Configured()) {
      return true // No S3 config, nothing to sync
    }

    try {
      this.initializeS3Client(this.getS3Config()!)

      const localConfig = this.configManager.getConfigFile()
      const localFile = this.getLocalFileInfo()
      const remoteInfo = await this.getS3ObjectInfo(this.getS3Config()!)

      // Use enhanced sync analysis
      const syncAnalysis = await this.analyzeSyncRequirements(localConfig, remoteInfo, localFile)

      if (!syncAnalysis.shouldSync) {
        return true // No sync needed
      }

      // Perform sync based on analysis
      switch (syncAnalysis.syncDirection) {
        case 'upload':
          return await this.uploadConfigs(true)

        case 'download':
          // Silent download with conflict resolution
          return await this.downloadConfigs(true, { silent: true, verbose: false })

        case 'conflict':
          // Silent conflict resolution - auto-merge conflicts
          return await this.downloadConfigs(true, { silent: true, verbose: false })

        default:
          return true
      }
    }
    catch {
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
    catch (error: unknown) {
      displayError(`Failed to check remote updates: ${this.formatAwsError(error)}`)
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
