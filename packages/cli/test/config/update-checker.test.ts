import * as childProcess from 'node:child_process'
import * as https from 'node:https'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../../../../package.json'
import { checkBackgroundUpgradeResult, checkForUpdates, performAutoUpdate, performBackgroundUpgrade, relaunchCLI } from '../../src/utils/config/update-checker'

// Get the actual version from package.json
const CURRENT_VERSION = packageJson.version

// Mock child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
}))

// Mock https for network requests
vi.mock('node:https', () => ({
  default: {
    get: vi.fn(),
  },
}))

// Mock tar
vi.mock('tar', () => ({
  extract: vi.fn(() => Promise.resolve()),
}))

// Mock fs functions
vi.mock('node:fs', () => ({
  accessSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  })),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  constants: {
    F_OK: 0,
    W_OK: 2,
  },
}))

// Mock the entire cache-manager module
const mockInstance = {
  shouldCheckForUpdates: vi.fn(),
  setUpdateCheckTimestamp: vi.fn(),
  getUpdateCheckTimestamp: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
}

vi.mock('../../src/utils/config/cache-manager', () => ({
  CacheManager: {
    getInstance: vi.fn(() => mockInstance),
  },
}))

const mockExec = vi.mocked(childProcess.exec)
const mockExecSync = vi.mocked(childProcess.execSync)
const mockSpawn = vi.mocked(childProcess.spawn)
const mockHttpsGet = vi.mocked(https.default.get)

