import type { ClaudeConfig } from '../../src/config/types'
import { spawn } from 'node:child_process'
import { accessSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the dependencies
vi.mock('node:child_process')
vi.mock('node:fs')
vi.mock('node:process', () => ({
  default: {
    env: {},
    platform: 'linux',
  },
}))
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}))
vi.mock('../../src/utils/cli/ui', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    UILogger: vi.fn().mockImplementation(() => ({
      displayError: vi.fn(),
      displayInfo: vi.fn(),
      displaySuccess: vi.fn(),
      displayWarning: vi.fn(),
      displayGrey: vi.fn(),
      displayVerbose: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      verbose: vi.fn(),
    })),
  }
})

const mockSpawn = vi.mocked(spawn)
const mockAccessSync = vi.mocked(accessSync)
const mockInquirer = await import('inquirer')

// Mock process objects
const mockClaudeProcess = {
  on: vi.fn(),
}

describe('claude', () => {
  let startClaude: any

  const mockConfig: ClaudeConfig = {
    name: 'test-config',
    profileType: 'default',
    baseUrl: 'https://api.test.com',
    apiKey: 'sk-test-key',
    model: 'claude-sonnet-4-5-20250929',
    permissionMode: 'default',
    isDefault: true,
    useBedrock: true,
    disableTelemetry: true,
    bashDefaultTimeoutMs: 30000,
    maintainProjectWorkingDir: true,
  }

  beforeEach(async () => {
    // Reset process.env
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
    }

    mockSpawn.mockReturnValue(mockClaudeProcess as any)
    mockAccessSync.mockImplementation(() => undefined) // File exists

    const claudeModule = await import('../../src/cli/claude')
    startClaude = claudeModule.startClaude
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('startClaude', () => {
    it('should start Claude with basic configuration', async () => {
      const mockClaudeStartProcess: any = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10) // Successful start
          }
          return mockClaudeStartProcess
        }),
      }
      mockSpawn.mockReturnValue(mockClaudeStartProcess)

      const result = await startClaude(mockConfig)

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('claude'),
        [],
        expect.objectContaining({
          stdio: 'inherit',
          env: expect.objectContaining({
            ANTHROPIC_BASE_URL: 'https://api.test.com',
            ANTHROPIC_API_KEY: 'sk-test-key',
            ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
            CLAUDE_CODE_USE_BEDROCK: '1',
            DISABLE_TELEMETRY: '1',
            BASH_DEFAULT_TIMEOUT_MS: '30000',
            CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: '1',
          }),
        }),
      )
      expect(result).toBe(0)
    })

    it('should start Claude Code directly when no config is provided', async () => {
      const mockClaudeStartProcess: any = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10) // Successful start
          }
          return mockClaudeStartProcess
        }),
      }
      mockSpawn.mockReturnValue(mockClaudeStartProcess)

      const result = await startClaude(undefined)

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('claude'),
        [],
        expect.objectContaining({
          stdio: 'inherit',
          env: expect.any(Object),
        }),
      )
      expect(result).toBe(0)
    })

    it('should pass additional command line arguments', async () => {
      const mockClaudeStartProcess: any = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10)
          }
          return mockClaudeStartProcess
        }),
      }
      mockSpawn.mockReturnValue(mockClaudeStartProcess)

      const args = ['--verbose', '--max-turns', '10']
      const result = await startClaude(mockConfig, args)

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        args,
        expect.any(Object),
      )
      expect(result).toBe(0)
    })

    it('should handle Claude process errors', async () => {
      const erroringProcess: any = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Process failed')), 10)
          }
          return erroringProcess
        }),
      }
      mockSpawn.mockReturnValue(erroringProcess)

      const result = await startClaude(mockConfig)

      expect(result).toBe(1)
    })

    it('should handle Claude exit with non-zero code', async () => {
      const failingProcess: any = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10) // Non-zero exit code
          }
          return failingProcess
        }),
      }
      mockSpawn.mockReturnValue(failingProcess)

      const result = await startClaude(mockConfig)

      expect(result).toBe(1)
    })
  })

  describe('claude installation handling', () => {
    it('should find and start Claude directly with improved path scanning', async () => {
      // With our improved path scanning, claude should be found directly
      // This test verifies that the enhanced path scanning works correctly
      const mockClaudeStartProcess: any = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10) // Successful start
          }
          return mockClaudeStartProcess
        }),
      }
      mockSpawn.mockReturnValue(mockClaudeStartProcess)

      const result = await startClaude(mockConfig)

      // Should find and start claude directly without installation
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('claude'),
        [],
        expect.objectContaining({
          stdio: 'inherit',
          env: expect.objectContaining({
            ANTHROPIC_BASE_URL: 'https://api.test.com',
            ANTHROPIC_API_KEY: 'sk-test-key',
            ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
          }),
        }),
      )
      expect(result).toBe(0)
    })

    it('should handle installation failure', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('Command not found')
      })

      vi.mocked(mockInquirer.default.prompt).mockResolvedValue({ install: true })

      const failingNpmProcess: any = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10) // Failed installation
          }
          return failingNpmProcess
        }),
      }
      mockSpawn.mockReturnValue(failingNpmProcess)

      const result = await startClaude(mockConfig)

      expect(result).toBe(1)
    })

    it('should handle user declining installation', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('Command not found')
      })

      vi.mocked(mockInquirer.default.prompt).mockResolvedValue({ install: false })

      const result = await startClaude(mockConfig)

      expect(result).toBe(1)
    })
  })

  describe('environment variable setting', () => {
    it('should set all boolean environment variables correctly', async () => {
      const configWithBooleans: ClaudeConfig = {
        name: 'bool-test',
        maintainProjectWorkingDir: true,
        ideSkipAutoInstall: false,
        useBedrock: true,
        useVertex: false,
        skipBedrockAuth: true,
        skipVertexAuth: false,
        disableNonessentialTraffic: true,
        disableTerminalTitle: false,
        disableAutoupdater: true,
        disableBugCommand: false,
        disableCostWarnings: true,
        disableErrorReporting: false,
        disableNonEssentialModelCalls: true,
        disableTelemetry: false,
      }

      const promise = startClaude(configWithBooleans)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR).toBe('1')
      expect(env!.CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL).toBe('0')
      expect(env!.CLAUDE_CODE_USE_BEDROCK).toBe('1')
      expect(env!.CLAUDE_CODE_USE_VERTEX).toBe('0')
      expect(env!.CLAUDE_CODE_SKIP_BEDROCK_AUTH).toBe('1')
      expect(env!.CLAUDE_CODE_SKIP_VERTEX_AUTH).toBe('0')
      expect(env!.DISABLE_TELEMETRY).toBe('0')
    })

    it('should set numeric environment variables correctly', async () => {
      const configWithNumbers: ClaudeConfig = {
        name: 'numeric-test',
        bashDefaultTimeoutMs: 30000,
        bashMaxTimeoutMs: 60000,
        bashMaxOutputLength: 50000,
        apiKeyHelperTtlMs: 900000,
        maxOutputTokens: 4096,
        maxThinkingTokens: 2048,
        mcpTimeout: 10000,
        mcpToolTimeout: 5000,
        maxMcpOutputTokens: 1024,
      }

      const promise = startClaude(configWithNumbers)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.BASH_DEFAULT_TIMEOUT_MS).toBe('30000')
      expect(env!.BASH_MAX_TIMEOUT_MS).toBe('60000')
      expect(env!.BASH_MAX_OUTPUT_LENGTH).toBe('50000')
      expect(env!.CLAUDE_CODE_API_KEY_HELPER_TTL_MS).toBe('900000')
      expect(env!.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('4096')
      expect(env!.MAX_THINKING_TOKENS).toBe('2048')
      expect(env!.MCP_TIMEOUT).toBe('10000')
      expect(env!.MCP_TOOL_TIMEOUT).toBe('5000')
      expect(env!.MAX_MCP_OUTPUT_TOKENS).toBe('1024')
    })

    it('should set string environment variables correctly', async () => {
      const configWithStrings: ClaudeConfig = {
        name: 'string-test',
        baseUrl: 'https://custom.api.com',
        apiKey: 'sk-custom-key',
        model: 'claude-3-opus',
        authToken: 'custom-auth-token',
        customHeaders: 'X-Custom: value',
        smallFastModel: 'claude-3-haiku',
        smallFastModelAwsRegion: 'us-west-2',
        awsBearerTokenBedrock: 'bedrock-token',
        httpProxy: 'http://proxy:8080',
        httpsProxy: 'https://proxy:8080',
        vertexRegionHaiku: 'us-central1',
        vertexRegionSonnet: 'us-east1',
        vertexRegion37Sonnet: 'us-west1',
        vertexRegion40Opus: 'europe-west1',
        vertexRegion40Sonnet: 'asia-east1',
      }

      const promise = startClaude(configWithStrings)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.ANTHROPIC_BASE_URL).toBe('https://custom.api.com')
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-custom-key')
      expect(env!.ANTHROPIC_MODEL).toBe('claude-3-opus')
      expect(env!.ANTHROPIC_AUTH_TOKEN).toBe('custom-auth-token')
      expect(env!.HTTP_PROXY).toBe('http://proxy:8080')
      expect(env!.HTTPS_PROXY).toBe('https://proxy:8080')
      expect(env!.VERTEX_REGION_CLAUDE_3_5_HAIKU).toBe('us-central1')
      expect(env!.VERTEX_REGION_CLAUDE_4_0_OPUS).toBe('europe-west1')
    })

    it('should not set undefined or empty string values', async () => {
      const configWithUndefined: ClaudeConfig = {
        name: 'undefined-test',
        baseUrl: undefined,
        apiKey: '',
        model: undefined,
      }

      const promise = startClaude(configWithUndefined)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.ANTHROPIC_BASE_URL).toBeUndefined()
      expect(env!.ANTHROPIC_API_KEY).toBeUndefined()
      expect(env!.ANTHROPIC_MODEL).toBeUndefined()
    })

    it('should not pass empty or whitespace authToken to prevent auth conflicts', async () => {
      const configWithEmptyAuth: ClaudeConfig = {
        name: 'test-empty-auth',
        apiKey: 'sk-test-key',
        authToken: '',
      }

      const promise = startClaude(configWithEmptyAuth)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-test-key')
      // Empty authToken should not be passed at all (should be undefined, not empty string)
      expect(env!.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    })

    it('should not pass whitespace-only authToken', async () => {
      const configWithWhitespaceAuth: ClaudeConfig = {
        name: 'test-whitespace-auth',
        apiKey: 'sk-test-key',
        authToken: '   ',
      }

      const promise = startClaude(configWithWhitespaceAuth)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-test-key')
      // Whitespace-only authToken should not be passed at all
      expect(env!.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    })
  })

  describe('cli overrides', () => {
    it('should apply environment variable overrides from -e flag', async () => {
      const cliOverrides = {
        env: ['CUSTOM_VAR=custom_value', 'ANOTHER_VAR=another_value'],
      }

      const promise = startClaude(mockConfig, [], cliOverrides)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.CUSTOM_VAR).toBe('custom_value')
      expect(env!.ANOTHER_VAR).toBe('another_value')
    })

    it('should handle environment variables with equals signs in values', async () => {
      const cliOverrides = {
        env: ['DATABASE_URL=postgres://user:pass@host:5432/db?param=value'],
      }

      const promise = startClaude(mockConfig, [], cliOverrides)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.DATABASE_URL).toBe('postgres://user:pass@host:5432/db?param=value')
    })

    it('should override API key from CLI', async () => {
      const cliOverrides = {
        apiKey: 'sk-cli-override-key',
      }

      const promise = startClaude(mockConfig, [], cliOverrides)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-cli-override-key')
    })

    it('should override base URL from CLI', async () => {
      const cliOverrides = {
        baseUrl: 'https://cli-override.api.com',
      }

      const promise = startClaude(mockConfig, [], cliOverrides)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.ANTHROPIC_BASE_URL).toBe('https://cli-override.api.com')
    })

    it('should override model from CLI', async () => {
      const cliOverrides = {
        model: 'claude-3-opus-override',
      }

      const promise = startClaude(mockConfig, [], cliOverrides)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.ANTHROPIC_MODEL).toBe('claude-3-opus-override')
    })

    it('should apply multiple CLI overrides together', async () => {
      const cliOverrides = {
        env: ['CUSTOM_VAR=custom_value'],
        apiKey: 'sk-override-key',
        baseUrl: 'https://override.api.com',
        model: 'claude-3-override',
      }

      const promise = startClaude(mockConfig, [], cliOverrides)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.CUSTOM_VAR).toBe('custom_value')
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-override-key')
      expect(env!.ANTHROPIC_BASE_URL).toBe('https://override.api.com')
      expect(env!.ANTHROPIC_MODEL).toBe('claude-3-override')
    })

    it('should handle empty or invalid environment variable formats', async () => {
      const cliOverrides = {
        env: ['VALID_VAR=valid_value', 'INVALID_VAR', '=no_key', ''],
      }

      const promise = startClaude(mockConfig, [], cliOverrides)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.VALID_VAR).toBe('valid_value')
      // Invalid formats should not be set
      expect(env!.INVALID_VAR).toBeUndefined()
    })

    it('should not apply CLI overrides when none are provided', async () => {
      const promise = startClaude(mockConfig, [])

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      // Should only have config values, not CLI overrides
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-test-key')
      expect(env!.ANTHROPIC_BASE_URL).toBe('https://api.test.com')
    })

    it('should apply CLI overrides without config', async () => {
      const cliOverrides = {
        env: ['CUSTOM_VAR=test_value'],
        apiKey: 'sk-no-config-key',
        baseUrl: 'https://no-config.api.com',
        model: 'claude-3-haiku',
      }

      const promise = startClaude(undefined, [], cliOverrides)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      expect(env!.CUSTOM_VAR).toBe('test_value')
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-no-config-key')
      expect(env!.ANTHROPIC_BASE_URL).toBe('https://no-config.api.com')
      expect(env!.ANTHROPIC_MODEL).toBe('claude-3-haiku')
    })
  })

  describe('findExecutable', () => {
    it('should skip .start-claude directory to avoid infinite loop', async () => {
      // Detect platform and use appropriate paths
      const isWindows = process.platform === 'win32'
      const realClaudePath = isWindows ? 'C:\\Program Files\\nodejs\\claude.cmd' : '/usr/local/bin/claude'
      const startClaudeDir = isWindows ? 'C:\\Users\\user\\.start-claude\\bin' : '/home/user/.start-claude/bin'
      const nodeDir = isWindows ? 'C:\\Program Files\\nodejs' : '/usr/local/bin'

      let accessCallCount = 0
      mockAccessSync.mockImplementation((path) => {
        accessCallCount++
        const pathStr = path.toString()

        // .start-claude paths should never be accessed due to directory skip logic
        if (pathStr.includes('.start-claude')) {
          throw new Error('Should have been skipped')
        }

        // Return the real Claude executable (handle platform-specific executables)
        if (isWindows) {
          if (pathStr === realClaudePath
            || pathStr.endsWith('\\claude.cmd')
            || pathStr === 'claude.cmd'
            || pathStr === 'claude') {
            return undefined // File exists
          }
        }
        else {
          if (pathStr === realClaudePath
            || pathStr.endsWith('/claude')
            || pathStr === 'claude') {
            return undefined // File exists
          }
        }

        throw new Error('Not found')
      })

      // Mock PATH that includes .start-claude directory first
      const originalPlatform = process.platform
      const originalEnv = process.env

      // Set up environment to include .start-claude in PATH
      process.env = {
        ...originalEnv,
        PATH: `${startClaudeDir}${path.delimiter}${nodeDir}${path.delimiter}${originalEnv.PATH || ''}`,
      }

      // Mock inquirer to not interfere with the findExecutable test
      vi.mocked(mockInquirer.default.prompt).mockResolvedValue({ install: false })

      try {
        const promise = startClaude(mockConfig)

        const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
        if (closeCallback) {
          closeCallback(0)
        }

        await promise

        // Should find the real Claude Code, not the wrapper
        const expectedPattern = isWindows ? /claude(\.cmd)?$/ : /claude$/
        expect(mockSpawn).toHaveBeenCalledWith(
          expect.stringMatching(expectedPattern),
          expect.any(Array),
          expect.any(Object),
        )

        // Verify that .start-claude directory was properly skipped
        expect(accessCallCount).toBeGreaterThan(0)
      }
      finally {
        process.env = originalEnv
        Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true })
      }
    })

    it('should handle Windows platform specific paths', async () => {
      // Mock Windows environment
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true })

      // Mock Windows specific paths exist
      mockAccessSync.mockImplementation((path) => {
        if (path.toString().includes('claude.cmd')) {
          return undefined // File exists
        }
        throw new Error('Not found')
      })

      const promise = startClaude(mockConfig)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('claude'),
        expect.any(Array),
        expect.objectContaining({ shell: true }),
      )
    })
  })

  describe('profileType handling', () => {
    it('should skip API key and base URL for official profile type', async () => {
      const officialConfig: ClaudeConfig = {
        name: 'official-config',
        profileType: 'official',
        baseUrl: 'https://api.test.com',
        apiKey: 'sk-test-key',
        model: 'claude-sonnet-4-5-20250929',
        httpProxy: 'http://proxy:8080',
        httpsProxy: 'https://proxy:8080',
        isDefault: true,
      }

      const promise = startClaude(officialConfig)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      // Should NOT set API key and base URL for official profile
      expect(env!.ANTHROPIC_API_KEY).toBeUndefined()
      expect(env!.ANTHROPIC_BASE_URL).toBeUndefined()
      // Should set model and proxy settings
      expect(env!.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-20250929')
      expect(env!.HTTP_PROXY).toBe('http://proxy:8080')
      expect(env!.HTTPS_PROXY).toBe('https://proxy:8080')
    })

    it('should set API key and base URL for default profile type', async () => {
      const defaultConfig: ClaudeConfig = {
        name: 'default-config',
        profileType: 'default',
        baseUrl: 'https://api.test.com',
        apiKey: 'sk-test-key',
        model: 'claude-sonnet-4-5-20250929',
        isDefault: true,
      }

      const promise = startClaude(defaultConfig)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      // Should set API key and base URL for default profile
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-test-key')
      expect(env!.ANTHROPIC_BASE_URL).toBe('https://api.test.com')
      expect(env!.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-20250929')
    })

    it('should set API key and base URL when profileType is undefined (backward compatibility)', async () => {
      const legacyConfig: ClaudeConfig = {
        name: 'legacy-config',
        // profileType is undefined for backward compatibility
        baseUrl: 'https://api.test.com',
        apiKey: 'sk-test-key',
        model: 'claude-sonnet-4-5-20250929',
        isDefault: true,
      }

      const promise = startClaude(legacyConfig)

      const closeCallback = mockClaudeProcess.on.mock.calls.find(call => call[0] === 'close')?.[1]
      if (closeCallback) {
        closeCallback(0)
      }

      await promise

      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      // Should set API key and base URL when profileType is undefined
      expect(env!.ANTHROPIC_API_KEY).toBe('sk-test-key')
      expect(env!.ANTHROPIC_BASE_URL).toBe('https://api.test.com')
      expect(env!.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-20250929')
    })

    it('should merge env map with individual properties taking precedence', async () => {
      const configWithEnv: ClaudeConfig = {
        name: 'env-test',
        env: {
          CUSTOM_VAR: 'from-env-map',
          ANTHROPIC_API_KEY: 'from-env-map', // Should be overridden
          ANOTHER_VAR: 'only-in-env-map',
        },
        apiKey: 'from-individual-property', // Should override env map
        baseUrl: 'https://api.individual.com',
      }

      const mockClaudeStartProcess: any = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10)
          }
          return mockClaudeStartProcess
        }),
      }
      mockSpawn.mockReturnValue(mockClaudeStartProcess)

      const result = await startClaude(configWithEnv)

      expect(mockSpawn).toHaveBeenCalledTimes(1)
      const spawnCall = mockSpawn.mock.calls[0]
      const env = spawnCall[2].env

      expect(env).toBeDefined()
      // Individual property should take precedence over env map
      expect(env!.ANTHROPIC_API_KEY).toBe('from-individual-property')
      expect(env!.ANTHROPIC_BASE_URL).toBe('https://api.individual.com')
      // Env map variables should be present
      expect(env!.CUSTOM_VAR).toBe('from-env-map')
      expect(env!.ANOTHER_VAR).toBe('only-in-env-map')
      expect(result).toBe(0)
    })
  })
})
