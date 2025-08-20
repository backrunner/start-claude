import { copyFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import inquirer from 'inquirer'
import { S3SyncManager } from '../storage/s3-sync'
import { displayError, displayInfo, displaySuccess, displayWarning } from '../utils/cli/ui'
import { CloudConfigSyncer } from '../utils/cloud-storage/config-syncer'
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

  constructor() {
    this.s3SyncManager = new S3SyncManager()
    this.configDir = join(homedir(), '.start-claude')
    this.configFile = join(this.configDir, 'config.json')
    this.syncConfigFile = join(this.configDir, 'sync.json')
  }

  /**
   * Main setup sync command - interactive setup process
   */
  async setupSync(): Promise<boolean> {
    try {
      displayInfo('🔄 Setting up configuration synchronization...\n')

      // Check current sync status
      const currentStatus = await this.getSyncStatus()
      if (currentStatus.isConfigured) {
        displayWarning('⚠️  Sync is already configured!')
        displayInfo(`Current provider: ${currentStatus.provider}`)
        if (currentStatus.cloudPath) {
          displayInfo(`Current path: ${currentStatus.cloudPath}`)
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
          displayError('❌ Failed to disable existing sync configuration')
          return false
        }
      }

      // Get available sync options
      const options = await this.getSyncOptions()

      if (options.length === 0) {
        displayError('❌ No sync options available')
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
          displayError(`❌ Unknown provider: ${provider}`)
          return false
      }
    }
    catch (error) {
      displayError(`❌ Failed to setup sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
        displayError(`❌ ${provider} is not properly configured`)
        return false
      }

      const cloudConfigDir = join(serviceInfo.path, '.start-claude')
      const cloudConfigFile = join(cloudConfigDir, 'config.json')

      displayInfo(`📁 Setting up sync with ${provider}...`)
      displayInfo(`Cloud path: ${serviceInfo.path}`)

      // Create cloud config directory
      if (!existsSync(cloudConfigDir)) {
        mkdirSync(cloudConfigDir, { recursive: true })
        displayInfo(`📁 Created directory: ${cloudConfigDir}`)
      }

      // Move existing config to cloud folder
      if (existsSync(this.configFile)) {
        if (existsSync(cloudConfigFile)) {
          const { overwrite } = await inquirer.prompt([{
            type: 'confirm',
            name: 'overwrite',
            message: 'Config file already exists in cloud folder. Overwrite with local config?',
            default: false,
          }])

          if (!overwrite) {
            displayInfo('📥 Using existing cloud config file')
          }
          else {
            copyFileSync(this.configFile, cloudConfigFile)
            displayInfo('📤 Copied local config to cloud folder')
          }
        }
        else {
          copyFileSync(this.configFile, cloudConfigFile)
          displayInfo('📤 Moved config to cloud folder')
        }
      }
      else {
        // Create empty config in cloud folder
        const emptyConfig = { version: 1, configs: [] }
        writeFileSync(cloudConfigFile, JSON.stringify(emptyConfig, null, 2))
        displayInfo('📄 Created new config in cloud folder')
      }

      // Create symlink for main config
      await this.createConfigLink(cloudConfigFile)

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

      displaySuccess(`✅ Successfully configured ${provider} sync!`)
      displayInfo(`📂 Config file: ${cloudConfigFile}`)
      displayInfo(`🔗 Linked to: ${this.configFile}`)

      return true
    }
    catch (error) {
      displayError(`❌ Failed to setup ${provider} sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

      displayInfo('📁 Setting up custom folder sync...')
      displayInfo(`Custom path: ${resolvedPath}`)

      // Create custom config directory
      if (!existsSync(customConfigDir)) {
        mkdirSync(customConfigDir, { recursive: true })
        displayInfo(`📁 Created directory: ${customConfigDir}`)
      }

      // Move existing config to custom folder
      if (existsSync(this.configFile)) {
        if (existsSync(customConfigFile)) {
          const { overwrite } = await inquirer.prompt([{
            type: 'confirm',
            name: 'overwrite',
            message: 'Config file already exists in custom folder. Overwrite with local config?',
            default: false,
          }])

          if (!overwrite) {
            displayInfo('📥 Using existing custom config file')
          }
          else {
            copyFileSync(this.configFile, customConfigFile)
            displayInfo('📤 Copied local config to custom folder')
          }
        }
        else {
          copyFileSync(this.configFile, customConfigFile)
          displayInfo('📤 Moved config to custom folder')
        }
      }
      else {
        // Create empty config in custom folder
        const emptyConfig = { version: 1, configs: [] }
        writeFileSync(customConfigFile, JSON.stringify(emptyConfig, null, 2))
        displayInfo('📄 Created new config in custom folder')
      }

      // Create symlink
      await this.createConfigLink(customConfigFile)

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

      displaySuccess('✅ Successfully configured custom folder sync!')
      displayInfo(`📂 Config file: ${customConfigFile}`)
      displayInfo(`🔗 Linked to: ${this.configFile}`)

      return true
    }
    catch (error) {
      displayError(`❌ Failed to setup custom sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Setup S3 sync
   */
  private async setupS3Sync(): Promise<boolean> {
    try {
      displayInfo('🗄️  Setting up S3 sync...')

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
        displaySuccess('✅ Successfully configured S3 sync!')
      }

      return await this.s3SyncManager.isS3Configured()
    }
    catch (error) {
      displayError(`❌ Failed to setup S3 sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Create symlink from local config to cloud config
   */
  private async createConfigLink(targetPath: string): Promise<void> {
    try {
      // Remove existing file/link
      if (existsSync(this.configFile)) {
        const stats = statSync(this.configFile)
        if (stats.isSymbolicLink()) {
          unlinkSync(this.configFile)
          displayInfo('🗑️  Removed existing symlink')
        }
        else {
          // Backup existing file
          const backupPath = `${this.configFile}.backup.${Date.now()}`
          copyFileSync(this.configFile, backupPath)
          unlinkSync(this.configFile)
          displayInfo(`💾 Backed up existing config to: ${backupPath}`)
        }
      }

      // Create symlink
      if (process.platform === 'win32') {
        // On Windows, create junction for directories or symlink for files
        symlinkSync(targetPath, this.configFile, 'file')
      }
      else {
        // On Unix systems, create symbolic link
        symlinkSync(targetPath, this.configFile)
      }

      displayInfo('🔗 Created symlink to cloud config')
    }
    catch (error) {
      throw new Error(`Failed to create config link: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Sync all configuration files to cloud storage using generalized approach
   */
  private async syncAllConfigFilesToCloud(cloudPath: string): Promise<void> {
    try {
      // Get all standard config files (main config, S3 config, etc.)
      const configFiles = CloudConfigSyncer.getStandardConfigFiles()

      // Filter to only sync files that exist and aren't the main config (already handled)
      const additionalConfigs = configFiles.filter(config =>
        config.name !== 'main-config' && existsSync(config.localPath),
      )

      if (additionalConfigs.length === 0) {
        displayInfo('ℹ️  No additional configuration files found to sync')
        return
      }

      await CloudConfigSyncer.syncConfigFilesToCloud(additionalConfigs, {
        cloudPath,
        backupOnReplace: true,
        verbose: true,
      })
    }
    catch (error) {
      displayWarning(`⚠️  Failed to sync additional config files: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update S3 settings when cloud sync is enabled
   */
  private async updateS3Settings(cloudSyncEnabled: boolean): Promise<void> {
    if (await this.s3SyncManager.isS3Configured()) {
      // When cloud sync is enabled, disable auto-download from S3 but keep upload
      // This treats S3 as backup when cloud sync is primary
      displayInfo(cloudSyncEnabled
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
        displayInfo('ℹ️  Sync is not currently enabled')
        return true
      }

      displayInfo('🔄 Disabling sync...')

      // If config is symlinked, replace with actual file
      if (existsSync(this.configFile)) {
        const stats = statSync(this.configFile)
        if (stats.isSymbolicLink()) {
          const targetPath = readlinkSync(this.configFile)

          // Copy target file to local location
          if (existsSync(targetPath)) {
            unlinkSync(this.configFile)
            copyFileSync(targetPath, this.configFile)
            displayInfo('📥 Restored config from cloud location')
          }
          else {
            displayWarning('⚠️  Cloud config file not found, removing broken symlink')
            unlinkSync(this.configFile)

            // Create an empty config if no local config exists
            const emptyConfig = { version: 1, configs: [] }
            writeFileSync(this.configFile, JSON.stringify(emptyConfig, null, 2))
            displayInfo('📄 Created new local config file')
          }
        }
      }

      // Remove sync configuration
      if (existsSync(this.syncConfigFile)) {
        unlinkSync(this.syncConfigFile)
      }

      // Restore S3 auto-download if S3 is configured
      await this.updateS3Settings(false)

      displaySuccess('✅ Sync disabled successfully')
      return true
    }
    catch (error) {
      displayError(`❌ Failed to disable sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Check if a file is a symlink with Windows compatibility
   */
  private isSymlinkCompatible(filePath: string): boolean {
    try {
      // On Windows, check if we can read the symlink target
      if (process.platform === 'win32') {
        try {
          readlinkSync(filePath)
          return true
        }
        catch {
          // If readlinkSync fails, it's not a symlink
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
    if (!existsSync(this.configFile)) {
      issues.push('Config file does not exist')
    }
    else {
      if (syncProvider !== 's3') {
        // For cloud/custom sync, config should be a symlink
        if (!this.isSymlinkCompatible(this.configFile)) {
          issues.push('Config file is not a symlink')
        }
        else {
          try {
            const targetPath = readlinkSync(this.configFile)
            if (!existsSync(targetPath)) {
              issues.push('Symlink target does not exist')
            }
            else {
              // Determine cloud path based on provider
              if (syncProvider === 'icloud' || syncProvider === 'onedrive') {
                cloudPath = syncConfig.cloudPath
              }
              else if (syncProvider === 'custom') {
                cloudPath = syncConfig.customPath
              }

              if (cloudPath && targetPath.includes(cloudPath)) {
                isValid = true
              }
              else {
                issues.push('Symlink target is not in expected cloud location')
              }
            }
          }
          catch (error) {
            issues.push(`Failed to read symlink: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
      }
      else {
        // For S3 sync, config should be a regular file
        if (this.isSymlinkCompatible(this.configFile)) {
          issues.push('Config file should not be a symlink for S3 sync')
        }
        else {
          isValid = await this.s3SyncManager.isS3Configured()
          if (!isValid) {
            issues.push('S3 is not properly configured')
          }
        }
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
    displayWarning('⚠️  Sync configuration issues detected:')
    status.issues.forEach((issue) => {
      displayWarning(`  • ${issue}`)
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
      displayInfo(`🔍 Found existing configuration in ${provider} - Setting up automatic sync...`)

      // Create symlink to the existing cloud config
      await this.createConfigLink(configPath)

      // Save sync configuration
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

      displaySuccess(`✅ Automatically configured ${provider} sync!`)
      displayInfo(`📂 Config file: ${configPath}`)
      displayInfo(`🔗 Linked to: ${this.configFile}`)

      return true
    }
    catch (error) {
      displayError(`❌ Failed to auto-setup ${provider} sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }
}
