import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Config Reading with Cloud Sync', () => {
  let testDir: string
  let localConfigDir: string
  let cloudConfigDir: string
  let localConfigFile: string
  let cloudConfigFile: string
  let syncConfigFile: string
  let localS3ConfigFile: string
  let cloudS3ConfigFile: string

  beforeEach(() => {
    testDir = join(tmpdir(), `start-claude-read-test-${Date.now()}`)
    localConfigDir = join(testDir, '.start-claude')
    cloudConfigDir = join(testDir, 'iCloud', '.start-claude')

    mkdirSync(localConfigDir, { recursive: true })
    mkdirSync(cloudConfigDir, { recursive: true })

    localConfigFile = join(localConfigDir, 'config.json')
    cloudConfigFile = join(cloudConfigDir, 'config.json')
    syncConfigFile = join(localConfigDir, 'sync.json')
    localS3ConfigFile = join(localConfigDir, 's3-config.json')
    cloudS3ConfigFile = join(cloudConfigDir, 's3-config.json')
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  // Simulate ConfigFileManager.getActualConfigPath()
  function getActualConfigPath(): string {
    try {
      if (existsSync(syncConfigFile)) {
        const syncConfigContent = readFileSync(syncConfigFile, 'utf-8')
        const syncConfig = JSON.parse(syncConfigContent)

        if (syncConfig.enabled && syncConfig.provider !== 's3') {
          const cloudPath = syncConfig.cloudPath || syncConfig.customPath
          if (cloudPath) {
            const cloudConfigPath = join(cloudPath, '.start-claude', 'config.json')
            if (existsSync(cloudConfigPath)) {
              return cloudConfigPath
            }
          }
        }
      }
    }
    catch {
      // Fall back to local
    }

    return localConfigFile
  }

  // Simulate S3ConfigFileManager.getActualS3ConfigPath()
  function getActualS3ConfigPath(): string {
    try {
      if (existsSync(syncConfigFile)) {
        const syncConfigContent = readFileSync(syncConfigFile, 'utf-8')
        const syncConfig = JSON.parse(syncConfigContent)

        if (syncConfig.enabled && syncConfig.provider !== 's3') {
          const cloudPath = syncConfig.cloudPath || syncConfig.customPath
          if (cloudPath) {
            const cloudS3Path = join(cloudPath, '.start-claude', 's3-config.json')
            if (existsSync(cloudS3Path)) {
              return cloudS3Path
            }
          }
        }
      }
    }
    catch {
      // Fall back to local
    }

    return localS3ConfigFile
  }

  describe('Config File Path Resolution', () => {
    it('should return local path when no sync configured', () => {
      const config = {
        version: 1,
        configs: [{ name: 'local-config' }],
      }
      writeFileSync(localConfigFile, JSON.stringify(config))

      const actualPath = getActualConfigPath()

      expect(actualPath).toBe(localConfigFile)
      expect(existsSync(actualPath)).toBe(true)
    })

    it('should return cloud path when iCloud sync is configured', () => {
      const cloudConfig = {
        version: 1,
        configs: [{ name: 'cloud-config' }],
      }
      writeFileSync(cloudConfigFile, JSON.stringify(cloudConfig))

      const syncConfig = {
        enabled: true,
        provider: 'icloud',
        cloudPath: join(testDir, 'iCloud'),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      const actualPath = getActualConfigPath()

      expect(actualPath).toBe(cloudConfigFile)
      expect(existsSync(actualPath)).toBe(true)
    })

    it('should return cloud path when OneDrive sync is configured', () => {
      const cloudConfig = {
        version: 1,
        configs: [{ name: 'onedrive-config' }],
      }
      writeFileSync(cloudConfigFile, JSON.stringify(cloudConfig))

      const syncConfig = {
        enabled: true,
        provider: 'onedrive',
        cloudPath: join(testDir, 'iCloud'), // Reusing same dir for test
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      const actualPath = getActualConfigPath()

      expect(actualPath).toBe(cloudConfigFile)
    })

    it('should return cloud path when custom folder sync is configured', () => {
      const customCloudDir = join(testDir, 'custom', '.start-claude')
      mkdirSync(customCloudDir, { recursive: true })
      const customCloudFile = join(customCloudDir, 'config.json')

      const cloudConfig = {
        version: 1,
        configs: [{ name: 'custom-config' }],
      }
      writeFileSync(customCloudFile, JSON.stringify(cloudConfig))

      const syncConfig = {
        enabled: true,
        provider: 'custom',
        customPath: join(testDir, 'custom'),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      const actualPath = getActualConfigPath()

      expect(actualPath).toBe(customCloudFile)
    })

    it('should return local path when S3 sync is configured', () => {
      const localConfig = {
        version: 1,
        configs: [{ name: 'local-with-s3' }],
      }
      writeFileSync(localConfigFile, JSON.stringify(localConfig))

      const syncConfig = {
        enabled: true,
        provider: 's3',
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      const actualPath = getActualConfigPath()

      // S3 sync should NOT use path reference
      expect(actualPath).toBe(localConfigFile)
    })

    it('should fallback to local when cloud file does not exist', () => {
      const localConfig = {
        version: 1,
        configs: [{ name: 'local-fallback' }],
      }
      writeFileSync(localConfigFile, JSON.stringify(localConfig))

      const syncConfig = {
        enabled: true,
        provider: 'icloud',
        cloudPath: join(testDir, 'iCloud'),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      // Note: cloudConfigFile is NOT created

      const actualPath = getActualConfigPath()

      expect(actualPath).toBe(localConfigFile)
    })

    it('should fallback to local when sync.json is malformed', () => {
      const localConfig = {
        version: 1,
        configs: [{ name: 'local-fallback' }],
      }
      writeFileSync(localConfigFile, JSON.stringify(localConfig))

      // Write invalid JSON
      writeFileSync(syncConfigFile, '{invalid json')

      const actualPath = getActualConfigPath()

      expect(actualPath).toBe(localConfigFile)
    })
  })

  describe('S3 Config Path Resolution', () => {
    it('should return local S3 config when no sync configured', () => {
      const s3Config = {
        version: 1,
        s3Config: { bucket: 'local-bucket' },
      }
      writeFileSync(localS3ConfigFile, JSON.stringify(s3Config))

      const actualPath = getActualS3ConfigPath()

      expect(actualPath).toBe(localS3ConfigFile)
    })

    it('should return cloud S3 config when cloud sync is configured', () => {
      const cloudS3Config = {
        version: 1,
        s3Config: { bucket: 'cloud-bucket' },
      }
      writeFileSync(cloudS3ConfigFile, JSON.stringify(cloudS3Config))

      const syncConfig = {
        enabled: true,
        provider: 'icloud',
        cloudPath: join(testDir, 'iCloud'),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      const actualPath = getActualS3ConfigPath()

      expect(actualPath).toBe(cloudS3ConfigFile)
    })

    it('should return local S3 config for S3 sync provider', () => {
      const localS3Config = {
        version: 1,
        s3Config: { bucket: 'local-s3-bucket' },
      }
      writeFileSync(localS3ConfigFile, JSON.stringify(localS3Config))

      const syncConfig = {
        enabled: true,
        provider: 's3',
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      const actualPath = getActualS3ConfigPath()

      // S3 sync should use local S3 config
      expect(actualPath).toBe(localS3ConfigFile)
    })
  })

  describe('Config Reading Behavior', () => {
    it('should read correct config content from cloud', () => {
      const cloudConfig = {
        version: 1,
        configs: [
          { id: 'uuid-1', name: 'Cloud Config 1', apiKey: 'cloud-key-1' },
          { id: 'uuid-2', name: 'Cloud Config 2', apiKey: 'cloud-key-2' },
        ],
      }
      writeFileSync(cloudConfigFile, JSON.stringify(cloudConfig))

      const syncConfig = {
        enabled: true,
        provider: 'icloud',
        cloudPath: join(testDir, 'iCloud'),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      const actualPath = getActualConfigPath()
      const content = JSON.parse(readFileSync(actualPath, 'utf-8'))

      expect(content.configs).toHaveLength(2)
      expect(content.configs[0].name).toBe('Cloud Config 1')
      expect(content.configs[1].name).toBe('Cloud Config 2')
    })

    it('should write to cloud when sync is enabled', () => {
      // First create a dummy cloud config so getActualConfigPath returns cloud path
      const dummyCloudConfig = {
        version: 1,
        configs: [],
      }
      writeFileSync(cloudConfigFile, JSON.stringify(dummyCloudConfig))

      const syncConfig = {
        enabled: true,
        provider: 'icloud',
        cloudPath: join(testDir, 'iCloud'),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      // Simulate writing
      const newConfig = {
        version: 1,
        configs: [{ id: 'new-uuid', name: 'New Config', apiKey: 'new-key' }],
      }

      const actualPath = getActualConfigPath()
      expect(actualPath).toBe(cloudConfigFile) // Verify it resolves to cloud

      writeFileSync(actualPath, JSON.stringify(newConfig))

      // Verify it was written to cloud
      expect(existsSync(cloudConfigFile)).toBe(true)
      const content = JSON.parse(readFileSync(cloudConfigFile, 'utf-8'))
      expect(content.configs[0].name).toBe('New Config')
    })
  })

  describe('Multiple Config Access', () => {
    it('should consistently read from same source', () => {
      const cloudConfig = {
        version: 1,
        configs: [{ name: 'cloud-config' }],
      }
      writeFileSync(cloudConfigFile, JSON.stringify(cloudConfig))

      const syncConfig = {
        enabled: true,
        provider: 'icloud',
        cloudPath: join(testDir, 'iCloud'),
      }
      writeFileSync(syncConfigFile, JSON.stringify(syncConfig))

      // Read multiple times
      const path1 = getActualConfigPath()
      const path2 = getActualConfigPath()
      const path3 = getActualConfigPath()

      expect(path1).toBe(path2)
      expect(path2).toBe(path3)
      expect(path1).toBe(cloudConfigFile)
    })
  })
})
