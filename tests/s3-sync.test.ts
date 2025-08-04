import type { ConfigFile } from '@/core/types'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the AWS S3 client
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
    config: {},
    destroy: vi.fn(),
    middlewareStack: {},
  })),
  HeadObjectCommand: vi.fn().mockImplementation(() => ({
    input: {},
    resolveMiddleware: vi.fn(),
    middlewareStack: {},
    resolveMiddlewareWithContext: vi.fn(),
  })),
  PutObjectCommand: vi.fn().mockImplementation(() => ({
    input: {},
    resolveMiddleware: vi.fn(),
    middlewareStack: {},
    resolveMiddlewareWithContext: vi.fn(),
  })),
  GetObjectCommand: vi.fn().mockImplementation(() => ({
    input: {},
    resolveMiddleware: vi.fn(),
    middlewareStack: {},
    resolveMiddlewareWithContext: vi.fn(),
  })),
}))

// Mock the dependencies
vi.mock('@/core/config', () => ({
  ConfigManager: vi.fn().mockImplementation(() => ({
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getConfigFile: vi.fn(),
    saveConfigFile: vi.fn(),
    listConfigs: vi.fn(),
  })),
}))

vi.mock('@/utils/ui', () => ({
  displayError: vi.fn(),
  displayInfo: vi.fn(),
  displaySuccess: vi.fn(),
  displayWarning: vi.fn(),
}))

const mockS3Client = vi.mocked(S3Client)
const mockHeadObjectCommand = vi.mocked(HeadObjectCommand)
const mockPutObjectCommand = vi.mocked(PutObjectCommand)
const mockGetObjectCommand = vi.mocked(GetObjectCommand)

describe('s3SyncManager', () => {
  let S3SyncManager: any
  let s3SyncManager: any
  let mockConfigManager: any

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

    // Get the mocked config manager instance
    mockConfigManager = s3SyncManager.configManager
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('setupS3Sync', () => {
    it('should setup S3 sync with standard AWS configuration', async () => {
      const mockSend = vi.fn().mockRejectedValue({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })
      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))
      mockHeadObjectCommand.mockImplementation(() => ({
        input: {},
        resolveMiddleware: vi.fn(),
        middlewareStack: {},
        resolveMiddlewareWithContext: vi.fn(),
      } as any))

      const result = await s3SyncManager.setupS3Sync(mockS3Config)

      expect(mockS3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      })
      expect(mockConfigManager.updateSettings).toHaveBeenCalledWith({
        s3Sync: mockS3Config,
      })
      expect(result).toBe(false) // No remote config exists
    })

    it('should setup S3 sync with custom endpoint (S3-compatible)', async () => {
      const mockSend = vi.fn().mockResolvedValue({})
      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))
      mockHeadObjectCommand.mockImplementation(() => ({
        input: {},
        resolveMiddleware: vi.fn(),
        middlewareStack: {},
        resolveMiddlewareWithContext: vi.fn(),
      } as any))

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
      const mockSend = vi.fn().mockResolvedValue({}) // HeadObject succeeds
      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))

      const result = await s3SyncManager.setupS3Sync(mockS3Config)

      expect(result).toBe(false) // Remote config exists
    })

    it('should handle setup errors gracefully', async () => {
      const mockSend = vi.fn().mockRejectedValue(new Error('Network error'))
      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))

      const result = await s3SyncManager.setupS3Sync(mockS3Config)

      expect(result).toBe(false)
    })
  })

  describe('uploadConfigs', () => {
    it('should upload configurations to S3', async () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManager.getConfigFile.mockReturnValue({ configs: [], settings: {} })

      const mockSend = vi.fn().mockResolvedValue({})
      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))

      const result = await s3SyncManager.uploadConfigs()

      expect(mockPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-config.json',
        Body: expect.any(String),
        ContentType: 'application/json',
      })
      expect(result).toBe(true)
    })

    it('should handle upload errors', async () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManager.getConfigFile.mockReturnValue({ configs: [], settings: {} })

      const mockSend = vi.fn().mockRejectedValue(new Error('Upload failed'))
      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))

      const result = await s3SyncManager.uploadConfigs()

      expect(result).toBe(false)
    })

    it('should return false when S3 is not configured', async () => {
      mockConfigManager.getSettings.mockReturnValue({})

      const result = await s3SyncManager.uploadConfigs()

      expect(result).toBe(false)
    })
  })

  describe('downloadConfigs', () => {
    it('should download configurations from S3', async () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManager.listConfigs.mockReturnValue([])

      const mockConfigData: ConfigFile = {
        configs: [{ name: 'test', isDefault: true }],
        settings: { overrideClaudeCommand: false },
      }

      const mockSend = vi.fn()
        .mockResolvedValueOnce({}) // HeadObject succeeds
        .mockResolvedValueOnce({ // GetObject returns config data
          Body: {
            transformToString: vi.fn().mockResolvedValue(JSON.stringify(mockConfigData)),
          },
        })

      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))

      const result = await s3SyncManager.downloadConfigs(true)

      expect(mockGetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test-config.json',
      })
      expect(mockConfigManager.saveConfigFile).toHaveBeenCalledWith(mockConfigData)
      expect(result).toBe(true)
    })

    it('should handle case when no remote config exists', async () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3Config })

      const mockSend = vi.fn().mockRejectedValue({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })

      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))

      const result = await s3SyncManager.downloadConfigs()

      expect(result).toBe(false)
    })

    it('should handle local configs exist without force flag', async () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManager.listConfigs.mockReturnValue([{ name: 'existing' }])

      const mockSend = vi.fn().mockResolvedValue({}) // HeadObject succeeds
      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))

      const result = await s3SyncManager.downloadConfigs(false)

      expect(result).toBe(false)
    })
  })

  describe('isS3Configured', () => {
    it('should return true when S3 is configured', () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3Config })

      const result = s3SyncManager.isS3Configured()

      expect(result).toBe(true)
    })

    it('should return false when S3 is not configured', () => {
      mockConfigManager.getSettings.mockReturnValue({})

      const result = s3SyncManager.isS3Configured()

      expect(result).toBe(false)
    })
  })

  describe('getS3Status', () => {
    it('should return status for configured S3', () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3Config })

      const result = s3SyncManager.getS3Status()

      expect(result).toBe('Configured (Bucket: test-bucket, Region: us-east-1, Key: test-config.json)')
    })

    it('should return status for S3-compatible service with endpoint', () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3ConfigWithEndpoint })

      const result = s3SyncManager.getS3Status()

      expect(result).toBe('Configured (Bucket: test-bucket, Region: us-east-1, Endpoint: https://test.r2.cloudflarestorage.com, Key: test-config.json)')
    })

    it('should return not configured status', () => {
      mockConfigManager.getSettings.mockReturnValue({})

      const result = s3SyncManager.getS3Status()

      expect(result).toBe('Not configured')
    })
  })

  describe('syncConfigs', () => {
    it('should sync configurations to S3', async () => {
      mockConfigManager.getSettings.mockReturnValue({ s3Sync: mockS3Config })
      mockConfigManager.getConfigFile.mockReturnValue({ configs: [], settings: {} })

      const mockSend = vi.fn().mockResolvedValue({})
      mockS3Client.mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {},
      } as any))

      const result = await s3SyncManager.syncConfigs()

      expect(result).toBe(true)
    })

    it('should return false when not configured', async () => {
      mockConfigManager.getSettings.mockReturnValue({})

      const result = await s3SyncManager.syncConfigs()

      expect(result).toBe(false)
    })
  })
})
