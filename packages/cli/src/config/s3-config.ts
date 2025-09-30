import type { S3ConfigFile } from './types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { UILogger } from '../utils/cli/ui'
import { CURRENT_S3_CONFIG_VERSION } from './types'

const CONFIG_DIR = path.join(os.homedir(), '.start-claude')
const S3_CONFIG_FILE = path.join(CONFIG_DIR, 's3-config.json')
const SYNC_CONFIG_FILE = path.join(CONFIG_DIR, 'sync.json')

/**
 * S3 configuration interface for external use
 */
export interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  key: string
  endpointUrl?: string
  remoteConfigCheckIntervalMinutes?: number
}

/**
 * Manager for S3 configuration file operations
 */
export class S3ConfigFileManager {
  private static instance: S3ConfigFileManager | null = null

  private constructor() {
    this.ensureConfigDir()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): S3ConfigFileManager {
    if (!S3ConfigFileManager.instance) {
      S3ConfigFileManager.instance = new S3ConfigFileManager()
    }
    return S3ConfigFileManager.instance
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
  }

  /**
   * Get the actual S3 config file path (cloud or local)
   * If cloud sync is enabled, return the cloud path
   */
  private getActualS3ConfigPath(): string {
    try {
      if (fs.existsSync(SYNC_CONFIG_FILE)) {
        const syncConfigContent = fs.readFileSync(SYNC_CONFIG_FILE, 'utf-8')
        const syncConfig = JSON.parse(syncConfigContent)

        // Only use cloud path for iCloud, OneDrive, or custom sync (not S3)
        if (syncConfig.enabled && syncConfig.provider !== 's3') {
          const cloudPath = syncConfig.cloudPath || syncConfig.customPath
          if (cloudPath) {
            const cloudS3ConfigPath = path.join(cloudPath, '.start-claude', 's3-config.json')
            // Verify cloud S3 config exists
            if (fs.existsSync(cloudS3ConfigPath)) {
              return cloudS3ConfigPath
            }
          }
        }
      }
    }
    catch {
      // If any error reading sync config, fall back to local
    }

    return S3_CONFIG_FILE
  }

  /**
   * Check if S3 config file exists (checks both local and cloud)
   */
  exists(): boolean {
    const actualPath = this.getActualS3ConfigPath()
    return fs.existsSync(actualPath)
  }

  /**
   * Get the S3 config file path (for cloud sync support)
   */
  getConfigFilePath(): string {
    return S3_CONFIG_FILE
  }

  /**
   * Load S3 configuration
   * Automatically reads from cloud storage if cloud sync is enabled
   */
  load(): S3ConfigFile | null {
    if (!this.exists()) {
      return null
    }

    try {
      const actualPath = this.getActualS3ConfigPath()
      const content = fs.readFileSync(actualPath, 'utf-8')
      const config = JSON.parse(content) as S3ConfigFile

      // Validate version (future-proofing for S3 config migrations)
      if (config.version > CURRENT_S3_CONFIG_VERSION) {
        const ui = new UILogger()
        ui.displayWarning(`S3 config file version ${config.version} is newer than supported version ${CURRENT_S3_CONFIG_VERSION}`)
      }

      return config
    }
    catch (error) {
      const ui = new UILogger()
      ui.displayWarning(`Error loading S3 config file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  /**
   * Save S3 configuration
   * Automatically writes to cloud storage if cloud sync is enabled
   */
  save(s3Config: S3Config): void {
    this.ensureConfigDir()

    const configFile: S3ConfigFile = {
      version: CURRENT_S3_CONFIG_VERSION,
      s3Config,
      metadata: {
        createdAt: this.exists() ? this.load()?.metadata.createdAt || new Date().toISOString() : new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
    }

    const actualPath = this.getActualS3ConfigPath()

    // Ensure the directory exists (for cloud paths)
    const actualDir = path.dirname(actualPath)
    if (!fs.existsSync(actualDir)) {
      fs.mkdirSync(actualDir, { recursive: true })
    }

    fs.writeFileSync(actualPath, JSON.stringify(configFile, null, 2))
  }

  /**
   * Get S3 configuration (just the config part, not the wrapper)
   */
  getS3Config(): S3Config | null {
    const configFile = this.load()
    return configFile?.s3Config || null
  }

  /**
   * Check if S3 is configured
   */
  isConfigured(): boolean {
    const config = this.getS3Config()
    return config !== null
      && Boolean(config.bucket)
      && Boolean(config.region)
      && Boolean(config.accessKeyId)
      && Boolean(config.secretAccessKey)
      && Boolean(config.key)
  }

  /**
   * Remove S3 configuration
   */
  remove(): void {
    if (this.exists()) {
      fs.unlinkSync(S3_CONFIG_FILE)
    }
  }

  /**
   * Create S3 config from migration (called during config migration)
   */
  createFromMigration(s3Config: S3Config): void {
    const configFile: S3ConfigFile = {
      version: CURRENT_S3_CONFIG_VERSION,
      s3Config,
      metadata: {
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        migratedFrom: 'system-settings',
      },
    }

    this.ensureConfigDir()
    fs.writeFileSync(S3_CONFIG_FILE, JSON.stringify(configFile, null, 2))
    const ui = new UILogger()
    ui.displayInfo(`S3 configuration migrated to separate file: ${S3_CONFIG_FILE}`)
  }
}
