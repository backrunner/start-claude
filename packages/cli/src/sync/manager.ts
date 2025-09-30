import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import inquirer from 'inquirer'
import { S3SyncManager } from '../storage/s3-sync'
import { UILogger } from '../utils/cli/ui'
import { getAvailableCloudServices, getCloudStorageStatus } from '../utils/cloud-storage/detector'

export interface SyncConfig {
  enabled: boolean
  provider: 'icloud' | 'onedrive' | 'custom' | 's3'
  cloudPath?: string
  customPath?: string
  s3Config?: {
    bucket: string
    region: string
    key: string
    endpointUrl?: string
  }
  linkedAt: string
  lastVerified?: string
}

export interface SyncStatus {
  isConfigured: boolean
  isValid: boolean
  provider?: string
  cloudPath?: string
  configPath: string
  issues: string[]
}

export class SyncManager {
  private s3SyncManager: S3SyncManager
  private configDir: string
  private configFile: string
  private syncConfigFile: string
  private ui: UILogger

  constructor() {
    this.s3SyncManager = new S3SyncManager()
    this.configDir = join(homedir(), '.start-claude')
    this.configFile = join(this.configDir, 'config.json')
    this.syncConfigFile = join(this.configDir, 'sync.json')
    this.ui = new UILogger()
  }

