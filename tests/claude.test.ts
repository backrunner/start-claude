import type { ClaudeConfig } from '@/core/types'
import { spawn } from 'node:child_process'
import { accessSync } from 'node:fs'
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
vi.mock('@/utils/ui', () => ({
  displayError: vi.fn(),
  displayInfo: vi.fn(),
  displaySuccess: vi.fn(),
}))

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
    baseUrl: 'https://api.test.com',
    apiKey: 'sk-test-key',
    model: 'claude-3-sonnet',
    permissionMode: 'default',
    isDefault: true,
    useBedrock: true,
    disableTelemetry: true,
    bashDefaultTimeoutMs: 30000,
    maintainProjectWorkingDir: true,
  }

  beforeEach(async () => {
    // Reset process.env
    process.env = {}

    mockSpawn.mockReturnValue(mockClaudeProcess as any)
    mockAccessSync.mockImplementation(() => undefined) // File exists

    const claudeModule = await import('@/cli/claude')
    startClaude = claudeModule.startClaude
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('startClaude', () => {
    it('should start Claude with basic configuration', async () => {
      const mockClaudeStartProcess = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10) // Successful start
          }
          return mockClaudeStartProcess
        }),
      }
      mockSpawn.mockReturnValue(mockClaudeStartProcess as any)

      const result = await startClaude(mockConfig)

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('claude'),
        [],
        expect.objectContaining({
          stdio: 'inherit',
          env: expect.objectContaining({
            ANTHROPIC_BASE_URL: 'https://api.test.com',
            ANTHROPIC_API_KEY: 'sk-test-key',
            ANTHROPIC_MODEL: 'claude-3-sonnet',
            CLAUDE_CODE_USE_BEDROCK: '1',
            DISABLE_TELEMETRY: '1',
            BASH_DEFAULT_TIMEOUT_MS: '30000',
            CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: '1',
          }),
        }),
      )
      expect(result).toBe(0)
    })

    it('should pass additional command line arguments', async () => {
      const mockClaudeStartProcess = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10)
          }
          return mockClaudeStartProcess
        }),
      }
      mockSpawn.mockReturnValue(mockClaudeStartProcess as any)

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
      const erroringProcess = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Process failed')), 10)
          }
          return erroringProcess
        }),
      }
      mockSpawn.mockReturnValue(erroringProcess as any)

      const result = await startClaude(mockConfig)

      expect(result).toBe(1)
    })

    it('should handle Claude exit with non-zero code', async () => {
      const failingProcess = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10) // Non-zero exit code
          }
          return failingProcess
        }),
      }
      mockSpawn.mockReturnValue(failingProcess as any)

      const result = await startClaude(mockConfig)

      expect(result).toBe(1)
    })
  })

  describe('claude installation handling', () => {
    it('should prompt for installation when Claude is not found', async () => {
      // Mock that Claude is not found
      mockAccessSync.mockImplementation(() => {
        throw new Error('Command not found')
      })

      // Mock user chooses to install
      vi.mocked(mockInquirer.default.prompt).mockResolvedValue({ install: true })

      // Mock npm spawn for installation
      const mockNpmInstallProcess = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10) // Successful install
          }
          return mockNpmInstallProcess
        }),
      }

      const mockClaudeStartProcess = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10) // Successful Claude start
          }
          return mockClaudeStartProcess
        }),
      }

      mockSpawn
        .mockReturnValueOnce(mockNpmInstallProcess as any) // npm install process
        .mockReturnValueOnce(mockClaudeStartProcess as any) // claude process after install

      // Mock that Claude is found after installation on second check
      let accessCallCount = 0
      mockAccessSync.mockImplementation(() => {
        accessCallCount++
        if (accessCallCount <= 1) {
          throw new Error('Command not found') // First call - not found
        }
        return undefined // Second call - found after install
      })

      const result = await startClaude(mockConfig)

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('npm'),
        ['install', '-g', '@anthropic-ai/claude-code'],
        expect.any(Object),
      )
      expect(result).toBe(0)
    }, 10000) // 10 second timeout

    it('should handle installation failure', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('Command not found')
      })

      vi.mocked(mockInquirer.default.prompt).mockResolvedValue({ install: true })

      const failingNpmProcess = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10) // Failed installation
          }
          return failingNpmProcess
        }),
      }
      mockSpawn.mockReturnValue(failingNpmProcess as any)

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
  })

  describe('findExecutable', () => {
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
})
