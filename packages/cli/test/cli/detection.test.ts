import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock execAsync function
const mockExecAsync = vi.fn()

// Mock the cache manager
const mockCacheInstance = {
  isClaudeInstalled: vi.fn(),
  setClaudeInstalled: vi.fn(),
  getClaudeVersion: vi.fn(),
}

vi.mock('../../src/utils/config/cache-manager', () => ({
  CacheManager: {
    getInstance: vi.fn(() => mockCacheInstance),
  },
}))

// Mock the node modules
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: vi.fn(() => mockExecAsync),
}))

describe('checkClaudeInstallation', () => {
  let checkClaudeInstallation: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset cache mocks
    mockCacheInstance.isClaudeInstalled.mockReturnValue(null)
    mockCacheInstance.getClaudeVersion.mockReturnValue(null)

    // Clear module cache to ensure fresh imports
    vi.resetModules()

    // Import the function after mocks are set up
    const detectionModule = await import('../../src/utils/cli/detection')
    checkClaudeInstallation = detectionModule.checkClaudeInstallation
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('should return installed true with version when claude is available', async () => {
    mockExecAsync.mockResolvedValue({
      stdout: 'claude version 1.0.0\n',
      stderr: '',
    })

    const result = await checkClaudeInstallation()

    expect(result).toEqual({
      isInstalled: true,
      version: 'claude version 1.0.0',
    })
    expect(mockExecAsync).toHaveBeenCalledWith('claude --version')
  })

  it('should return installed false with error when claude is not available', async () => {
    const mockError = new Error('Command not found: claude')
    mockExecAsync.mockRejectedValue(mockError)

    const result = await checkClaudeInstallation()

    expect(result.isInstalled).toBe(false)
    expect(result.error).toBe('Command not found: claude')
    expect(mockExecAsync).toHaveBeenCalledWith('claude --version')
  })

  it('should handle unknown error types', async () => {
    mockExecAsync.mockRejectedValue('string error')

    const result = await checkClaudeInstallation()

    expect(result.isInstalled).toBe(false)
    expect(result.error).toBe('Unknown error')
  })
})
