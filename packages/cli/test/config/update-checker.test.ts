import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as https from 'node:https'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../../../../package.json'
import { BACKGROUND_UPGRADE_ARG, BACKGROUND_UPGRADE_ENV, checkBackgroundUpgradeResult, checkForUpdates, isBackgroundUpgradeProcess, performAutoUpdate, performBackgroundUpgrade, relaunchCLI, safeCopy } from '../../src/utils/config/update-checker'

// Get the actual version from package.json
const CURRENT_VERSION = packageJson.version
const ORIGINAL_ARGV = process.argv
const ORIGINAL_EXEC_ARGV = process.execArgv
const ORIGINAL_PLATFORM = process.platform

// Mock child_process
vi.mock('node:child_process', () => ({
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
  cpSync: vi.fn(),
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
  getClaudeInstallMethod: vi.fn(),
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

const mockExecSync = vi.mocked(childProcess.execSync)
const mockAccessSync = vi.mocked(fs.accessSync)
const mockCpSync = vi.mocked(fs.cpSync)
const mockSpawn = vi.mocked(childProcess.spawn)
const mockHttpsGet = vi.mocked(https.default.get)

function mockSpawnResult(code = 0, stdout = '', stderr = ''): { once: ReturnType<typeof vi.fn>, unref: ReturnType<typeof vi.fn> } {
  const child = {
    stdout: {
      on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data' && stdout) {
          handler(Buffer.from(stdout))
        }
        return child.stdout
      }),
    },
    stderr: {
      on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data' && stderr) {
          handler(Buffer.from(stderr))
        }
        return child.stderr
      }),
    },
    once: vi.fn((event: string, handler: (value?: any) => void) => {
      if (event === 'close') {
        queueMicrotask(() => handler(code))
      }
      return child
    }),
    kill: vi.fn(),
    unref: vi.fn(),
  }

  mockSpawn.mockReturnValue(child as any)
  return child
}

