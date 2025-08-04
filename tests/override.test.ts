import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
    platform: 'linux',
  },
}))

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockProcess = vi.mocked(process)

describe('overrideManager', () => {
  let OverrideManager: any
  let overrideManager: any
  let expectedZshPath: string

  beforeEach(async () => {
    const homeDir = '/home/user'
    expectedZshPath = path.join(homeDir, '.zshrc')

    mockOs.homedir.mockReturnValue(homeDir)
    mockProcess.env = { SHELL: '/bin/zsh' };
    (mockProcess as any).platform = 'linux'
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('')
    mockFs.writeFileSync.mockImplementation(() => undefined)
    mockFs.mkdirSync.mockImplementation(() => undefined)
    mockFs.unlinkSync.mockImplementation(() => undefined)

    // Import OverrideManager after mocks are set up
    const overrideModule = await import('@/cli/override')
    OverrideManager = overrideModule.OverrideManager
    overrideManager = new OverrideManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('unix systems', () => {
    beforeEach(() => {
      (mockProcess as any).platform = 'linux'
    })

    describe('isOverrideActive', () => {
      it('should return true when alias exists in shell config', () => {
        mockFs.readFileSync.mockReturnValue('alias claude="start-claude"')

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(true)
      })

      it('should return false when alias does not exist', () => {
        mockFs.readFileSync.mockReturnValue('# some other content')

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
          throw new Error('Read error')
        })

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(false)
      })
    })

    describe('enableOverride', () => {
      it('should add alias to shell config when not present', () => {
        mockFs.readFileSync.mockReturnValue('# existing content')

        const result = overrideManager.enableOverride()

        expect(result).toBe(true)
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expectedZshPath,
          expect.stringContaining('alias claude="start-claude"'),
          'utf-8',
        )
      })

      it('should return true when alias already exists', () => {
        mockFs.readFileSync.mockReturnValue('alias claude="start-claude"')

        const result = overrideManager.enableOverride()

        expect(result).toBe(true)
      })

      it('should create config file if it does not exist', () => {
        mockFs.existsSync.mockReturnValue(false)

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
          throw new Error('Write error')
        })

        const result = overrideManager.enableOverride()

        expect(result).toBe(false)
      })
    })

    describe('disableOverride', () => {
      it('should remove alias from shell config', () => {
        mockFs.readFileSync.mockReturnValue(`# start-claude override
alias claude="start-claude"
# other content`)

        const result = overrideManager.disableOverride()

        expect(result).toBe(true)
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expectedZshPath,
          expect.not.stringContaining('claude'),
          'utf-8',
        )
      })

      it('should return true when config file does not exist', () => {
        mockFs.existsSync.mockReturnValue(false)

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
          throw new Error('Write error')
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
          configFile: expectedZshPath,
          platform: 'unix',
        })
      })

      it('should handle missing SHELL environment variable', () => {
        mockProcess.env = {}

        const result = overrideManager.getShellInfo()

        expect(result.shell).toBe(null)
        expect(result.platform).toBe('unix')
      })

      it('should prefer zsh config if available', () => {
        mockProcess.env = { SHELL: '/bin/zsh' }

        const result = overrideManager.getShellInfo()

        expect(result.shell).toBe('zsh')
        expect(result.configFile).toBe(expectedZshPath)
      })

      it('should fall back to bash if zsh config does not exist', () => {
        mockProcess.env = { SHELL: '/bin/bash' }

        const result = overrideManager.getShellInfo()

        expect(result.shell).toBe('bash')
      })
    })
  })

  describe('windows systems', () => {
    beforeEach(() => {
      (mockProcess as any).platform = 'win32'
      mockOs.homedir.mockReturnValue('C:\\Users\\user')
    })

    describe('powerShell', () => {
      beforeEach(() => {
        mockProcess.env = { PSModulePath: 'C:\\Program Files\\PowerShell\\Modules' }
      })

      it('should detect PowerShell correctly', () => {
        const result = overrideManager.getShellInfo()

        expect(result.shell).toBe('powershell')
        expect(result.platform).toBe('windows')
        expect(result.instructions).toContain('execution policy')
      })

      it('should enable PowerShell alias', () => {
        const result = overrideManager.enableOverride()

        expect(result).toBe(true)
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expect.stringContaining('Microsoft.PowerShell_profile.ps1'),
          expect.stringContaining('Set-Alias -Name claude -Value start-claude'),
          'utf-8',
        )
      })

      it('should create PowerShell profile directory if needed', () => {
        mockFs.existsSync.mockReturnValue(false)

        overrideManager.enableOverride()

        expect(mockFs.mkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('PowerShell'),
          { recursive: true },
        )
      })
    })

    describe('command Prompt', () => {
      beforeEach(() => {
        mockProcess.env = { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' }
      })

      it('should detect CMD correctly', () => {
        const result = overrideManager.getShellInfo()

        expect(result.shell).toBe('cmd')
        expect(result.platform).toBe('windows')
        expect(result.instructions).toContain('PATH')
      })

      it('should create batch file for CMD', () => {
        const result = overrideManager.enableOverride()

        expect(result).toBe(true)
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expect.stringContaining('claude-alias.bat'),
          expect.stringContaining('start-claude %*'),
          'utf-8',
        )
      })

      it('should delete batch file when disabling', () => {
        overrideManager.disableOverride()

        expect(mockFs.unlinkSync).toHaveBeenCalledWith(
          expect.stringContaining('claude-alias.bat'),
        )
      })
    })

    describe('git Bash', () => {
      beforeEach(() => {
        mockProcess.env = { SHELL: '/usr/bin/bash' }
      })

      it('should detect Git Bash correctly', () => {
        const result = overrideManager.getShellInfo()

        expect(result.shell).toBe('git-bash')
        expect(result.platform).toBe('windows')
      })
    })
  })

  describe('getSupportedShells', () => {
    it('should return Windows shells on Windows', () => {
      (mockProcess as any).platform = 'win32'

      const result = overrideManager.getSupportedShells()

      expect(result).toContain('powershell')
      expect(result).toContain('cmd')
      expect(result).toContain('git-bash')
    })

    it('should return Unix shells on Unix systems', () => {
      (mockProcess as any).platform = 'linux'

      const result = overrideManager.getSupportedShells()

      expect(result).toContain('bash')
      expect(result).toContain('zsh')
      expect(result).toContain('fish')
    })
  })
})
