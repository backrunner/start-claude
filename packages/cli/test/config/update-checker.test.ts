import * as childProcess from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../../../../package.json'
import { checkForUpdates, performAutoUpdate, relaunchCLI } from '../../src/utils/config/update-checker'

// Get the actual version from package.json
const CURRENT_VERSION = packageJson.version

// Mock child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}))

// Mock the entire cache-manager module
const mockInstance = {
  shouldCheckForUpdates: vi.fn(),
  setUpdateCheckTimestamp: vi.fn(),
  getUpdateCheckTimestamp: vi.fn(),
  clear: vi.fn(),
}

vi.mock('../../src/utils/config/cache-manager', () => ({
  CacheManager: {
    getInstance: vi.fn(() => mockInstance),
  },
}))

const mockExec = vi.mocked(childProcess.exec)
const mockSpawn = vi.mocked(childProcess.spawn)

describe('updateChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock process.argv
    Object.defineProperty(process, 'argv', {
      value: ['node', '/path/to/cli.js', '--config', 'test'],
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkForUpdates', () => {
    it('should return null when rate limited and not forced', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(false)

      const result = await checkForUpdates(false)
      expect(result).toBeNull()
      expect(mockExec).not.toHaveBeenCalled()
    })

    it('should check for updates when never checked before', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(true)

      // Mock successful pnpm command
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, '1.0.1\n', '')
        }
        return {} as any
      })

      const result = await checkForUpdates(false)

      expect(result).toEqual({
        currentVersion: CURRENT_VERSION,
        latestVersion: '1.0.1',
        hasUpdate: true,
        updateCommand: 'pnpm add -g start-claude@latest',
      })
      expect(mockExec).toHaveBeenCalledWith(
        'pnpm view start-claude version',
        { timeout: 5000 },
        expect.any(Function),
      )
    })

    it('should check for updates when forced', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(false)

      // Mock successful pnpm command that returns the same version
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, `${CURRENT_VERSION}\n`, '')
        }
        return {} as any
      })

      const result = await checkForUpdates(true)

      expect(result).toEqual({
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        hasUpdate: false,
        updateCommand: 'pnpm add -g start-claude@latest',
      })
    })

    it('should return null on network error', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(true)

      // Mock failed pnpm command
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('Network error'), '', '')
        }
        return {} as any
      })

      const result = await checkForUpdates(false)
      expect(result).toBeNull()
    })

    it('should save timestamp after successful check', async () => {
      mockInstance.shouldCheckForUpdates.mockReturnValue(true)

      // Mock successful pnpm command
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, '1.0.1\n', '')
        }
        return {} as any
      })

      await checkForUpdates(false)

      expect(mockInstance.setUpdateCheckTimestamp).toHaveBeenCalledWith(expect.any(Number), CURRENT_VERSION)
    })
  })

  describe('performAutoUpdate', () => {
    it('should return success true on successful update', async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'success', '')
        }
        return {} as any
      })

      const result = await performAutoUpdate()
      expect(result).toEqual({ success: true })
      expect(mockExec).toHaveBeenCalledWith(
        'pnpm add -g start-claude@latest',
        { timeout: 30000 },
        expect.any(Function),
      )
    })

    it('should return success false with error message on update failure with error in stderr', async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, '', 'error: failed to install')
        }
        return {} as any
      })

      const result = await performAutoUpdate()
      expect(result).toEqual({ success: false, error: 'error: failed to install' })
    })

    it('should return success false with error message on command execution error', async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('Command failed'), '', '')
        }
        return {} as any
      })

      const result = await performAutoUpdate()
      expect(result).toEqual({ success: false, error: 'Command failed' })
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