describe('updateChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock process.argv
    Object.defineProperty(process, 'argv', {
      value: ['node', '/path/to/cli.js', '--config', 'test'],
      writable: true,
    })
    Object.defineProperty(process, 'execArgv', {
      value: [],
      writable: true,
    })
    Object.defineProperty(process, 'platform', {
      value: ORIGINAL_PLATFORM,
      writable: true,
      configurable: true,
    })

    // Default cache behavior
    mockInstance.get.mockReturnValue(null)
    mockInstance.getClaudeInstallMethod.mockReturnValue(null)
    mockInstance.shouldCheckForUpdates.mockReturnValue(true)

    mockSpawnResult()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(process, 'argv', {
      value: ORIGINAL_ARGV,
      writable: true,
    })
    Object.defineProperty(process, 'execArgv', {
      value: ORIGINAL_EXEC_ARGV,
      writable: true,
    })
    Object.defineProperty(process, 'platform', {
      value: ORIGINAL_PLATFORM,
      writable: true,
      configurable: true,
    })
    delete process.env[BACKGROUND_UPGRADE_ENV]
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

      expect(mockInstance.setUpdateCheckTimestamp).toHaveBeenCalledWith(expect.any(Number), '1.0.1')
    })
  })

  describe('safeCopy', () => {
    it('should copy directories with fs.cpSync instead of shell wildcards', () => {
      const sourcePath = '/tmp/start-claude source'
      const destPath = '/tmp/start-claude dest'

      const result = safeCopy(sourcePath, destPath)

      expect(result).toEqual({ success: true })
      expect(mockCpSync).toHaveBeenCalledWith(
        path.normalize(sourcePath),
        path.normalize(destPath),
        {
          recursive: true,
          force: true,
        },
      )
      expect(mockExecSync).not.toHaveBeenCalled()
    })

    it('should return a failed result when directory copy fails', () => {
      mockCpSync.mockImplementationOnce(() => {
        throw new Error('copy failed')
      })

      const result = safeCopy('/tmp/source', '/tmp/dest')

      expect(result).toEqual({
        success: false,
        error: 'copy failed',
      })
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
      mockSpawnResult(0, 'success', '')

      const result = await performAutoUpdate(true, false)

      expect(result.success).toBe(true)
      expect(result.method).toBe('package-manager')
      expect(result.usedSudo).toBe(false)
      expect(mockSpawn).toHaveBeenCalledWith(
        'pnpm',
        ['add', '-g', 'start-claude@latest'],
        expect.objectContaining({
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      )
    })

    it('should use package manager with sudo when requested', async () => {
      mockSpawnResult(0, 'success', '')

      const result = await performAutoUpdate(true, true)

      expect(result.success).toBe(true)
      expect(result.method).toBe('package-manager')
      expect(result.usedSudo).toBe(true)
      expect(mockSpawn).toHaveBeenCalledWith(
        'sudo',
        ['pnpm', 'add', '-g', 'start-claude@latest'],
        expect.objectContaining({
          shell: false,
          stdio: 'inherit',
        }),
      )
    })

    it('should return shouldRetryWithPackageManager on permission error (macOS)', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      })

      mockSpawnResult(1, '', 'EACCES: permission denied')

      const result = await performAutoUpdate(true, false)

      expect(result.success).toBe(false)
      expect(result.shouldRetryWithPackageManager).toBe(true)
      expect(result.error).toContain('EACCES')
    })

    it('should allow package manager retry on Unix permission errors', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      })

      mockSpawnResult(1, '', 'EACCES: permission denied')

      const result = await performAutoUpdate(true, false)

      expect(result.success).toBe(false)
      expect(result.shouldRetryWithPackageManager).toBe(true)
    })

    it('should not suggest sudo retry on Windows permission errors', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      })

      mockSpawnResult(1, '', 'EPERM: operation not permitted')

      const result = await performAutoUpdate(true, false)

      expect(result.success).toBe(false)
      expect(result.shouldRetryWithPackageManager).toBe(false)
    })
  })

  describe('performBackgroundUpgrade', () => {
    it('should not start if already running', async () => {
      mockInstance.get.mockReturnValue(true) // Background upgrade already running

      await performBackgroundUpgrade()

      expect(mockInstance.set).not.toHaveBeenCalled()
      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('should set running flag and spawn a detached worker process', async () => {
      mockInstance.get.mockReturnValue(null) // Not running

      await performBackgroundUpgrade()

      expect(mockInstance.set).toHaveBeenCalledWith('upgrade.backgroundRunning', true, 300000)
      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        ['/path/to/cli.js', BACKGROUND_UPGRADE_ARG],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          shell: false,
          windowsHide: true,
          env: expect.objectContaining({
            [BACKGROUND_UPGRADE_ENV]: '1',
          }),
        }),
      )
      expect(mockSpawn.mock.results[0].value.unref).toHaveBeenCalled()
    })

    it('should use shell for detached Windows binary shims', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      })
      Object.defineProperty(process, 'argv', {
        value: ['node', 'C:\\Users\\test\\AppData\\Roaming\\npm\\start-claude.cmd'],
        writable: true,
      })

      await performBackgroundUpgrade()

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('start-claude.cmd'),
        [BACKGROUND_UPGRADE_ARG],
        expect.objectContaining({
          shell: true,
          windowsHide: true,
        }),
      )
    })

    it('should not use the internal module path when the current shim cannot be resolved', async () => {
      Object.defineProperty(process, 'argv', {
        value: ['node', '/missing/start-claude'],
        writable: true,
      })
      mockAccessSync.mockImplementation((filePath) => {
        if (String(filePath) === '/missing/start-claude') {
          throw new Error('missing')
        }
      })

      await performBackgroundUpgrade()

      expect(mockSpawn).toHaveBeenCalledWith(
        'start-claude',
        [BACKGROUND_UPGRADE_ARG],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
        }),
      )
    })
  })

  describe('isBackgroundUpgradeProcess', () => {
    it('should require both the internal arg and environment marker', () => {
      expect(isBackgroundUpgradeProcess()).toBe(false)

      Object.defineProperty(process, 'argv', {
        value: ['node', '/path/to/cli.js', BACKGROUND_UPGRADE_ARG],
        writable: true,
      })
      expect(isBackgroundUpgradeProcess()).toBe(false)

      Object.defineProperty(process, 'argv', {
        value: ['node', '/path/to/cli.js'],
        writable: true,
      })
      process.env[BACKGROUND_UPGRADE_ENV] = '1'
      expect(isBackgroundUpgradeProcess()).toBe(false)

      Object.defineProperty(process, 'argv', {
        value: ['node', '/path/to/cli.js', BACKGROUND_UPGRADE_ARG],
        writable: true,
      })
      expect(isBackgroundUpgradeProcess()).toBe(true)
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
    it('should relaunch local node entry with same arguments and exit', () => {
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
          process.execPath,
          ['/path/to/cli.js', '--config', 'test'],
          {
            detached: true,
            stdio: 'inherit',
            shell: false,
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

    it('should relaunch global binary shim directly', () => {
      const mockChild = {
        unref: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild as any)
      Object.defineProperty(process, 'argv', {
        value: ['node', '/usr/local/bin/start-claude', '--config', 'test'],
        writable: true,
      })

      // eslint-disable-next-line ts/unbound-method
      const originalExit = process.exit
      const mockExit = vi.fn()
      // @ts-expect-error - Mocking process.exit for testing
      process.exit = mockExit

      try {
        relaunchCLI()

        expect(mockSpawn).toHaveBeenCalledWith(
          '/usr/local/bin/start-claude',
          ['--config', 'test'],
          {
            detached: true,
            stdio: 'inherit',
            shell: false,
          },
        )
        expect(mockChild.unref).toHaveBeenCalled()
        expect(mockExit).toHaveBeenCalledWith(0)
      }
      finally {
        process.exit = originalExit
      }
    })
  })
})
