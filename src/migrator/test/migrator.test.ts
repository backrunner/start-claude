import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CURRENT_CONFIG_VERSION, MigrationDetector, Migrator } from '../src/index'

describe('migrator', () => {
  const testDir = join(__dirname, 'test-configs')
  const configPath = join(testDir, 'config.json')

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe('migrationDetector', () => {
    it('should detect when no migration is needed', () => {
      const config = {
        version: CURRENT_CONFIG_VERSION,
        configs: [],
        settings: {},
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))

      const result = MigrationDetector.quickCheck(configPath, CURRENT_CONFIG_VERSION)
      expect(result?.needsMigration).toBe(false)
    })

    it('should detect when migration is needed', () => {
      const config = {
        version: 1,
        configs: [],
        settings: {
          s3Sync: {
            bucket: 'test-bucket',
            region: 'us-east-1',
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
            key: 'test-key',
          },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))

      const result = MigrationDetector.quickCheck(configPath, CURRENT_CONFIG_VERSION)
      expect(result?.needsMigration).toBe(true)
      expect(result?.fileVersion).toBe(1)
      expect(result?.targetVersion).toBe(CURRENT_CONFIG_VERSION)
    })

    it('should return null for non-existent files', () => {
      const result = MigrationDetector.quickCheck('/non/existent/path', CURRENT_CONFIG_VERSION)
      expect(result).toBe(null)
    })
  })

  describe('migrator', () => {
    it('should create migrator instance', () => {
      const migrator = new Migrator({
        registryPath: '../registry',
        currentVersion: CURRENT_CONFIG_VERSION,
        backupDirectory: join(testDir, 'backups'),
      })

      expect(migrator).toBeInstanceOf(Migrator)
    })

    it('should detect migration needed correctly', () => {
      const config = {
        version: 1,
        configs: [],
        settings: {
          s3Sync: {
            bucket: 'test-bucket',
            region: 'us-east-1',
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
            key: 'test-key',
          },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))

      const migrator = new Migrator({
        registryPath: '../registry',
        currentVersion: CURRENT_CONFIG_VERSION,
        backupDirectory: join(testDir, 'backups'),
      })

      const detection = migrator.detectMigrationNeeded(configPath)
      expect(detection.needsMigration).toBe(true)
      expect(detection.currentVersion).toBe(1)
      expect(detection.targetVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(detection.migrationPath).toBeDefined()
      expect(detection.migrationPath!.length).toBeGreaterThan(0)
    })
  })
})
