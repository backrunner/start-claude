import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the file system operations
vi.mock('node:fs')
vi.mock('node:os', () => ({
  homedir: vi.fn().mockReturnValue('/home/user'),
}))
vi.mock('node:process', () => ({
  env: {
    SHELL: '/bin/zsh',
  },
  platform: 'linux',
}))

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockProcess = vi.mocked(process)

describe('overrideManager', () => {
  let OverrideManager: typeof import('../src/cli/override').OverrideManager
  let overrideManager: import('../src/cli/override').OverrideManager
  let expectedZshPath: string

  beforeEach(async () => {
    const homeDir = '/home/user'
    expectedZshPath = path.join(homeDir, '.zshrc')

    mockOs.homedir.mockReturnValue(homeDir)
    mockProcess.env = { SHELL: '/bin/zsh', NODE_ENV: 'test', PATH: '/usr/local/bin:/usr/bin:/bin' }
    ;(mockProcess as any).platform = 'linux'
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('')
    mockFs.writeFileSync.mockImplementation(() => undefined)
    mockFs.mkdirSync.mockImplementation(() => undefined)
    mockFs.unlinkSync.mockImplementation(() => undefined)
    mockFs.rmSync.mockImplementation(() => undefined)
    mockFs.chmodSync.mockImplementation(() => undefined)

    // Import OverrideManager after mocks are set up
    const overrideModule = await import('../src/cli/override')
    OverrideManager = overrideModule.OverrideManager
    overrideManager = new OverrideManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('unix systems', () => {
    beforeEach(() => {
      ;(mockProcess as any).platform = 'linux'
    })

    describe('isOverrideActive', () => {
      it('should return true when script exists', () => {
        mockFs.existsSync.mockImplementation(path =>
          path.toString().includes('.start-claude/bin/claude'),
        )
        mockFs.readFileSync.mockReturnValue('# no alias')

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(true)
      })

      it('should return true when PATH export exists in shell config', () => {
        mockFs.existsSync.mockImplementation(path =>
          !path.toString().includes('.start-claude/bin/claude'),
        )
        mockFs.readFileSync.mockReturnValue('export PATH="$HOME/.start-claude/bin:$PATH"')

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(true)
      })

      it('should return true when alias exists in shell config', () => {
        mockFs.existsSync.mockImplementation(path =>
          !path.toString().includes('.start-claude/bin/claude'),
        )
        mockFs.readFileSync.mockReturnValue('alias claude="start-claude"')

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(true)
      })

      it('should return false when neither script nor aliases exist', () => {
        mockFs.existsSync.mockImplementation(path =>
          !path.toString().includes('.start-claude/bin/claude'),
        )
        mockFs.readFileSync.mockReturnValue('# some other content')

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(false)
      })

      it('should return false when shell config file and script do not exist', () => {
        mockFs.existsSync.mockReturnValue(false)

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(false)
      })

      it('should return false when shell is not supported', () => {
        mockProcess.env = { SHELL: '/bin/unknown', NODE_ENV: 'test' }

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(false)
      })

      it('should handle read errors gracefully but still check script', () => {
        mockFs.existsSync.mockImplementation(path =>
          path.toString().includes('.start-claude/bin/claude'),
        )
        mockFs.readFileSync.mockImplementation(() => {
          throw new Error('Read error')
        })

        const result = overrideManager.isOverrideActive()

        expect(result).toBe(true)
      })
    })

    describe('enableOverride', () => {
      it('should create script and add both PATH export and alias to shell config', () => {
        mockFs.readFileSync.mockReturnValue('# existing content')

        const result = overrideManager.enableOverride()

        expect(result).toBe(true)
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expect.stringContaining('.start-claude/bin/claude'),
          expect.stringContaining('exec start-claude "$@"'),
          'utf-8',
        )
        expect(mockFs.chmodSync).toHaveBeenCalledWith(
          expect.stringContaining('.start-claude/bin/claude'),
          0o755,
        )
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expectedZshPath,
          expect.stringContaining('export PATH="$HOME/.start-claude/bin:$PATH"'),
          'utf-8',
        )
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expectedZshPath,
          expect.stringContaining('alias claude="start-claude"'),
          'utf-8',
        )
      })

      it('should still create script and update RC file even when alias exists', () => {
        mockFs.readFileSync.mockReturnValue('alias claude="start-claude"')

        const result = overrideManager.enableOverride()

        expect(result).toBe(true)
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expect.stringContaining('.start-claude/bin/claude'),
          expect.stringContaining('exec start-claude "$@"'),
          'utf-8',
        )
      })

      it('should create config file if it does not exist', () => {
        mockFs.existsSync.mockReturnValue(false)

        const result = overrideManager.enableOverride()

        expect(result).toBe(true)
        expect(mockFs.writeFileSync).toHaveBeenCalled()
      })

      it('should return false when shell is not supported', () => {
        mockProcess.env = { SHELL: '/bin/unknown', NODE_ENV: 'test' }

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
      it('should remove script directory and clean shell config', () => {
        mockFs.readFileSync.mockReturnValue(`# start-claude override
export PATH="$HOME/.start-claude/bin:$PATH"
alias claude="start-claude"
# other content`)

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toContain('export PATH=')
        expect(result.cleanupCommand).not.toContain('.start-claude/bin')
        expect(mockFs.rmSync).toHaveBeenCalledWith(
          expect.stringContaining('.start-claude/bin'),
          { recursive: true, force: true },
        )
        const writtenContent = mockFs.writeFileSync.mock.calls.find(call =>
          call[0] === expectedZshPath,
        )?.[1] as string
        expect(writtenContent).not.toContain('claude')
        expect(writtenContent).not.toContain('.start-claude')
        expect(writtenContent).toContain('# other content')
      })

      it('should return cleanup command for bash shell', () => {
        mockProcess.env = { SHELL: '/bin/bash', NODE_ENV: 'test' }
        mockFs.readFileSync.mockReturnValue('# content')

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toMatch(/^export PATH=".*"$/)
        expect(result.cleanupCommand).not.toContain('.start-claude/bin')
      })

      it('should return cleanup command for fish shell', () => {
        mockProcess.env = { SHELL: '/usr/local/bin/fish', NODE_ENV: 'test' }
        mockFs.readFileSync.mockReturnValue('# content')

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toMatch(/^set -x PATH .*/)
        expect(result.cleanupCommand).not.toContain('.start-claude/bin')
      })

      it('should not return cleanup command on Windows', () => {
        ;(mockProcess as any).platform = 'win32'
        mockProcess.env = { PSModulePath: 'C:\\Program Files\\PowerShell\\Modules', NODE_ENV: 'test' }

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toBeUndefined()
      })

      it('should handle cleanup command generation errors gracefully', () => {
        // Mock a scenario where PATH cleanup fails
        const originalEnv = mockProcess.env
        mockProcess.env = { ...originalEnv, PATH: undefined }

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toBe('export PATH=""')
      })

      it('should return true when config file does not exist', () => {
        mockFs.existsSync.mockReturnValue(false)

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toContain('export PATH=')
      })

      it('should return false when shell is not supported', () => {
        mockProcess.env = { SHELL: '/bin/unknown', NODE_ENV: 'test' }

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(false)
        expect(result.cleanupCommand).toBeUndefined()
      })

      it('should handle write errors gracefully', () => {
        mockFs.writeFileSync.mockImplementation(() => {
          throw new Error('Write error')
        })

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(false)
        expect(result.cleanupCommand).toBeUndefined()
      })

      it('should properly filter override path from complex PATH', () => {
        const complexPath = '/usr/local/bin:/home/user/.start-claude/bin:/usr/bin:/bin:/usr/sbin:/sbin'
        mockProcess.env = { ...mockProcess.env, PATH: complexPath }

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toBe('export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"')
      })

      it('should handle PATH with no override path', () => {
        const cleanPath = '/usr/local/bin:/usr/bin:/bin'
        mockProcess.env = { ...mockProcess.env, PATH: cleanPath }

        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toBe(`export PATH="${cleanPath}"`)
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
        mockProcess.env = { NODE_ENV: 'test' }

        const result = overrideManager.getShellInfo()

        expect(result.shell).toBe(null)
        expect(result.platform).toBe('unix')
      })

      it('should prefer zsh config if available', () => {
        mockProcess.env = { SHELL: '/bin/zsh', NODE_ENV: 'test' }

        const result = overrideManager.getShellInfo()

        expect(result.shell).toBe('zsh')
        expect(result.configFile).toBe(expectedZshPath)
      })

      it('should fall back to bash if zsh config does not exist', () => {
        mockProcess.env = { SHELL: '/bin/bash', NODE_ENV: 'test' }

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
        mockProcess.env = { PSModulePath: 'C:\\Program Files\\PowerShell\\Modules', NODE_ENV: 'test' }
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
        mockProcess.env = { COMSPEC: 'C:\\Windows\\System32\\cmd.exe', NODE_ENV: 'test' }
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

      it('should delete script directory when disabling', () => {
        const result = overrideManager.disableOverride()

        expect(result.success).toBe(true)
        expect(result.cleanupCommand).toBeUndefined()
        expect(mockFs.rmSync).toHaveBeenCalledWith(
          expect.stringContaining('.start-claude/bin'),
          { recursive: true, force: true },
        )
      })
    })

    describe('git Bash', () => {
      beforeEach(() => {
        mockProcess.env = { SHELL: '/usr/bin/bash', NODE_ENV: 'test' }
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
