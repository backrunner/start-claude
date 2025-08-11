import type { ConfigFile } from '@/config/types'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({ overwrite: true }),
  },
}))

// Mock file system
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  statSync: vi.fn().mockReturnValue({
    mtime: new Date('2023-01-01T00:00:00Z'),
  }),
}))

// Mock path operations
vi.mock('node:path', () => ({
  join: vi.fn((...paths) => paths.join('/')),
}))

// Mock os operations
vi.mock('node:os', () => ({
  homedir: vi.fn().mockReturnValue('/home/test'),
}))

// Create mock instances
const mockS3ClientInstance = {
  send: vi.fn(),
  config: {},
  destroy: vi.fn(),
  middlewareStack: {},
}

// Create a mock config manager instance
const mockConfigManagerInstance = {
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getConfigFile: vi.fn(),
  saveConfigFile: vi.fn(),
  listConfigs: vi.fn(),
  setAutoSyncCallback: vi.fn(),
}

// Mock the AWS S3 client
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => mockS3ClientInstance),
  PutObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}))

// Mock the dependencies
vi.mock('@/config/manager', () => ({
  ConfigManager: vi.fn().mockImplementation(() => mockConfigManagerInstance),
}))

vi.mock('@/utils/ui', () => ({
  displayError: vi.fn(),
  displayInfo: vi.fn(),
  displaySuccess: vi.fn(),
  displayWarning: vi.fn(),
}))

const mockS3Client = vi.mocked(S3Client)
const mockPutObjectCommand = vi.mocked(PutObjectCommand)