describe('updateChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock process.argv
    Object.defineProperty(process, 'argv', {
      value: ['node', '/path/to/cli.js', '--config', 'test'],
      writable: true,
    })

    // Default cache behavior
    mockInstance.get.mockReturnValue(null)
    mockInstance.shouldCheckForUpdates.mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkForUpdates', () => {
    it('should return null when rate limited and not forced', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(false)

      const result = await checkForUpdates(false)
      expect(result).toBeNull()
      expect(mockHttpsGet).not.toHaveBeenCalled()
    })

    it('should check for updates via https when updates available', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(true)

      // Mock successful https request with new API format
      mockHttpsGet.mockImplementation((_url, _options, callback: any) => {
        const mockResponse = {
          on: vi.fn((event: string, handler: any) => {
            if (event === 'data') {
              const packageData = {
                'dist-tags': { latest: '1.0.1' },
                'versions': {
                  '1.0.0': { version: '1.0.0' },
                  '1.0.1': { version: '1.0.1' },
                },
              }
              handler(Buffer.from(JSON.stringify(packageData)))
            }
            if (event === 'end') {
              handler()
            }
            return mockResponse
          }),
        }
        callback(mockResponse)
        return {
          on: vi.fn(),
        } as any
      })

      const result = await checkForUpdates(false)

      expect(result).toEqual({
        currentVersion: CURRENT_VERSION,
        latestVersion: '1.0.1',
        hasUpdate: true,
        updateCommand: 'pnpm add -g start-claude@latest',
      })
    })

    it('should filter out beta/alpha versions and return latest stable', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(true)

      // Mock https response with package data that includes beta/alpha versions
      mockHttpsGet.mockImplementation((_url, _options, callback: any) => {
        const mockResponse = {
          on: vi.fn((event: string, handler: any) => {
            if (event === 'data') {
              const packageData = {
                'dist-tags': { latest: '1.0.5-beta.1' }, // Latest tag points to beta
                'versions': {
                  '1.0.3': { version: '1.0.3' },
                  '1.0.4': { version: '1.0.4' },
                  '1.0.5-beta.1': { version: '1.0.5-beta.1' },
                  '1.0.5-alpha.2': { version: '1.0.5-alpha.2' },
                },
              }
              handler(Buffer.from(JSON.stringify(packageData)))
            }
            if (event === 'end') {
              handler()
            }
            return mockResponse
          }),
        }
        callback(mockResponse)
        return {
          on: vi.fn(),
        } as any
      })

      const result = await checkForUpdates(false)

      expect(result).toEqual({
        currentVersion: CURRENT_VERSION,
        latestVersion: '1.0.4', // Should return latest stable, not beta
        hasUpdate: true,
        updateCommand: 'pnpm add -g start-claude@latest',
      })
    })

    it('should use latest tag if it points to a stable version', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(true)

      // Mock https response where latest tag points to stable version
      mockHttpsGet.mockImplementation((_url, _options, callback: any) => {
        const mockResponse = {
          on: vi.fn((event: string, handler: any) => {
            if (event === 'data') {
              const packageData = {
                'dist-tags': { latest: '1.0.4' }, // Latest tag points to stable
                'versions': {
                  '1.0.3': { version: '1.0.3' },
                  '1.0.4': { version: '1.0.4' },
                  '1.0.5-beta.1': { version: '1.0.5-beta.1' },
                },
              }
              handler(Buffer.from(JSON.stringify(packageData)))
            }
            if (event === 'end') {
              handler()
            }
            return mockResponse
          }),
        }
        callback(mockResponse)
        return {
          on: vi.fn(),
        } as any
      })

      const result = await checkForUpdates(false)

      expect(result).toEqual({
        currentVersion: CURRENT_VERSION,
        latestVersion: '1.0.4',
        hasUpdate: true,
        updateCommand: 'pnpm add -g start-claude@latest',
      })
    })

    it('should return null on network error', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(true)

      // Mock failed https request
      mockHttpsGet.mockImplementation(() => {
        return {
          on: vi.fn((event: string, handler: any) => {
            if (event === 'error') {
              handler(new Error('Network error'))
            }
          }),
        } as any
      })

      const result = await checkForUpdates(false)
      expect(result).toBeNull()
    })

    it('should save timestamp after successful check', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(true)

      // Mock successful https request with new API format
      mockHttpsGet.mockImplementation((_url, _options, callback: any) => {
        const mockResponse = {
          on: vi.fn((event: string, handler: any) => {
            if (event === 'data') {
              const packageData = {
                'dist-tags': { latest: '1.0.1' },
                'versions': {
                  '1.0.0': { version: '1.0.0' },
                  '1.0.1': { version: '1.0.1' },
                },
              }
              handler(Buffer.from(JSON.stringify(packageData)))
            }
            if (event === 'end') {
              handler()
            }
            return mockResponse
          }),
        }
        callback(mockResponse)
        return {
          on: vi.fn(),
        } as any
      })

      await checkForUpdates(false)

      expect(mockInstance.setUpdateCheckTimestamp).toHaveBeenCalledWith(expect.any(Number), CURRENT_VERSION)
    })
  })

  describe('performAutoUpdate', () => {
    beforeEach(() => {
      // Mock execSync for package manager detection
      mockExecSync.mockReturnValue(Buffer.from('7.0.0'))
    })

    it('should attempt silent upgrade by default when not flagged as failed', async () => {
      // Silent upgrade will fail due to lack of proper mocks, but we're testing the flow
      const result = await performAutoUpdate()

      // Should attempt silent upgrade (which will fail in this test environment)
      expect(result.success).toBe(false)
      expect(result.shouldRetryWithPackageManager).toBe(true)
    })

    it('should use package manager when usePackageManager is true', async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'success', '')
        }
        return {} as any
      })

      const result = await performAutoUpdate(true, false)

      expect(result.success).toBe(true)
      expect(result.method).toBe('package-manager')
      expect(result.usedSudo).toBe(false)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('start-claude@latest'),
        { timeout: 60000 },
        expect.any(Function),
      )
    })

    it('should use package manager with sudo when requested', async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'success', '')
        }
        return {} as any
      })

      const result = await performAutoUpdate(true, true)

      expect(result.success).toBe(true)
      expect(result.method).toBe('package-manager')
      expect(result.usedSudo).toBe(true)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('sudo'),
        { timeout: 60000 },
        expect.any(Function),
      )
    })

    it('should return shouldRetryWithPackageManager on permission error (macOS)', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      })

      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('EACCES: permission denied'), '', '')
        }
        return {} as any
      })

      const result = await performAutoUpdate(true, false)

      expect(result.success).toBe(false)
      expect(result.shouldRetryWithPackageManager).toBe(true)
      expect(result.error).toContain('EACCES')
    })
  })

  describe('performBackgroundUpgrade', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should not start if already running', async () => {
      mockInstance.get.mockReturnValue(true) // Background upgrade already running

      await performBackgroundUpgrade()

      expect(mockInstance.set).not.toHaveBeenCalled()
    })

    it('should set running flag and schedule upgrade', async () => {
      mockInstance.get.mockReturnValue(null) // Not running

      await performBackgroundUpgrade()

      expect(mockInstance.set).toHaveBeenCalledWith('upgrade.backgroundRunning', true, 300000)
    })
  })

  describe('checkBackgroundUpgradeResult', () => {
    it('should return null if no result exists', () => {
      mockInstance.get.mockReturnValue(null)

      const result = checkBackgroundUpgradeResult()

      expect(result).toBeNull()
    })

    it('should return result and clear it from cache', () => {
      const mockResult = {
        success: true,
        method: 'silent-upgrade',
        timestamp: Date.now(),
      }
      mockInstance.get.mockImplementation((key: string) => {
        if (key === 'upgrade.backgroundResult')
          return mockResult
        if (key === 'updateCheck.lastVersion')
          return '1.0.1'
        return null
      })

      const result = checkBackgroundUpgradeResult()

      expect(result).toEqual({
        result: mockResult,
        latestVersion: '1.0.1',
      })
      expect(mockInstance.delete).toHaveBeenCalledWith('upgrade.backgroundResult')
    })
  })

  describe('relaunchCLI', () => {
    it('should spawn new process with same arguments and exit', () => {
      const mockChild = {
        unref: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild as any)

      // Mock process.exit for this test only
      // eslint-disable-next-line ts/unbound-method
      const originalExit = process.exit
      const mockExit = vi.fn()
      // @ts-expect-error - Mocking process.exit for testing
      process.exit = mockExit

      try {
        relaunchCLI()

        expect(mockSpawn).toHaveBeenCalledWith(
          'node',
          [process.argv[1], '--config', 'test'],
          {
            detached: true,
            stdio: 'inherit',
          },
        )
        expect(mockChild.unref).toHaveBeenCalled()
        expect(mockExit).toHaveBeenCalledWith(0)
      }
      finally {
        // Restore original process.exit
        process.exit = originalExit
      }
    })
  })
})
