import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the file system operations
vi.mock('node:fs')
vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn().mockReturnValue('/home/user'),
  },
}))
vi.mock('node:process', () => ({
  default: {
    env: {
      SHELL: '/bin/zsh',
    },
  },
}))

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockProcess = vi.mocked(process)

describe('overrideManager', () => {
  let OverrideManager: any
  let overrideManager: any

  beforeEach(async () => {
    mockOs.homedir.mockReturnValue('/home/user')
    mockProcess.env = { SHELL: '/bin/zsh' }
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('')
    mockFs.writeFileSync.mockImplementation(() => undefined)

    // Import OverrideManager after mocks are set up
    const overrideModule = await import('@/override')
    OverrideManager = overrideModule.OverrideManager
    overrideManager = new OverrideManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('isOverrideActive', () => {
    it('should return true when alias exists in shell config', () => {
      const configContent = `
# some config
alias claude="start-claude"
# more config
`
      mockFs.readFileSync.mockReturnValue(configContent)

      const result = overrideManager.isOverrideActive()

      expect(result).toBe(true)
    })

    it('should return false when alias does not exist', () => {
      const configContent = `
# some config
alias other="command"
# more config
`
      mockFs.readFileSync.mockReturnValue(configContent)

      const result = overrideManager.isOverrideActive()

      expect(result).toBe(false)
    })

    it('should return false when shell config file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = overrideManager.isOverrideActive()

      expect(result).toBe(false)
    })

    it('should return false when shell is not supported', () => {
      mockProcess.env = { SHELL: '/bin/unknown' }

      const result = overrideManager.isOverrideActive()

      expect(result).toBe(false)
    })

    it('should handle read errors gracefully', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = overrideManager.isOverrideActive()

      expect(result).toBe(false)
    })
  })

  describe('enableOverride', () => {
    it('should add alias to shell config when not present', () => {
      const existingContent = '# existing config'
      mockFs.readFileSync.mockReturnValue(existingContent)

      const result = overrideManager.enableOverride()

      expect(result).toBe(true)
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/home/user/.zshrc',
        expect.stringContaining('alias claude="start-claude"'),
      )
    })

    it('should return true when alias already exists', () => {
      const existingContent = 'alias claude="start-claude"'
      mockFs.readFileSync.mockReturnValue(existingContent)

      const result = overrideManager.enableOverride()

      expect(result).toBe(true)
      expect(mockFs.writeFileSync).not.toHaveBeenCalled()
    })

    it('should create config file if it does not exist', () => {
      // Mock shell config directory to exist but config file to not exist
      mockFs.existsSync.mockImplementation((filePath) => {
        const pathStr = filePath.toString()
        if (pathStr.endsWith('.zshrc')) {
          return true // Shell script exists
        }
        return false // Config file doesn't exist
      })

      const result = overrideManager.enableOverride()

      expect(result).toBe(true)
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should return false when shell is not supported', () => {
      mockProcess.env = { SHELL: '/bin/unknown' }

      const result = overrideManager.enableOverride()

      expect(result).toBe(false)
    })

    it('should handle write errors gracefully', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = overrideManager.enableOverride()

      expect(result).toBe(false)
    })
  })

  describe('disableOverride', () => {
    it('should remove alias from shell config', () => {
      const contentWithAlias = `
# existing config
# start-claude override
alias claude="start-claude"
# more config
`
      mockFs.readFileSync.mockReturnValue(contentWithAlias)

      const result = overrideManager.disableOverride()

      expect(result).toBe(true)
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/home/user/.zshrc',
        expect.not.stringContaining('alias claude="start-claude"'),
      )
    })

    it('should return true when config file does not exist', () => {
      // Mock shell config directory to exist but config file to not exist
      mockFs.existsSync.mockImplementation((filePath) => {
        const pathStr = filePath.toString()
        if (pathStr.endsWith('.zshrc')) {
          return true // Shell script path exists for getShellConfigFile()
        }
        return false // Actual config file doesn't exist
      })

      const result = overrideManager.disableOverride()

      expect(result).toBe(true)
    })

    it('should return false when shell is not supported', () => {
      mockProcess.env = { SHELL: '/bin/unknown' }

      const result = overrideManager.disableOverride()

      expect(result).toBe(false)
    })

    it('should handle write errors gracefully', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = overrideManager.disableOverride()

      expect(result).toBe(false)
    })
  })

  describe('getShellInfo', () => {
    it('should return shell and config file info', () => {
      const result = overrideManager.getShellInfo()

      expect(result).toEqual({
        shell: 'zsh',
        configFile: '/home/user/.zshrc',
      })
    })

    it('should handle missing SHELL environment variable', () => {
      mockProcess.env = {}

      const result = overrideManager.getShellInfo()

      expect(result.shell).toBeNull()
      expect(result.configFile).toBeNull()
    })

    it('should prefer zsh config if available', () => {
      mockProcess.env = { SHELL: '/bin/zsh' }

      const result = overrideManager.getShellInfo()

      expect(result.shell).toBe('zsh')
      expect(result.configFile).toBe('/home/user/.zshrc')
    })

    it('should fall back to bash if zsh config does not exist', () => {
      mockProcess.env = { SHELL: '/bin/bash' }
      mockFs.existsSync.mockImplementation((path) => {
        return path === '/home/user/.bashrc'
      })

      const result = overrideManager.getShellInfo()

      expect(result.shell).toBe('bash')
      expect(result.configFile).toBe('/home/user/.bashrc')
    })
  })
})
