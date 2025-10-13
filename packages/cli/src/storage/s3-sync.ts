import type { S3ClientConfig } from '@aws-sdk/client-s3'
import type { ConfigFile, SystemSettings } from '../config/types'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import dayjs from 'dayjs'
import inquirer from 'inquirer'
import { UILogger } from '../utils/cli/ui'
import {
  displayConflictResolution,
  resolveConfigConflicts,
} from '../utils/config/conflict-resolver'

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
  private static instance: S3SyncManager
  private s3Client: S3Client | null = null
  private readonly CONFIG_PATH = join(homedir(), '.start-claude', 'config.json')
  private readonly SYNC_STATE_PATH = join(homedir(), '.start-claude', 'sync.json')

  constructor() {
    // Simplified constructor - no dependencies or callbacks
  }

  static getInstance(): S3SyncManager {
    if (!S3SyncManager.instance) {
      S3SyncManager.instance = new S3SyncManager()
    }
    return S3SyncManager.instance
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

  private async getS3Config(): Promise<S3Config | null> {
    // Prefer standalone S3 config file if present; fallback to settings.s3Sync for backward compatibility
    try {
      const { S3ConfigFileManager } = await import('../config/s3-config')
      const fileMgr = S3ConfigFileManager.getInstance()
      const fileConfig = fileMgr.getS3Config()
      if (fileConfig) {
        const config = fileConfig as unknown as S3Config
        // Validate required fields
        if (!config.bucket || !config.region || !config.accessKeyId || !config.secretAccessKey || !config.key) {
          throw new Error('S3 config is missing required fields: bucket, region, accessKeyId, secretAccessKey, or key')
        }
        return config
      }
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('missing required fields')) {
        throw error // Re-throw validation errors
      }
      // Log other errors but continue to fallback
      console.error('Error loading S3 config file:', error)
    }

    const configManager = await this.getConfigManager()
    const s3Config = configManager.getSettings().s3Sync

    if (s3Config) {
      // Validate required fields for fallback config too
      if (!s3Config.bucket || !s3Config.region || !s3Config.accessKeyId || !s3Config.secretAccessKey || !s3Config.key) {
        throw new Error('S3 config is missing required fields: bucket, region, accessKeyId, secretAccessKey, or key')
      }
    }

    return s3Config || null
  }

  public async getSystemSettings(): Promise<SystemSettings> {
    const configManager = await this.getConfigManager()
    return configManager.getSettings()
  }

  private async getConfigManager(): Promise<any> {
    // Get ConfigManager instance when needed to avoid circular dependency
    const { ConfigManager } = await import('../config/manager')
    return ConfigManager.getInstance()
  }

  private normalizeS3Key(key: string | undefined | null): string {
    // Handle undefined/null keys
    if (!key) {
      throw new Error('S3 key cannot be undefined or null')
    }
    // Remove leading slash if present
    return key.startsWith('/') ? key.slice(1) : key
  }

  private initializeS3Client(
    config: S3Config,
    options: { verbose?: boolean } = {},
  ): void {
    const logger = new UILogger(options.verbose)
    logger.displayVerbose(
      `🔄 Initializing S3 client for bucket: ${config.bucket} in region: ${config.region}`,
    )

    const clientConfig: S3ClientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }

    // Add custom endpoint for S3-compatible services
    if (config.endpointUrl) {
      logger.displayVerbose(`🌐 Using custom endpoint: ${config.endpointUrl}`)
      clientConfig.endpoint = config.endpointUrl
      // Force path-style addressing for S3-compatible services
      clientConfig.forcePathStyle = true
    }

    this.s3Client = new S3Client(clientConfig)
    logger.displayVerbose(`✅ S3 client initialized successfully`)
  }

  /**
   * Check whether a local cloud sync (iCloud/OneDrive/Custom) is enabled.
   * When true, S3 should be treated as backup (upload-only).
   * Reads ~/.start-claude/sync.json directly to avoid circular deps.
   */
  private isCloudSyncEnabled(): boolean {
    try {
      if (!existsSync(this.SYNC_STATE_PATH))
        return false
      const raw = readFileSync(this.SYNC_STATE_PATH, 'utf-8')
      const state = JSON.parse(raw) as { enabled?: boolean, provider?: string }
      return Boolean(state?.enabled) && state?.provider !== 's3'
    }
    catch {
      return false
    }
  }

  async setupS3Sync(config: S3Config, options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      const logger = new UILogger(options.verbose)
      logger.displayVerbose(`🔧 Setting up S3 sync configuration...`)
      this.initializeS3Client(config, options)

      // Test the connection by trying to check if the key exists
      logger.displayVerbose(
        `🔍 Checking remote storage for existing configuration...`,
      )
      const remoteExists = await this.checkS3KeyExists(config, options)

      // Save the S3 configuration with normalized key
      const configManager = await this.getConfigManager()
      await configManager.updateSettings({
        s3Sync: {
          ...config,
          key: this.normalizeS3Key(config.key),
        },
      })

      logger.displaySuccess('S3 sync configuration saved successfully!')

      // Check local configs existence
      const localConfigs = configManager.listConfigs()
      const hasLocalConfigs = localConfigs.length > 0

      logger.displayVerbose(
        `📁 Local configurations found: ${hasLocalConfigs ? 'Yes' : 'No'}`,
      )
      logger.displayVerbose(
        `☁️  Remote configuration found: ${remoteExists ? 'Yes' : 'No'}`,
      )

      if (remoteExists && !hasLocalConfigs) {
        // Remote exists, no local configs - auto download
        logger.displayInfo(
          '📥 Remote configuration found, downloading automatically...',
        )
        await this.downloadConfigs(true)
        return true
      }
      else if (!remoteExists && hasLocalConfigs) {
        // No remote, has local configs - auto upload
        logger.displayInfo(
          '📤 No remote configuration found, uploading local configs...',
        )
        await this.uploadConfigs()
        return false
      }
      else if (remoteExists && hasLocalConfigs) {
        // Both exist - prompt user to decide
        logger.displayWarning(
          '⚠️  Both remote and local configurations exist.',
        )

        const overwriteAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message:
              'Download remote configuration and overwrite local configs?',
            default: false,
          },
        ])

        if (overwriteAnswer.overwrite) {
          await this.downloadConfigs(true)
        }
        return true
      }

      // Neither exists - just return false
      logger.displayVerbose('ℹ️  No configurations found locally or remotely')
      return false
    }
    catch (error) {
      const errorMessage
        = error instanceof Error ? error.message : 'Unknown error'
      const logger = new UILogger()
      logger.displayError(`Failed to setup S3 sync: ${errorMessage}`)
      return false
    }
  }

  private async checkS3KeyExists(
    config: S3Config,
    options: { verbose?: boolean } = {},
  ): Promise<boolean> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized')
    }

    const logger = new UILogger(options.verbose)
    try {
      logger.displayVerbose(
        `🔍 Checking if key exists: s3://${config.bucket}/${this.normalizeS3Key(config.key)}`,
      )

      const command = new HeadObjectCommand({
        Bucket: config.bucket,
        Key: this.normalizeS3Key(config.key),
      })

      await this.s3Client.send(command)
      logger.displayVerbose(`✅ Remote file exists`)
      return true
    }
    catch (error: unknown) {
      const awsError = error as AwsError
      if (
        awsError.name === 'NotFound'
        || awsError.$metadata?.httpStatusCode === 404
      ) {
        logger.displayVerbose(`ℹ️  Remote file does not exist`)
        return false
      }
      logger.displayError(
        `❌ Error checking remote file: ${this.formatAwsError(error)}`,
      )
      throw error
    }
  }

  private async getS3ObjectInfo(
    config: S3Config,
    options: { verbose?: boolean } = {},
  ): Promise<S3ObjectInfo> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized')
    }

    const logger = new UILogger(options.verbose)
    try {
      logger.displayVerbose(
        `📊 Getting remote file metadata: s3://${config.bucket}/${this.normalizeS3Key(config.key)}`,
      )

      const command = new HeadObjectCommand({
        Bucket: config.bucket,
        Key: this.normalizeS3Key(config.key),
      })

      const response = await this.s3Client.send(command)

      // Extract version info from metadata if available
      const configVersion = response.Metadata?.['config-version']
        ? Number.parseInt(response.Metadata['config-version'])
        : undefined

      const info = {
        lastModified: response.LastModified || new Date(),
        size: response.ContentLength || 0,
        exists: true,
        configVersion,
      }

      logger.displayVerbose(
        `📊 Remote file info - Size: ${info.size} bytes, Modified: ${this.formatTimestamp(info.lastModified)}${configVersion ? `, Version: ${configVersion}` : ''}`,
      )
      return info
    }
    catch (error: unknown) {
      const awsError = error as AwsError
      if (
        awsError.name === 'NotFound'
        || awsError.$metadata?.httpStatusCode === 404
      ) {
        logger.displayVerbose(`ℹ️  Remote file does not exist`)
        return {
          lastModified: new Date(0),
          size: 0,
          exists: false,
        }
      }
      logger.displayError(
        `❌ Error getting remote file info: ${this.formatAwsError(error)}`,
      )
      throw error
    }
  }

  private getLocalFileInfo(options: { verbose?: boolean } = {}): FileMetadata {
    const logger = new UILogger(options.verbose)
    logger.displayVerbose(
      `📁 Checking local configuration file: ${this.CONFIG_PATH}`,
    )

    if (!existsSync(this.CONFIG_PATH)) {
      logger.displayVerbose(`ℹ️  Local configuration file does not exist`)
      return {
        lastModified: new Date(0),
        localPath: this.CONFIG_PATH,
      }
    }

    const stats = statSync(this.CONFIG_PATH)
    const info = {
      lastModified: stats.mtime,
      localPath: this.CONFIG_PATH,
    }

    logger.displayVerbose(
      `📁 Local file info - Modified: ${this.formatTimestamp(info.lastModified)}`,
    )
    return info
  }

  private formatTimestamp(date: Date): string {
    return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
  }

  /**
   * Analyzes local and remote configurations to determine sync requirements
   */
  private async analyzeSyncRequirements(
    localConfig: ConfigFile,
    remoteInfo: S3ObjectInfo,
    localFileInfo: FileMetadata,
    options: { verbose?: boolean } = {},
  ): Promise<SyncComparisonResult> {
    const logger = new UILogger(options.verbose)
    logger.displayVerbose(`🔍 Analyzing sync requirements...`)

    // If remote doesn't exist, upload local
    if (!remoteInfo.exists) {
      logger.displayVerbose(
        `📤 Decision: Upload local configuration (remote doesn't exist)`,
      )
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
      logger.displayVerbose(
        `📥 Decision: Download remote configuration (local doesn't exist)`,
      )
      return {
        shouldSync: true,
        reason: 'Local configuration does not exist',
        syncDirection: 'download',
        hasVersionConflict: false,
        hasConfigConflicts: false,
      }
    }

    // Fetch remote config to compare versions and content
    logger.displayVerbose(
      `📊 Fetching remote configuration for detailed comparison...`,
    )
    let remoteConfig: ConfigFile | null = null
    try {
      const s3Config = await this.getS3Config()
      if (!s3Config) {
        throw new Error('S3 configuration not found')
      }
      const command = new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
      })
      const response = await this.s3Client!.send(command)
      const configData = (await response.Body?.transformToString()) || ''
      remoteConfig = JSON.parse(configData)
      logger.displayVerbose(`✅ Remote configuration fetched successfully`)
    }
    catch {
      logger.displayVerbose(
        `⚠️  Failed to parse remote config, falling back to timestamp comparison`,
      )
      // If we can't read remote config, fall back to timestamp comparison
      return this.fallbackTimestampComparison(
        localFileInfo,
        remoteInfo,
        options,
      )
    }

    // Compare versions
    const localVersion = localConfig.version || 1
    const remoteVersion = remoteConfig?.version || 1
    const hasVersionConflict = localVersion !== remoteVersion

    logger.displayVerbose(
      `📋 Version comparison - Local: ${localVersion}, Remote: ${remoteVersion}`,
    )

    // Detect configuration conflicts
    const conflictResolution = remoteConfig
      ? resolveConfigConflicts(localConfig, remoteConfig, { autoResolve: true })
      : { hasConflicts: false, conflicts: [] }
    const hasConfigConflicts = conflictResolution.hasConflicts

    if (hasConfigConflicts) {
      logger.displayVerbose(
        `⚠️  Configuration conflicts detected: ${conflictResolution.conflicts.length} conflicts`,
      )
    }

    // Version-based decision making
    if (localVersion > remoteVersion) {
      logger.displayVerbose(
        `📤 Decision: Upload local (newer version ${localVersion} > ${remoteVersion})`,
      )
      return {
        shouldSync: true,
        reason: `Local version (${localVersion}) is newer than remote (${remoteVersion})`,
        syncDirection: 'upload',
        hasVersionConflict,
        hasConfigConflicts,
      }
    }

    if (remoteVersion > localVersion) {
      logger.displayVerbose(
        `📥 Decision: Download remote (newer version ${remoteVersion} > ${localVersion})`,
      )
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
      logger.displayVerbose(
        `🔄 Decision: Handle conflicts (same version but conflicts detected)`,
      )
      return {
        shouldSync: true,
        reason: 'Configuration conflicts detected requiring smart merge',
        syncDirection: 'conflict',
        hasVersionConflict,
        hasConfigConflicts,
      }
    }

    // Same version, no conflicts - check timestamps as tiebreaker
    const timeDiff
      = localFileInfo.lastModified.getTime() - remoteInfo.lastModified.getTime()
    const fiveMinutesMs = 5 * 1000

    if (Math.abs(timeDiff) < fiveMinutesMs) {
      logger.displayVerbose(
        `✅ Decision: No sync needed (configurations are in sync within 5 secs)`,
      )
      return {
        shouldSync: false,
        reason: 'Configurations are in sync',
        syncDirection: 'download',
        hasVersionConflict,
        hasConfigConflicts,
      }
    }

    const decision
      = timeDiff > 0 ? 'upload (local newer)' : 'download (remote newer)'
    logger.displayVerbose(
      `🔄 Decision: ${decision} based on timestamp difference`,
    )
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
    options: { verbose?: boolean } = {},
  ): SyncComparisonResult {
    const logger = new UILogger(options.verbose)
    logger.displayVerbose(`⚠️  Using fallback timestamp comparison`)
    const timeDiff
      = localFileInfo.lastModified.getTime() - remoteInfo.lastModified.getTime()

    if (Math.abs(timeDiff) < 5 * 60 * 1000) {
      logger.displayVerbose(`✅ Files are in sync (timestamp comparison)`)
      return {
        shouldSync: false,
        reason: 'Files are in sync (timestamp comparison)',
        syncDirection: 'download',
        hasVersionConflict: false,
        hasConfigConflicts: false,
      }
    }

    const decision
      = timeDiff > 0 ? 'Local file is newer' : 'Remote file is newer'
    logger.displayVerbose(`🔄 ${decision} (timestamp comparison)`)
    return {
      shouldSync: true,
      reason:
        timeDiff > 0
          ? 'Local file is newer (timestamp)'
          : 'Remote file is newer (timestamp)',
      syncDirection: timeDiff > 0 ? 'upload' : 'download',
      hasVersionConflict: false,
      hasConfigConflicts: false,
    }
  }

  async uploadConfigs(
    force = false,
    options: { verbose?: boolean, silent?: boolean } = {},
  ): Promise<boolean> {
    const s3Config = await this.getS3Config()
    if (!s3Config) {
      const logger = new UILogger()
      logger.displayError(
        'S3 sync is not configured. Run "start-claude s3 setup" first.',
      )
      return false
    }

    try {
      const logger = new UILogger(options.verbose)
      logger.displayVerbose(`📤 Starting configuration upload to S3...`)
      this.initializeS3Client(s3Config, options)

      // Get file timestamps for comparison
      const localFile = this.getLocalFileInfo(options)
      const remoteInfo = await this.getS3ObjectInfo(s3Config, options)

      // Prepare local configuration data for comparison
      const configManager = await this.getConfigManager()
      const configFile = configManager.getConfigFile()
      const localConfigData = JSON.stringify(configFile, null, 2)

      // Check if remote file exists and compare content if it does
      if (remoteInfo.exists && !force) {
        logger.displayVerbose(
          `📊 Comparing local and remote configuration content...`,
        )
        try {
          const getCommand = new GetObjectCommand({
            Bucket: s3Config.bucket,
            Key: this.normalizeS3Key(s3Config.key),
          })
          const response = await this.s3Client!.send(getCommand)
          const remoteConfigData
            = (await response.Body?.transformToString()) || ''

          // Compare content (normalize JSON formatting)
          const localNormalized = JSON.stringify(JSON.parse(localConfigData))
          const remoteNormalized = JSON.stringify(JSON.parse(remoteConfigData))

          if (localNormalized === remoteNormalized) {
            logger.displayVerbose(
              `✅ Local and remote configurations are identical, skipping upload`,
            )
            return true
          }

          logger.displayVerbose(
            `🔄 Configuration content differs, proceeding with upload`,
          )
        }
        catch (compareError) {
          logger.displayVerbose(
            `⚠️ Failed to compare content, proceeding with upload: ${compareError instanceof Error ? compareError.message : 'Unknown error'}`,
          )
        }
      }

      // Check if we need to warn about overwriting newer remote file
      if (
        !force
        && remoteInfo.exists
        && remoteInfo.lastModified > localFile.lastModified
      ) {
        logger.displayWarning('⚠️  Remote file is newer than local file!')
        logger.displayInfo(
          `Local file:  ${this.formatTimestamp(localFile.lastModified)}`,
        )
        logger.displayInfo(
          `Remote file: ${this.formatTimestamp(remoteInfo.lastModified)}`,
        )

        const overwriteAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message:
              'Upload local file and overwrite newer remote configuration?',
            default: false,
          },
        ])

        if (!overwriteAnswer.overwrite) {
          logger.displayInfo('Upload cancelled.')
          return false
        }
      }

      logger.displayVerbose(`📝 Preparing configuration data for upload...`)
      const configData = localConfigData
      const now = new Date()

      logger.displayVerbose(
        `📤 Uploading to s3://${s3Config.bucket}/${this.normalizeS3Key(s3Config.key)}`,
      )
      logger.displayVerbose(
        `📊 Upload metadata - Version: ${configFile.version || 1}, Size: ${configData.length} bytes`,
      )

      const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
        Body: configData,
        ContentType: 'application/json',
        Metadata: {
          'upload-timestamp': now.toISOString(),
          'local-modified': localFile.lastModified.toISOString(),
          'config-version': (configFile.version || 1).toString(),
        },
      })

      await this.s3Client!.send(command)
      if (!options.silent || options.verbose) {
        logger.displaySuccess(
          `✅ Configuration uploaded to S3 successfully! (${this.formatTimestamp(now)})`,
        )
      }
      return true
    }
    catch (error: unknown) {
      const logger = new UILogger()
      logger.displayError(
        `❌ Failed to upload to S3: ${this.formatAwsError(error)}`,
      )
      return false
    }
  }

  async downloadConfigs(
    force = false,
    options: { silent?: boolean, verbose?: boolean } = {},
  ): Promise<boolean> {
    const s3Config = await this.getS3Config()
    if (!s3Config) {
      const logger = new UILogger()
      logger.displayError(
        'S3 sync is not configured. Run "start-claude s3 setup" first.',
      )
      return false
    }

    try {
      const logger = new UILogger(options.verbose)
      logger.displayVerbose(`📥 Starting configuration download from S3...`)
      this.initializeS3Client(s3Config, options)

      const remoteInfo = await this.getS3ObjectInfo(s3Config, options)
      if (!remoteInfo.exists) {
        logger.displayWarning('No configuration found on S3.')
        return false
      }

      // Get local config for comparison
      const configManager = await this.getConfigManager()
      const localConfig = configManager.getConfigFile()
      const localFile = this.getLocalFileInfo(options)

      // Fetch remote config
      logger.displayVerbose(
        `📥 Downloading from s3://${s3Config.bucket}/${this.normalizeS3Key(s3Config.key)}`,
      )

      const command = new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: this.normalizeS3Key(s3Config.key),
      })

      const response = await this.s3Client!.send(command)
      const configData = (await response.Body?.transformToString()) || ''
      const remoteConfigFile: ConfigFile = JSON.parse(configData)

      logger.displayVerbose(
        `📊 Downloaded configuration - Version: ${remoteConfigFile.version || 1}, Size: ${configData.length} bytes`,
      )

      // Smart conflict resolution
      if (localFile.lastModified.getTime() > 0 && !force) {
        logger.displayVerbose(`🔍 Checking for configuration conflicts...`)

        const conflictResolution = resolveConfigConflicts(
          localConfig,
          remoteConfigFile,
          {
            autoResolve: options.silent,
            verbose: options.verbose,
          },
        )

        if (conflictResolution.hasConflicts && !options.silent) {
          displayConflictResolution(conflictResolution, {
            verbose: options.verbose,
          })

          const resolutionAnswer = await inquirer.prompt([
            {
              type: 'list',
              name: 'resolution',
              message:
                'How would you like to resolve the configuration conflicts?',
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
            logger.displayInfo('Download cancelled.')
            return false
          }

          let configToSave: ConfigFile
          switch (resolutionAnswer.resolution) {
            case 'merge':
              configToSave = conflictResolution.resolvedConfig
              logger.displayInfo('✅ Applied smart merge resolution')
              break
            case 'remote':
              configToSave = remoteConfigFile
              logger.displayInfo('✅ Using remote configuration')
              break
            case 'local':
              logger.displayInfo('✅ Keeping local configuration')
              return true
            default:
              configToSave = conflictResolution.resolvedConfig
          }

          // Save the resolved configuration
          logger.displayVerbose(`💾 Saving resolved configuration...`)

          const configManager = await this.getConfigManager()
          await configManager.saveConfigFile(configToSave, true) // skipSync = true
          logger.displaySuccess(
            `✅ Configuration synchronized with conflict resolution! (${this.formatTimestamp(remoteInfo.lastModified)})`,
          )
          return true
        }
        else if (conflictResolution.hasConflicts && options.silent) {
          // Silent mode with conflicts - use smart merge
          logger.displayVerbose(
            `🔄 Applying silent conflict resolution (${conflictResolution.conflicts.length} conflicts)...`,
          )

          const configManager = await this.getConfigManager()
          await configManager.saveConfigFile(
            conflictResolution.resolvedConfig,
            true,
          ) // skipSync = true
          if (options.verbose) {
            logger.displayVerbose(
              `✅ Silent conflict resolution applied (${conflictResolution.conflicts.length} conflicts resolved)`,
            )
          }
          return true
        }
        else {
          logger.displayVerbose(`✅ No conflicts detected`)
        }
      }

      // No conflicts or force mode - direct download
      logger.displayVerbose(`💾 Saving configuration file...`)

      await configManager.saveConfigFile(remoteConfigFile, true) // skipSync = true
      if (!options.silent || options.verbose) {
        logger.displaySuccess(
          `✅ Configuration downloaded from S3 successfully! (${this.formatTimestamp(remoteInfo.lastModified)})`,
        )
      }
      return true
    }
    catch (error: unknown) {
      console.error(error)
      const logger = new UILogger()
      logger.displayError(
        `❌ Failed to download from S3: ${this.formatAwsError(error)}`,
      )
      return false
    }
  }

  async syncConfigs(options: { verbose?: boolean } = {}): Promise<boolean> {
    const s3Config = await this.getS3Config()
    if (!s3Config) {
      const logger = new UILogger()
      logger.displayError(
        'S3 sync is not configured. Run "start-claude s3 setup" first.',
      )
      return false
    }

    try {
      const logger = new UILogger(options.verbose)
      logger.displayVerbose(`🔄 Starting configuration synchronization...`)
      this.initializeS3Client(s3Config, options)

      // Guard: if local cloud sync is enabled, treat S3 as backup (upload only)
      if (this.isCloudSyncEnabled()) {
        logger.displayInfo('📤 Cloud sync enabled; S3 will be used as backup (upload only). Skipping download checks.')
        return await this.uploadConfigs(true, { verbose: options.verbose, silent: true })
      }

      const localFile = this.getLocalFileInfo(options)
      const remoteInfo = await this.getS3ObjectInfo(s3Config, options)

      logger.displayVerbose(`🔍 Sync analysis:`)
      logger.displayVerbose(
        `  📁 Local file exists: ${localFile.lastModified.getTime() > 0}`,
      )
      logger.displayVerbose(`  ☁️  Remote file exists: ${remoteInfo.exists}`)

      if (!remoteInfo.exists) {
        // No remote file, upload local
        logger.displayInfo(
          '📤 No remote configuration found, uploading local configs...',
        )
        return await this.uploadConfigs(true)
      }

      if (localFile.lastModified.getTime() === 0) {
        // No local file, download remote
        logger.displayInfo(
          '📥 No local configuration found, downloading from S3...',
        )
        return await this.downloadConfigs(true)
      }

      // Both files exist, compare timestamps
      const timeDiff
        = localFile.lastModified.getTime() - remoteInfo.lastModified.getTime()
      logger.displayVerbose(`⏰ Timestamp comparison:`)
      logger.displayVerbose(
        `  📁 Local:  ${this.formatTimestamp(localFile.lastModified)}`,
      )
      logger.displayVerbose(
        `  ☁️  Remote: ${this.formatTimestamp(remoteInfo.lastModified)}`,
      )
      logger.displayVerbose(
        `  🔄 Difference: ${Math.round(timeDiff / 1000)} seconds`,
      )

      if (localFile.lastModified > remoteInfo.lastModified) {
        logger.displayInfo('📤 Local file is newer, uploading to S3...')
        return await this.uploadConfigs(true)
      }
      else if (remoteInfo.lastModified > localFile.lastModified) {
        logger.displayInfo('📥 Remote file is newer, downloading from S3...')
        return await this.downloadConfigs(true)
      }
      else {
        logger.displayInfo('✅ Files are in sync.')
        return true
      }
    }
    catch (error: unknown) {
      const logger = new UILogger()
      logger.displayError(
        `❌ Failed to sync configs: ${this.formatAwsError(error)}`,
      )
      return false
    }
  }

  /**
   * Check if automatic sync should occur and perform it silently
   * Returns true if sync was performed or not needed
   * Enhanced with version checking and smart conflict resolution
   */
  async checkAutoSync(
    options: { verbose?: boolean, silent?: boolean } = {},
  ): Promise<boolean> {
    // Default to silent mode for auto-sync unless explicitly set to false
    const silentMode = options.silent !== false
    if (!(await this.isS3Configured())) {
      const logger = new UILogger(options.verbose)
      logger.displayVerbose('S3 not configured, skipping auto-sync')
      return true // No S3 config, nothing to sync
    }

    try {
      const s3Config = await this.getS3Config()
      if (!s3Config) {
        const logger = new UILogger(options.verbose)
        logger.displayVerbose('No S3 config found, skipping auto-sync')
        return true // No S3 config, nothing to sync
      }
      this.initializeS3Client(s3Config, options)

      const logger = new UILogger(options.verbose)
      logger.displayVerbose('🔍 Starting automatic S3 config sync check...')

      // Guard: if local cloud sync is enabled, skip downloads and treat S3 as backup
      if (this.isCloudSyncEnabled()) {
        logger.displayVerbose('☁️  Cloud sync detected; performing upload-only backup to S3')
        await this.uploadConfigs(true, { silent: true, verbose: options.verbose })
        return true
      }

      const configManager = await this.getConfigManager()
      const localConfig = configManager.getConfigFile()
      const localFile = this.getLocalFileInfo(options)
      const remoteInfo = await this.getS3ObjectInfo(s3Config, options)

      // Use enhanced sync analysis
      const syncAnalysis = await this.analyzeSyncRequirements(
        localConfig,
        remoteInfo,
        localFile,
        options,
      )

      if (!syncAnalysis.shouldSync) {
        logger.displayVerbose(
          '✅ No sync needed - configurations are up to date',
        )
        return true // No sync needed
      }

      logger.displayVerbose(`🔄 Sync required: ${syncAnalysis.reason}`)

      // Perform sync based on analysis
      switch (syncAnalysis.syncDirection) {
        case 'upload':
          logger.displayVerbose('📤 Uploading local config to S3...')
          return await this.uploadConfigs(true, {
            ...options,
            silent: silentMode,
          })

        case 'download':
          // Silent download with conflict resolution
          logger.displayVerbose('📥 Downloading remote config from S3...')
          return await this.downloadConfigs(true, {
            silent: silentMode,
            verbose: options.verbose,
          })

        case 'conflict':
          // Silent conflict resolution - auto-merge conflicts
          logger.displayVerbose(
            '🔄 Resolving config conflicts automatically...',
          )
          return await this.downloadConfigs(true, {
            silent: silentMode,
            verbose: options.verbose,
          })

        default:
          logger.displayVerbose('✅ No action needed')
          return true
      }
    }
    catch (error) {
      // Silent fail for auto-sync, but show verbose error if enabled
      if (options.verbose) {
        const logger = new UILogger(options.verbose)
        logger.displayVerbose(
          `⚠️ Auto-sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
      return true
    }
  }

  /**
   * Trigger automatic upload after local config changes
   */
  async autoUploadAfterChange(): Promise<void> {
    if (!(await this.isS3Configured())) {
      return
    }

    try {
      // Small delay to ensure file is written completely
      await new Promise(resolve => setTimeout(resolve, 1000))

      await this.uploadConfigs(true, { silent: true })
    }
    catch (error) {
      // Silent fail for auto-upload, but log for debugging
      console.error('Auto-upload failed:', error)
    }
  }

  async isS3Configured(): Promise<boolean> {
    try {
      const config = await this.getS3Config()
      return config !== null && config !== undefined
    }
    catch {
      return false
    }
  }

  async getS3Status(): Promise<string> {
    const config = await this.getS3Config()
    if (!config) {
      return 'Not configured'
    }
    const endpointStr = config.endpointUrl
      ? `, Endpoint: ${config.endpointUrl}`
      : ''
    return `Configured (Bucket: ${config.bucket}, Region: ${config.region}${endpointStr}, Key: ${this.normalizeS3Key(config.key)})`
  }
}
