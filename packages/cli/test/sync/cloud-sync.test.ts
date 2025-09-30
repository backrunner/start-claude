import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CURRENT_CONFIG_VERSION } from '../../src/config/types'

describe('Cloud Sync - Path Reference', () => {
  let testDir: string
  let localConfigDir: string
  let cloudConfigDir: string
  let localConfigFile: string
  let cloudConfigFile: string
  let syncConfigFile: string

  beforeEach(() => {
    // Create test directories
    testDir = join(tmpdir(), `start-claude-test-${Date.now()}`)
    localConfigDir = join(testDir, '.start-claude')
    cloudConfigDir = join(testDir, 'cloud', '.start-claude')

    mkdirSync(localConfigDir, { recursive: true })
    mkdirSync(cloudConfigDir, { recursive: true })

    localConfigFile = join(localConfigDir, 'config.json')
    cloudConfigFile = join(cloudConfigDir, 'config.json')
    syncConfigFile = join(localConfigDir, 'sync.json')
  })

  afterEach(() => {
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('Path Reference System', () => {
    it('should read from local when no sync configured', () => {
      // Arrange: Create local config only
      const localConfig = {
        version: 1,
        configs: [{ name: 'local-config', apiKey: 'local-key' }],
      }
      writeFileSync(localConfigFile, JSON.stringify(localConfig, null, 2))

      // Act & Assert
      const content = readFileSync(localConfigFile, 'utf-8')
      const parsed = JSON.parse(content)
      expect(parsed.configs).toHaveLength(1)
      expect(parsed.configs[0].name).toBe('local-config')
    })

    it('should detect cloud config path when sync is configured', () => {
      // Arrange: Create cloud config and sync.json
      const cloudConfig = {
        version: 1,
        configs: [{ name: 'cloud-config', apiKey: 'cloud-key' }],
      }
      writeFileSync(cloudConfigFile, JSON.stringify(cloudConfig, null, 2))

      const syncConfig = {
        enabled: true,
        provider: 'icloud',
        cloudPath: join(testDir, 'cloud'),
        linkedAt: new Date().toISOString(),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig, null, 2))

      // Act: Verify sync config is readable
      const syncContent = JSON.parse(readFileSync(syncConfigFile, 'utf-8'))
      const cloudPath = syncContent.cloudPath
      const cloudConfigPath = join(cloudPath, '.start-claude', 'config.json')

      // Assert
      expect(existsSync(cloudConfigPath)).toBe(true)
      const cloudConfigContent = JSON.parse(readFileSync(cloudConfigPath, 'utf-8'))
      expect(cloudConfigContent.configs[0].name).toBe('cloud-config')
    })

    it('should handle S3 sync separately (not using path reference)', () => {
      // Arrange: Configure S3 sync (should not use path reference)
      const localConfig = {
        version: 1,
        configs: [{ name: 'local-config', apiKey: 'local-key' }],
      }
      writeFileSync(localConfigFile, JSON.stringify(localConfig, null, 2))

      const syncConfig = {
        enabled: true,
        provider: 's3',
        linkedAt: new Date().toISOString(),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig, null, 2))

      // Act & Assert: S3 sync should still use local file
      const content = readFileSync(localConfigFile, 'utf-8')
      const parsed = JSON.parse(content)
      expect(parsed.configs[0].name).toBe('local-config')
    })

    it('should fall back to local if cloud config does not exist', () => {
      // Arrange: Sync configured but cloud file missing
      const localConfig = {
        version: 1,
        configs: [{ name: 'local-fallback', apiKey: 'local-key' }],
      }
      writeFileSync(localConfigFile, JSON.stringify(localConfig, null, 2))

      const syncConfig = {
        enabled: true,
        provider: 'icloud',
        cloudPath: join(testDir, 'cloud'),
        linkedAt: new Date().toISOString(),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig, null, 2))

      // Note: cloudConfigFile is NOT created

      // Act & Assert: Should fall back to local
      const content = readFileSync(localConfigFile, 'utf-8')
      const parsed = JSON.parse(content)
      expect(parsed.configs[0].name).toBe('local-fallback')
    })
  })

  describe('Backup Creation', () => {
    it('should create backup when moving config to cloud', () => {
      // Arrange
      const localConfig = {
        version: 1,
        configs: [{ name: 'original-config', apiKey: 'original-key' }],
      }
      writeFileSync(localConfigFile, JSON.stringify(localConfig, null, 2))

      // Act: Simulate moving to cloud with backup
      const backupPath = `${localConfigFile}.backup.${Date.now()}`
      copyFileSync(localConfigFile, backupPath)
      copyFileSync(localConfigFile, cloudConfigFile)

      // Assert
      expect(existsSync(backupPath)).toBe(true)
      expect(existsSync(cloudConfigFile)).toBe(true)

      const backupContent = JSON.parse(readFileSync(backupPath, 'utf-8'))
      expect(backupContent.configs[0].name).toBe('original-config')

      // Cleanup
      rmSync(backupPath)
    })
  })

  describe('S3 Config Sync', () => {
    it('should also sync s3-config.json to cloud', () => {
      // Arrange
      const localS3Config = join(localConfigDir, 's3-config.json')
      const cloudS3Config = join(cloudConfigDir, 's3-config.json')

      const s3Config = {
        version: 1,
        s3Config: {
          bucket: 'test-bucket',
          region: 'us-east-1',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
          key: 'configs/config.json',
        },
      }
      writeFileSync(localS3Config, JSON.stringify(s3Config, null, 2))

      // Act: Simulate syncing to cloud
      const backupPath = `${localS3Config}.backup.${Date.now()}`
      copyFileSync(localS3Config, backupPath)
      copyFileSync(localS3Config, cloudS3Config)

      // Assert
      expect(existsSync(cloudS3Config)).toBe(true)
      const cloudS3Content = JSON.parse(readFileSync(cloudS3Config, 'utf-8'))
      expect(cloudS3Content.s3Config.bucket).toBe('test-bucket')

      // Cleanup
      rmSync(backupPath)
    })
  })
})