describe('s3SyncManager', () => {
  let S3SyncManager: any
  let s3SyncManager: any

  const mockS3Config = {
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    key: 'test-config.json',
  }

  const mockS3ConfigWithEndpoint = {
    ...mockS3Config,
    endpointUrl: 'https://test.r2.cloudflarestorage.com',
  }

  beforeEach(async () => {
    // Import S3SyncManager after mocks are set up
    const s3SyncModule = await import('@/storage/s3-sync')
    S3SyncManager = s3SyncModule.S3SyncManager
    s3SyncManager = new S3SyncManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
    // Reset the mock instance for each test
    mockS3ClientInstance.send.mockReset()
    mockConfigManagerInstance.getSettings.mockReset()
    mockConfigManagerInstance.updateSettings.mockReset()
    mockConfigManagerInstance.getConfigFile.mockReset()
    mockConfigManagerInstance.saveConfigFile.mockReset()
    mockConfigManagerInstance.listConfigs.mockReset()
  })

  describe('setupS3Sync', () => {
    it('should setup S3 sync with standard AWS configuration', async () => {
      mockS3ClientInstance.send.mockRejectedValue({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })

      const result = await s3SyncManager.setupS3Sync(mockS3Config)

      expect(mockS3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      })
      expect(result).toBe(false) // No remote config exists
    })

    it('should setup S3 sync with custom endpoint (S3-compatible)', async () => {
      mockS3ClientInstance.send.mockResolvedValue({})

      await s3SyncManager.setupS3Sync(mockS3ConfigWithEndpoint)

      expect(mockS3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
        endpoint: 'https://test.r2.cloudflarestorage.com',
        forcePathStyle: true,
      })
    })

    it('should detect existing remote configuration', async () => {
      mockS3ClientInstance.send.mockResolvedValue({}) // HeadObject succeeds

      const result = await s3SyncManager.setupS3Sync(mockS3Config)

      expect(result).toBe(false) // Remote config exists
    })

    it('should handle setup errors gracefully', async () => {
      mockS3ClientInstance.send.mockRejectedValue(new Error('Network error'))

      const result = await s3SyncManager.setupS3Sync(mockS3Config)

      expect(result).toBe(false)
    })
  })

  describe('uploadConfigs', () => {
    it('should upload configurations to S3', async () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManagerInstance.getConfigFile.mockReturnValue({ configs: [], settings: {} })

      // Mock the S3 client to handle HeadObject (file doesn't exist) and PutObject
      mockS3ClientInstance.send
        .mockRejectedValueOnce({ // HeadObject - file doesn't exist
          name: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        })
        .mockResolvedValueOnce({}) // PutObject - successful upload

      const result = await s3SyncManager.uploadConfigs()

      expect(mockPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-config.json',
        Body: expect.any(String),
        ContentType: 'application/json',
        Metadata: expect.any(Object),
      })
      expect(result).toBe(true)
    })

    it('should handle upload errors', async () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManagerInstance.getConfigFile.mockReturnValue({ configs: [], settings: {} })
      mockS3ClientInstance.send.mockRejectedValue(new Error('Upload failed'))

      const result = await s3SyncManager.uploadConfigs()

      expect(result).toBe(false)
    })

    it('should return false when S3 is not configured', async () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({})

      const result = await s3SyncManager.uploadConfigs()

      expect(result).toBe(false)
    })
  })

  describe('downloadConfigs', () => {
    it('should download configurations from S3', async () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManagerInstance.listConfigs.mockReturnValue([])

      const mockConfigData: ConfigFile = {
        version: 1,
        configs: [{ name: 'test', isDefault: true }],
        settings: { overrideClaudeCommand: false },
      }

      mockS3ClientInstance.send
        .mockResolvedValueOnce({}) // checkS3KeyExists - HeadObject succeeds
        .mockResolvedValueOnce({ // GetObject returns config data
          Body: {
            transformToString: vi.fn().mockResolvedValue(JSON.stringify(mockConfigData)),
          },
        })

      const result = await s3SyncManager.downloadConfigs(true)

      expect(result).toBe(true)
    })

    it('should handle case when no remote config exists', async () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockS3ClientInstance.send.mockRejectedValue({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })

      const result = await s3SyncManager.downloadConfigs()

      expect(result).toBe(false)
    })

    it('should handle local configs exist without force flag', async () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManagerInstance.listConfigs.mockReturnValue([{ name: 'existing' }])
      mockS3ClientInstance.send.mockResolvedValue({}) // HeadObject succeeds

      const result = await s3SyncManager.downloadConfigs(false)

      expect(result).toBe(false)
    })
  })

  describe('isS3Configured', () => {
    it('should return true when S3 is configured', () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3Config })

      const result = s3SyncManager.isS3Configured()

      expect(result).toBe(true)
    })

    it('should return false when S3 is not configured', () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({})

      const result = s3SyncManager.isS3Configured()

      expect(result).toBe(false)
    })
  })

  describe('getS3Status', () => {
    it('should return status for configured S3', () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3Config })

      const result = s3SyncManager.getS3Status()

      expect(result).toBe('Configured (Bucket: test-bucket, Region: us-east-1, Key: test-config.json)')
    })

    it('should return status for S3-compatible service with endpoint', () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3ConfigWithEndpoint })

      const result = s3SyncManager.getS3Status()

      expect(result).toBe('Configured (Bucket: test-bucket, Region: us-east-1, Endpoint: https://test.r2.cloudflarestorage.com, Key: test-config.json)')
    })

    it('should return not configured status', () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({})

      const result = s3SyncManager.getS3Status()

      expect(result).toBe('Not configured')
    })
  })

  describe('syncConfigs', () => {
    it('should sync configurations to S3', async () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManagerInstance.getConfigFile.mockReturnValue({ configs: [], settings: {} })

      // Mock the S3 client calls for syncConfigs (HeadObject + PutObject)
      mockS3ClientInstance.send
        .mockRejectedValueOnce({ // HeadObject - file doesn't exist
          name: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        })
        .mockResolvedValueOnce({}) // PutObject - successful upload

      const result = await s3SyncManager.syncConfigs()

      expect(result).toBe(true)
    })

    it('should return false when not configured', async () => {
      mockConfigManagerInstance.getSettings.mockReturnValue({})

      const result = await s3SyncManager.syncConfigs()

      expect(result).toBe(false)
    })
  })
})
