import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATION_REGISTRY } from '../src/core/registry'
import { StructuredMigrationProcessor } from '../src/processors/structured-processor'

describe('structuredMigrationProcessor', () => {
  const testDir = join(import.meta.dirname, 'test-structured')

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

  describe('structured migration operations', () => {
    it('should execute move operation', async () => {
      const migration = {
        fromVersion: 1,
        toVersion: 2,
        description: 'Test move operation',
        operations: [
          {
            type: 'move' as const,
            source: 'settings.oldField',
            target: 'settings.newField',
          },
        ],
      }

      const config = {
        version: 1,
        settings: {
          oldField: 'test-value',
          otherField: 'keep-this',
        },
      }

      const result = await StructuredMigrationProcessor.execute(migration, config)

      expect(result.version).toBe(2)
      expect(result.settings.newField).toBe('test-value')
      expect(result.settings.oldField).toBeUndefined()
      expect(result.settings.otherField).toBe('keep-this')
    })

    it('should execute delete operation', async () => {
      const migration = {
        fromVersion: 1,
        toVersion: 2,
        description: 'Test delete operation',
        operations: [
          {
            type: 'delete' as const,
            source: 'settings.unwantedField',
          },
        ],
      }

      const config = {
        version: 1,
        settings: {
          unwantedField: 'remove-this',
          keepField: 'keep-this',
        },
      }

      const result = await StructuredMigrationProcessor.execute(migration, config)

      expect(result.version).toBe(2)
      expect(result.settings.unwantedField).toBeUndefined()
      expect(result.settings.keepField).toBe('keep-this')
    })

    it('should execute operations with conditions', async () => {
      const migration = {
        fromVersion: 1,
        toVersion: 2,
        description: 'Test conditional operation',
        operations: [
          {
            type: 'delete' as const,
            source: 'settings.s3Sync',
            condition: (config: any) => config.settings?.s3Sync !== undefined,
          },
        ],
      }

      // Test with condition true
      const configWithS3 = {
        version: 1,
        settings: {
          s3Sync: { bucket: 'test' },
          otherField: 'keep',
        },
      }

      const resultWith = await StructuredMigrationProcessor.execute(migration, configWithS3)
      expect(resultWith.settings.s3Sync).toBeUndefined()
      expect(resultWith.settings.otherField).toBe('keep')

      // Test with condition false
      const configWithoutS3 = {
        version: 1,
        settings: {
          otherField: 'keep',
        },
      }

      const resultWithout = await StructuredMigrationProcessor.execute(migration, configWithoutS3)
      expect(resultWithout.settings.otherField).toBe('keep')
    })
  })

  describe('real migration registry', () => {
    it('should have version 1->2 migration in structured format', () => {
      const v1to2Migration = MIGRATION_REGISTRY.find(m => m.fromVersion === 1 && m.toVersion === 2)

      expect(v1to2Migration).toBeDefined()
      expect(v1to2Migration?.structured).toBeDefined()
      expect(v1to2Migration?.structured?.operations).toBeDefined()
      expect(v1to2Migration?.structured?.operations.length).toBeGreaterThan(0)
    })

    it('should execute the actual v1->2 migration', async () => {
      const v1to2Migration = MIGRATION_REGISTRY.find(m => m.fromVersion === 1 && m.toVersion === 2)

      if (!v1to2Migration?.structured) {
        throw new Error('v1->2 migration not found or not structured')
      }

      const v1Config = {
        version: 1,
        configs: [],
        settings: {
          overrideClaudeCommand: false,
          s3Sync: {
            bucket: 'test-bucket',
            region: 'us-east-1',
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
            key: 'test-key',
          },
        },
      }

      // Provide migrationsDir pointing to the scripts directory
      const migrationsDir = join(import.meta.dirname, '../migrations/scripts')

      // Provide a unique test directory for the S3 config file creation
      const testConfigDir = join(testDir, 's3-migration-test')
      mkdirSync(testConfigDir, { recursive: true })

      // Execute migration with custom config directory via scriptArgs
      const migration = {
        ...v1to2Migration.structured,
        operations: v1to2Migration.structured.operations.map(op => ({
          ...op,
          scriptArgs: {
            ...op.scriptArgs,
            configDir: testConfigDir,
          },
        })),
      }

      const result = await StructuredMigrationProcessor.execute(migration, v1Config, {
        migrationsDir,
      })

      expect(result.version).toBe(2)
      expect(result.settings.s3Sync).toBeUndefined()
      expect(result.settings.overrideClaudeCommand).toBe(false)
    })
  })
})