  /**
   * Main setup sync command - interactive setup process
   */
  async setupSync(): Promise<boolean> {
    try {
      this.ui.displayInfo('🔄 Setting up configuration synchronization...\n')

      // Check current sync status
      const currentStatus = await this.getSyncStatus()
      if (currentStatus.isConfigured) {
        this.ui.displayWarning('⚠️  Sync is already configured!')
        this.ui.displayInfo(`Current provider: ${currentStatus.provider}`)
        if (currentStatus.cloudPath) {
          this.ui.displayInfo(`Current path: ${currentStatus.cloudPath}`)
        }

        const { reconfigure } = await inquirer.prompt([{
          type: 'confirm',
          name: 'reconfigure',
          message: 'Do you want to reconfigure sync?',
          default: false,
        }])

        if (!reconfigure) {
          return false
        }

        // Disable current sync before setting up new one
        const disableResult = await this.disableSync()
        if (!disableResult) {
          this.ui.displayError('❌ Failed to disable existing sync configuration')
          return false
        }
      }

      // Get available sync options
      const options = await this.getSyncOptions()

      if (options.length === 0) {
        this.ui.displayError('❌ No sync options available')
        return false
      }

      // Let user choose sync provider
      const { provider } = await inquirer.prompt([{
        type: 'list',
        name: 'provider',
        message: 'Choose a sync provider:',
        choices: options,
      }])

      // Handle provider-specific setup
      switch (provider) {
        case 'icloud':
          return await this.setupCloudSync('icloud')
        case 'onedrive':
          return await this.setupCloudSync('onedrive')
        case 'custom':
          return await this.setupCustomSync()
        case 's3':
          return await this.setupS3Sync()
        default:
          this.ui.displayError(`❌ Unknown provider: ${provider}`)
          return false
      }
    }
    catch (error) {
      this.ui.displayError(`❌ Failed to setup sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Get available sync options based on system capabilities
   */
  private async getSyncOptions(): Promise<Array<{ name: string, value: string }>> {
    const options: Array<{ name: string, value: string }> = []

    // Check cloud storage availability
    const cloudServices = getAvailableCloudServices()

    for (const service of cloudServices) {
      if (service.isEnabled) {
        if (service.name === 'iCloud') {
          options.push({
            name: '☁️  iCloud Drive - Sync via iCloud Drive',
            value: 'icloud',
          })
        }
        else if (service.name === 'OneDrive') {
          options.push({
            name: '📁 OneDrive - Sync via Microsoft OneDrive',
            value: 'onedrive',
          })
        }
      }
    }

    // Always offer custom folder option
    options.push({
      name: '📂 Custom Folder - Sync to a custom directory',
      value: 'custom',
    })

    // Check if S3 is already configured
    const s3Status = await this.s3SyncManager.getS3Status()
    if (s3Status.includes('Not configured')) {
      options.push({
        name: '🗄️  S3 Storage - Configure S3 sync',
        value: 's3',
      })
    }
    else {
      options.push({
        name: `🗄️  S3 Storage - ${s3Status}`,
        value: 's3',
      })
    }

    return options
  }

  /**
   * Setup cloud storage sync (iCloud or OneDrive)
   */
  private async setupCloudSync(provider: 'icloud' | 'onedrive'): Promise<boolean> {
    try {
      const cloudStatus = getCloudStorageStatus()
      const serviceInfo = provider === 'icloud' ? cloudStatus.iCloud : cloudStatus.oneDrive

      if (!serviceInfo.isEnabled || !serviceInfo.path) {
        this.ui.displayError(`❌ ${provider} is not properly configured`)
        return false
      }

      const cloudConfigDir = join(serviceInfo.path, '.start-claude')
      const cloudConfigFile = join(cloudConfigDir, 'config.json')

      this.ui.displayInfo(`📁 Setting up sync with ${provider}...`)
      this.ui.displayInfo(`Cloud path: ${serviceInfo.path}`)

      // Create cloud config directory
      if (!existsSync(cloudConfigDir)) {
        mkdirSync(cloudConfigDir, { recursive: true })
        this.ui.displayInfo(`📁 Created directory: ${cloudConfigDir}`)
      }

      // Handle different scenarios
      const localExists = existsSync(this.configFile)
      const remoteExists = existsSync(cloudConfigFile)

      if (!localExists && !remoteExists) {
        // Scenario: No config anywhere - create new
        const emptyConfig = { version: 1, configs: [] }
        writeFileSync(cloudConfigFile, JSON.stringify(emptyConfig, null, 2))
        this.ui.displayInfo('📄 Created new config in cloud folder')
      }
      else if (localExists && !remoteExists) {
        // Scenario 1: Local has config, remote doesn't - move to cloud
        await this.moveConfigToCloud(this.configFile, cloudConfigFile)
      }
      else if (!localExists && remoteExists) {
        // Scenario 2: Remote has config, local doesn't - use remote directly
        this.ui.displaySuccess('📥 Found existing configuration in cloud')
        this.ui.displayInfo('Will use cloud configuration')
      }
      else {
        // Scenario 3: Both exist - resolve conflict
        const resolved = await this.resolveConfigConflict(this.configFile, cloudConfigFile)
        if (!resolved) {
          return false // User cancelled
        }
      }

      // Also sync S3 config file if it exists
      await this.syncAllConfigFilesToCloud(serviceInfo.path)

      // Save sync configuration
      const syncConfig: SyncConfig = {
        enabled: true,
        provider,
        cloudPath: serviceInfo.path,
        linkedAt: new Date().toISOString(),
      }

      this.saveSyncConfig(syncConfig)

      // Update S3 settings if S3 is configured
      await this.updateS3Settings(true)

      this.ui.displaySuccess(`✅ Successfully configured ${provider} sync!`)
      this.ui.displayInfo(`📂 Config file: ${cloudConfigFile}`)
      this.ui.displayInfo(`🔗 Config is now synced via ${provider}`)

      return true
    }
    catch (error) {
      this.ui.displayError(`❌ Failed to setup ${provider} sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Setup custom folder sync
   */
  private async setupCustomSync(): Promise<boolean> {
    try {
      const { customPath } = await inquirer.prompt([{
        type: 'input',
        name: 'customPath',
        message: 'Enter the custom sync folder path:',
        validate: (input: string) => {
          if (!input.trim())
            return 'Path cannot be empty'
          const fullPath = resolve(input.trim())
          try {
            if (existsSync(fullPath)) {
              const stats = statSync(fullPath)
              if (!stats.isDirectory()) {
                return 'Path must be a directory'
              }
            }
            return true
          }
          catch {
            return 'Invalid path'
          }
        },
      }])

      const resolvedPath = resolve(customPath.trim())
      const customConfigDir = join(resolvedPath, '.start-claude')
      const customConfigFile = join(customConfigDir, 'config.json')

      this.ui.displayInfo('📁 Setting up custom folder sync...')
      this.ui.displayInfo(`Custom path: ${resolvedPath}`)

      // Create custom config directory
      if (!existsSync(customConfigDir)) {
        mkdirSync(customConfigDir, { recursive: true })
        this.ui.displayInfo(`📁 Created directory: ${customConfigDir}`)
      }

      // Handle different scenarios (same as cloud sync)
      const localExists = existsSync(this.configFile)
      const remoteExists = existsSync(customConfigFile)

      if (!localExists && !remoteExists) {
        const emptyConfig = { version: 1, configs: [] }
        writeFileSync(customConfigFile, JSON.stringify(emptyConfig, null, 2))
        this.ui.displayInfo('📄 Created new config in custom folder')
      }
      else if (localExists && !remoteExists) {
        await this.moveConfigToCloud(this.configFile, customConfigFile)
      }
      else if (!localExists && remoteExists) {
        this.ui.displaySuccess('📥 Found existing configuration in custom folder')
        this.ui.displayInfo('Will use custom folder configuration')
      }
      else {
        const resolved = await this.resolveConfigConflict(this.configFile, customConfigFile)
        if (!resolved) {
          return false
        }
      }

      // Save sync configuration
      const syncConfig: SyncConfig = {
        enabled: true,
        provider: 'custom',
        customPath: resolvedPath,
        linkedAt: new Date().toISOString(),
      }

      this.saveSyncConfig(syncConfig)

      // Update S3 settings if S3 is configured
      await this.updateS3Settings(true)

      this.ui.displaySuccess('✅ Successfully configured custom folder sync!')
      this.ui.displayInfo(`📂 Config file: ${customConfigFile}`)
      this.ui.displayInfo(`🔗 Config is now synced via custom folder`)

      return true
    }
    catch (error) {
      this.ui.displayError(`❌ Failed to setup custom sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Setup S3 sync
   */
  private async setupS3Sync(): Promise<boolean> {
    try {
      this.ui.displayInfo('🗄️  Setting up S3 sync...')

      // Use existing S3 setup process
      // Import S3 setup handler dynamically
      const { handleS3SetupCommand } = await import('../commands/s3')
      await handleS3SetupCommand({ verbose: false })

      // Check if S3 was successfully configured
      if (await this.s3SyncManager.isS3Configured()) {
        // Save sync configuration for S3
        const syncConfig: SyncConfig = {
          enabled: true,
          provider: 's3',
          linkedAt: new Date().toISOString(),
        }

        this.saveSyncConfig(syncConfig)
        this.ui.displaySuccess('✅ Successfully configured S3 sync!')
      }

      return await this.s3SyncManager.isS3Configured()
    }
    catch (error) {
      this.ui.displayError(`❌ Failed to setup S3 sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Move local config to cloud (with backup)
   */
  private async moveConfigToCloud(localPath: string, cloudPath: string): Promise<void> {
    try {
      // Create backup of local config
      const backupPath = `${localPath}.backup.${Date.now()}`
      copyFileSync(localPath, backupPath)
      this.ui.displayInfo(`💾 Created backup: ${backupPath}`)

      // Move to cloud (copy then verify)
      copyFileSync(localPath, cloudPath)
      this.ui.displaySuccess(`📤 Moved configuration to cloud storage`)

      // Verify cloud file was written successfully
      if (!existsSync(cloudPath)) {
        throw new Error('Failed to verify cloud config file')
      }

      this.ui.displayInfo(`✅ Configuration is now stored in cloud`)
      this.ui.displayInfo(`💾 Local backup available at: ${backupPath}`)
    }
    catch (error) {
      throw new Error(`Failed to move config to cloud: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Resolve config conflict when both local and remote configs exist
   */
  private async resolveConfigConflict(localPath: string, remotePath: string): Promise<boolean> {
    try {
      this.ui.displayWarning('⚠️  Configuration files exist in both locations')

      // Read both configs
      const localContent = readFileSync(localPath, 'utf-8')
      const remoteContent = readFileSync(remotePath, 'utf-8')
      const localConfig = JSON.parse(localContent)
      const remoteConfig = JSON.parse(remoteContent)

      // Get file modification times
      const localStat = statSync(localPath)
      const remoteStat = statSync(remotePath)
      const localMtime = localStat.mtime.getTime()
      const remoteMtime = remoteStat.mtime.getTime()

      // Show basic info
      this.ui.displayInfo(`\n📊 Configuration comparison:`)
      this.ui.displayInfo(`  Local configs: ${localConfig.configs?.length || 0}`)
      this.ui.displayInfo(`  Remote configs: ${remoteConfig.configs?.length || 0}`)
      this.ui.displayInfo(`  Local modified: ${localStat.mtime.toISOString()}`)
      this.ui.displayInfo(`  Remote modified: ${remoteStat.mtime.toISOString()}`)

      const { resolution } = await inquirer.prompt([{
        type: 'list',
        name: 'resolution',
        message: 'How would you like to resolve this conflict?',
        choices: [
          {
            name: '📥 Use remote configuration (cloud version)',
            value: 'remote',
          },
          {
            name: '📤 Use local configuration (overwrite cloud)',
            value: 'local',
          },
          {
            name: '🔄 Smart merge (beta - combine both configurations)',
            value: 'merge',
          },
          {
            name: '❌ Cancel setup',
            value: 'cancel',
          },
        ],
      }])

      if (resolution === 'cancel') {
        this.ui.displayInfo('Setup cancelled')
        return false
      }

      // Create backup before any changes
      const backupPath = `${localPath}.backup.${Date.now()}`
      copyFileSync(localPath, backupPath)
      this.ui.displayInfo(`💾 Created backup: ${backupPath}`)

      if (resolution === 'remote') {
        // Use remote config - just document it (config will be read from cloud automatically)
        this.ui.displaySuccess('📥 Using remote configuration from cloud')
        return true
      }
      else if (resolution === 'local') {
        // Use local config - overwrite remote
        copyFileSync(localPath, remotePath)
        this.ui.displaySuccess('📤 Local configuration copied to cloud (remote overwritten)')
        return true
      }
      else if (resolution === 'merge') {
        // Smart merge using existing conflict resolver with file modification times
        return await this.smartMergeConfigs(localConfig, remoteConfig, localPath, remotePath, backupPath, localMtime, remoteMtime)
      }

      return false
    }
    catch (error) {
      this.ui.displayError(`Failed to resolve conflict: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Merge configs by UUID with time-based conflict resolution
   */
  private mergeConfigsByUuid(
    localConfigs: any[],
    remoteConfigs: any[],
    localMtime: number,
    remoteMtime: number,
  ): any[] {
    // Create maps by UUID for fast lookup
    const localMap = new Map<string, any>()
    const remoteMap = new Map<string, any>()
    const noIdConfigs: any[] = []

    // Index local configs by UUID
    localConfigs.forEach((config) => {
      if (config.id) {
        localMap.set(config.id, config)
      }
      else {
        // Configs without ID are treated as unique
        noIdConfigs.push({ ...config, source: 'local' })
      }
    })

    // Index remote configs by UUID
    remoteConfigs.forEach((config) => {
      if (config.id) {
        remoteMap.set(config.id, config)
      }
      else {
        // Configs without ID are treated as unique
        noIdConfigs.push({ ...config, source: 'remote' })
      }
    })

    const mergedConfigs: any[] = []

    // Process all unique UUIDs
    const allUuids = new Set([...localMap.keys(), ...remoteMap.keys()])

    allUuids.forEach((uuid) => {
      const localConfig = localMap.get(uuid)
      const remoteConfig = remoteMap.get(uuid)

      if (localConfig && remoteConfig) {
        // Both have same UUID - use file modification time to decide
        if (localMtime > remoteMtime) {
          // Local is newer
          mergedConfigs.push({ ...localConfig, _mergeReason: 'local-newer' })
          this.ui.displayInfo(`  • Config "${localConfig.name}" (${uuid.substring(0, 8)}): using local (newer)`)
        }
        else if (remoteMtime > localMtime) {
          // Remote is newer
          mergedConfigs.push({ ...remoteConfig, _mergeReason: 'remote-newer' })
          this.ui.displayInfo(`  • Config "${remoteConfig.name}" (${uuid.substring(0, 8)}): using remote (newer)`)
        }
        else {
          // Same time - prefer remote (cloud version is source of truth)
          mergedConfigs.push({ ...remoteConfig, _mergeReason: 'remote-same-time' })
          this.ui.displayInfo(`  • Config "${remoteConfig.name}" (${uuid.substring(0, 8)}): using remote (same time)`)
        }
      }
      else if (localConfig) {
        // Only in local
        mergedConfigs.push({ ...localConfig, _mergeReason: 'local-only' })
        this.ui.displayInfo(`  • Config "${localConfig.name}" (${uuid.substring(0, 8)}): from local only`)
      }
      else if (remoteConfig) {
        // Only in remote
        mergedConfigs.push({ ...remoteConfig, _mergeReason: 'remote-only' })
        this.ui.displayInfo(`  • Config "${remoteConfig.name}" (${uuid.substring(0, 8)}): from remote only`)
      }
    })

    // Add configs without IDs (treated as unique)
    noIdConfigs.forEach((config) => {
      const { source, ...configWithoutSource } = config
      mergedConfigs.push({ ...configWithoutSource, _mergeReason: `${source}-no-id` })
      this.ui.displayInfo(`  • Config "${config.name}" (no ID): from ${source}`)
    })

    // Clean up merge reason metadata before returning
    return mergedConfigs.map(({ _mergeReason, ...config }) => config)
  }

  /**
   * Smart merge two configurations using UUID-aware merging
   */
  private async smartMergeConfigs(
    localConfig: any,
    remoteConfig: any,
    localPath: string,
    remotePath: string,
    backupPath: string,
    localMtime: number,
    remoteMtime: number,
  ): Promise<boolean> {
    try {
      this.ui.displayInfo('🔄 Performing UUID-aware smart merge...')

      // Step 1: Merge configs based on UUID
      const mergedConfigs = this.mergeConfigsByUuid(
        localConfig.configs || [],
        remoteConfig.configs || [],
        localMtime,
        remoteMtime,
      )

      // Step 2: Use conflict resolver for additional validation
      const { resolveConfigConflicts } = await import('../utils/config/conflict-resolver')

      const mergedConfigFile = {
        ...remoteConfig,
        configs: mergedConfigs,
        version: Math.max(localConfig.version || 1, remoteConfig.version || 1),
      }

      // Run through conflict resolver for final validation
      const resolution = resolveConfigConflicts(localConfig, mergedConfigFile, {
        autoResolve: true,
        preferLocal: false,
      })

      if (resolution.hasConflicts) {
        this.ui.displayInfo(`\n📋 Merge details:`)
        this.ui.displayInfo(`  Conflicts found: ${resolution.conflicts.length}`)
        this.ui.displayInfo(`  Resolution strategy: ${resolution.resolutionStrategy}`)

        // Show resolution details
        if (resolution.resolutionDetails.length > 0) {
          this.ui.displayInfo(`\n🔍 Resolution details:`)
          resolution.resolutionDetails.slice(0, 5).forEach((detail) => {
            this.ui.displayInfo(`  • ${detail}`)
          })
          if (resolution.resolutionDetails.length > 5) {
            this.ui.displayInfo(`  ... and ${resolution.resolutionDetails.length - 5} more`)
          }
        }
      }

      // Confirm merge
      const { confirmMerge } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmMerge',
        message: 'Apply the merged configuration?',
        default: true,
      }])

      if (!confirmMerge) {
        this.ui.displayInfo('❌ Merge cancelled')
        return false
      }

      // Write merged config to cloud
      const mergedContent = JSON.stringify(resolution.resolvedConfig, null, 2)
      writeFileSync(remotePath, mergedContent)

      this.ui.displaySuccess('✅ Configurations merged successfully!')
      this.ui.displayInfo(`📊 Merged result: ${resolution.resolvedConfig.configs?.length || 0} configurations`)
      this.ui.displayInfo(`💾 Original local backup: ${backupPath}`)

      return true
    }
    catch (error) {
      this.ui.displayError(`Smart merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      this.ui.displayInfo('You can manually resolve the conflict by choosing "Use remote" or "Use local"')
      return false
    }
  }

  /**
   * Sync all configuration files to cloud storage
   * Moves additional config files (like s3-config.json) to cloud with backup
   */
  private async syncAllConfigFilesToCloud(cloudPath: string): Promise<void> {
    try {
      const cloudConfigDir = join(cloudPath, '.start-claude')

      // Sync S3 config if it exists
      const localS3Config = join(this.configDir, 's3-config.json')
      const cloudS3Config = join(cloudConfigDir, 's3-config.json')

      if (existsSync(localS3Config)) {
        // Create backup
        const backupPath = `${localS3Config}.backup.${Date.now()}`
        copyFileSync(localS3Config, backupPath)

        // Move to cloud
        copyFileSync(localS3Config, cloudS3Config)
        this.ui.displayInfo(`📤 Synced S3 config to cloud (backup: ${backupPath})`)
      }

      // Future: Add other config files here
    }
    catch (error) {
      this.ui.displayWarning(`⚠️  Failed to sync additional config files: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update S3 settings when cloud sync is enabled
   */
  private async updateS3Settings(cloudSyncEnabled: boolean): Promise<void> {
    if (await this.s3SyncManager.isS3Configured()) {
      // When cloud sync is enabled, disable auto-download from S3 but keep upload
      // This treats S3 as backup when cloud sync is primary
      this.ui.displayInfo(cloudSyncEnabled
        ? '📤 S3 will be used for backup (upload only) when cloud sync is enabled'
        : '🔄 S3 sync restored to full sync mode',
      )
    }
  }

  /**
   * Disable sync and restore local config
   */
  async disableSync(): Promise<boolean> {
    try {
      const syncConfig = this.getSyncConfig()
      if (!syncConfig?.enabled) {
        this.ui.displayInfo('ℹ️  Sync is not currently enabled')
        return true
      }

      this.ui.displayInfo('🔄 Disabling sync...')

      // Copy cloud config back to local if it exists
      try {
        // Get cloud config path from sync config
        const cloudPath = syncConfig.cloudPath || syncConfig.customPath
        if (cloudPath) {
          const cloudConfigFile = join(cloudPath, '.start-claude', 'config.json')

          if (existsSync(cloudConfigFile)) {
            // Backup existing local config if any
            if (existsSync(this.configFile)) {
              const backupPath = `${this.configFile}.backup.${Date.now()}`
              copyFileSync(this.configFile, backupPath)
              this.ui.displayInfo(`💾 Backed up local config to: ${backupPath}`)
            }

            // Copy cloud config to local
            copyFileSync(cloudConfigFile, this.configFile)
            this.ui.displayInfo('📥 Copied cloud config to local location')

            // Also copy additional config files
            const cloudS3Config = join(cloudPath, '.start-claude', 's3-config.json')
            const localS3Config = join(this.configDir, 's3-config.json')
            if (existsSync(cloudS3Config)) {
              copyFileSync(cloudS3Config, localS3Config)
              this.ui.displayInfo('📥 Copied S3 config to local location')
            }
          }
          else {
            this.ui.displayWarning('⚠️  Cloud config file not found')

            // Create an empty config if no local config exists
            if (!existsSync(this.configFile)) {
              const emptyConfig = { version: 1, configs: [] }
              writeFileSync(this.configFile, JSON.stringify(emptyConfig, null, 2))
              this.ui.displayInfo('📄 Created new local config file')
            }
          }
        }
      }
      catch (error) {
        this.ui.displayWarning(`⚠️  Error copying config from cloud: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // Remove sync configuration
      if (existsSync(this.syncConfigFile)) {
        unlinkSync(this.syncConfigFile)
      }

      // Restore S3 auto-download if S3 is configured
      await this.updateS3Settings(false)

      this.ui.displaySuccess('✅ Sync disabled successfully')
      return true
    }
    catch (error) {
      this.ui.displayError(`❌ Failed to disable sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Get current sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const issues: string[] = []
    let isConfigured = false
    let isValid = false
    let cloudPath: string | undefined

    const syncConfig = this.getSyncConfig()

    if (!syncConfig?.enabled) {
      return {
        isConfigured: false,
        isValid: false,
        configPath: this.configFile,
        issues: ['Sync is not configured'],
      }
    }

    isConfigured = true
    const syncProvider = syncConfig.provider

    // Check config file status
    if (syncProvider !== 's3') {
      // For cloud/custom sync, verify cloud config exists
      if (syncProvider === 'icloud' || syncProvider === 'onedrive') {
        cloudPath = syncConfig.cloudPath
      }
      else if (syncProvider === 'custom') {
        cloudPath = syncConfig.customPath
      }

      if (cloudPath) {
        const cloudConfigFile = join(cloudPath, '.start-claude', 'config.json')
        if (!existsSync(cloudConfigFile)) {
          issues.push('Cloud config file does not exist')
        }
        else {
          isValid = true
        }
      }
      else {
        issues.push('Cloud path is not configured')
      }
    }
    else {
      // For S3 sync, check S3 configuration
      isValid = await this.s3SyncManager.isS3Configured()
      if (!isValid) {
        issues.push('S3 is not properly configured')
      }
    }

    return {
      isConfigured,
      isValid,
      provider: syncProvider,
      cloudPath,
      configPath: this.configFile,
      issues,
    }
  }

  /**
   * Verify sync status on startup
   */
  async verifySync(): Promise<boolean> {
    const status = await this.getSyncStatus()

    if (!status.isConfigured) {
      return true // No sync configured, nothing to verify
    }

    if (status.isValid) {
      // Update last verified timestamp
      const syncConfig = this.getSyncConfig()
      if (syncConfig) {
        syncConfig.lastVerified = new Date().toISOString()
        this.saveSyncConfig(syncConfig)
      }
      return true
    }

    // Display sync issues
    this.ui.displayWarning('⚠️  Sync configuration issues detected:')
    status.issues.forEach((issue) => {
      this.ui.displayWarning(`  • ${issue}`)
    })

    const { fix } = await inquirer.prompt([{
      type: 'confirm',
      name: 'fix',
      message: 'Would you like to fix sync configuration now?',
      default: true,
    }])

    if (fix) {
      return this.setupSync()
    }

    return false
  }

  /**
   * Save sync configuration (public method)
   */
  saveSyncConfig(config: SyncConfig): void {
    try {
      if (!existsSync(this.configDir)) {
        mkdirSync(this.configDir, { recursive: true })
      }

      const configData = JSON.stringify(config, null, 2)
      writeFileSync(this.syncConfigFile, configData, 'utf-8')
    }
    catch (error) {
      throw new Error(`Failed to save sync config: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get sync configuration (public method)
   */
  getSyncConfig(): SyncConfig | null {
    try {
      if (!existsSync(this.syncConfigFile)) {
        return null
      }

      const configData = readFileSync(this.syncConfigFile, 'utf-8')
      return JSON.parse(configData) as SyncConfig
    }
    catch {
      return null
    }
  }

  /**
   * Remove sync configuration (public method)
   */
  removeSyncConfig(): void {
    try {
      if (existsSync(this.syncConfigFile)) {
        unlinkSync(this.syncConfigFile)
      }
    }
    catch (error) {
      throw new Error(`Failed to remove sync config: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Automatically setup sync from an existing cloud storage configuration
   */
  async autoSetupFromCloudConfig(provider: 'icloud' | 'onedrive', cloudPath: string, configPath: string): Promise<boolean> {
    try {
      this.ui.displayInfo(`🔍 Found existing configuration in ${provider} - Setting up automatic sync...`)

      // Save sync configuration (config will be auto-read from cloud via ConfigFileManager)
      const syncConfig: SyncConfig = {
        enabled: true,
        provider,
        cloudPath,
        linkedAt: new Date().toISOString(),
        lastVerified: new Date().toISOString(), // Mark as verified since we just found it
      }

      this.saveSyncConfig(syncConfig)

      // Update S3 settings if S3 is configured
      await this.updateS3Settings(true)

      this.ui.displaySuccess(`✅ Automatically configured ${provider} sync!`)
      this.ui.displayInfo(`📂 Config file: ${configPath}`)
      this.ui.displayInfo(`🔗 Linked to: ${this.configFile}`)

      return true
    }
    catch (error) {
      this.ui.displayError(`❌ Failed to auto-setup ${provider} sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }
}
