import type { ClaudeConfig } from '@/core/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the file system operations
vi.mock('node:fs')
vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn().mockReturnValue('/home/user'),
  },
}))

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)

describe('configManager', () => {
  let ConfigManager: any
  let configManager: any
  let mockConfigDir: string

  beforeEach(async () => {
    const homeDir = '/home/user'
    mockConfigDir = path.join(homeDir, '.start-claude')

    mockOs.homedir.mockReturnValue(homeDir)
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockImplementation(() => undefined)
    mockFs.readFileSync.mockReturnValue('{}')
    mockFs.writeFileSync.mockImplementation(() => undefined)

    // Import ConfigManager after mocks are set up
    const configModule = await import('@/core/config')
    ConfigManager = configModule.ConfigManager
    configManager = new ConfigManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('load', () => {
    it('should create default config when config file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)

      const config = configManager.load()

      expect(config).toEqual({
        configs: [],
        settings: {
          overrideClaudeCommand: false,
        },
      })
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockConfigDir, { recursive: true })
    })

    it('should load existing config file', () => {
      const mockConfig = {
        configs: [
          { name: 'test', baseUrl: 'https://api.test.com', isDefault: true },
        ],
        settings: { overrideClaudeCommand: true },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      const config = configManager.load()

      expect(config).toEqual(mockConfig)
    })

    it('should handle corrupted config file', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('invalid json')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const config = configManager.load()

      expect(config).toEqual({
        configs: [],
        settings: {
          overrideClaudeCommand: false,
        },
      })
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should ensure configs and settings exist in loaded config', () => {
      const incompleteConfig = {}

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(incompleteConfig))

      const config = configManager.load()

      expect(config.configs).toEqual([])
      expect(config.settings).toEqual({ overrideClaudeCommand: false })
    })
  })

  describe('addConfig', () => {
    it('should add new configuration', () => {
      const newConfig: ClaudeConfig = {
        name: 'test',
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        isDefault: false,
      }

      configManager.addConfig(newConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should update existing configuration', () => {
      const existingConfig = {
        configs: [{ name: 'test', baseUrl: 'https://old.com', isDefault: false }],
        settings: { overrideClaudeCommand: false },
      }
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingConfig))

      const updatedConfig: ClaudeConfig = {
        name: 'test',
        baseUrl: 'https://new.com',
        isDefault: true,
      }

      configManager.addConfig(updatedConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('getConfig', () => {
    it('should return configuration by name', () => {
      const testConfig = { name: 'test', baseUrl: 'https://api.test.com', isDefault: false }
      const mockConfigData = {
        configs: [testConfig],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.getConfig('test')

      expect(result).toEqual(testConfig)
    })

    it('should return undefined for non-existent configuration', () => {
      const mockConfigData = {
        configs: [],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.getConfig('non-existent')

      expect(result).toBeUndefined()
    })
  })

  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const defaultConfig = { name: 'default', isDefault: true }
      const mockConfigData = {
        configs: [
          { name: 'test1', isDefault: false },
          defaultConfig,
          { name: 'test2', isDefault: false },
        ],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.getDefaultConfig()

      expect(result).toEqual(defaultConfig)
    })

    it('should return undefined when no default configuration exists', () => {
      const mockConfigData = {
        configs: [
          { name: 'test1', isDefault: false },
          { name: 'test2', isDefault: false },
        ],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.getDefaultConfig()

      expect(result).toBeUndefined()
    })
  })

  describe('removeConfig', () => {
    it('should remove existing configuration', () => {
      const mockConfigData = {
        configs: [
          { name: 'test1', isDefault: false },
          { name: 'test2', isDefault: false },
        ],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.removeConfig('test1')

      expect(result).toBe(true)
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should return false for non-existent configuration', () => {
      const mockConfigData = {
        configs: [{ name: 'test1', isDefault: false }],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.removeConfig('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('setDefaultConfig', () => {
    it('should set configuration as default', () => {
      const mockConfigData = {
        configs: [
          { name: 'test1', isDefault: true },
          { name: 'test2', isDefault: false },
        ],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.setDefaultConfig('test2')

      expect(result).toBe(true)
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should return false for non-existent configuration', () => {
      const mockConfigData = {
        configs: [{ name: 'test1', isDefault: false }],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.setDefaultConfig('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('listConfigs', () => {
    it('should return all configurations', () => {
      const configs = [
        { name: 'test1', isDefault: false },
        { name: 'test2', isDefault: true },
      ]
      const mockConfigData = {
        configs,
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.listConfigs()

      expect(result).toEqual(configs)
    })
  })

  describe('updateSettings', () => {
    it('should update settings', () => {
      const mockConfigData = {
        configs: [],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      configManager.updateSettings({ overrideClaudeCommand: true })

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('getSettings', () => {
    it('should return current settings', () => {
      const settings = { overrideClaudeCommand: true }
      const mockConfigData = {
        configs: [],
        settings,
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.getSettings()

      expect(result).toEqual(settings)
    })
  })

  describe('saveConfigFile', () => {
    it('should save complete config file', () => {
      const configFile = {
        configs: [{ name: 'test', isDefault: true }],
        settings: {
          overrideClaudeCommand: true,
          s3Sync: {
            bucket: 'test-bucket',
            region: 'us-east-1',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
            key: 'config.json',
          },
        },
      }

      configManager.saveConfigFile(configFile)

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        JSON.stringify(configFile, null, 2),
      )
    })
  })

  describe('getConfigFile', () => {
    it('should return complete config file', () => {
      const mockConfigData = {
        configs: [{ name: 'test', isDefault: true }],
        settings: {
          overrideClaudeCommand: false,
          s3Sync: {
            bucket: 'test-bucket',
            region: 'us-east-1',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
            key: 'config.json',
            endpointUrl: 'https://test.com',
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.getConfigFile()

      expect(result).toEqual(mockConfigData)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle empty config name gracefully', () => {
      const config: ClaudeConfig = {
        name: '',
        isDefault: false,
      }

      expect(() => configManager.addConfig(config)).not.toThrow()
    })

    it('should handle config with all optional fields', () => {
      const fullConfig: ClaudeConfig = {
        name: 'full-config',
        baseUrl: 'https://api.test.com',
        apiKey: 'sk-test-key',
        model: 'claude-3-sonnet',
        permissionMode: 'acceptEdits',
        isDefault: true,
        authToken: 'auth-token',
        customHeaders: 'X-Custom: value',
        smallFastModel: 'claude-3-haiku',
        smallFastModelAwsRegion: 'us-west-2',
        awsBearerTokenBedrock: 'bedrock-token',
        bashDefaultTimeoutMs: 30000,
        bashMaxTimeoutMs: 60000,
        bashMaxOutputLength: 50000,
        maintainProjectWorkingDir: true,
        apiKeyHelperTtlMs: 900000,
        ideSkipAutoInstall: false,
        maxOutputTokens: 4096,
        useBedrock: true,
        useVertex: false,
        skipBedrockAuth: false,
        skipVertexAuth: true,
        disableNonessentialTraffic: true,
        disableTerminalTitle: false,
        disableAutoupdater: true,
        disableBugCommand: false,
        disableCostWarnings: true,
        disableErrorReporting: false,
        disableNonEssentialModelCalls: true,
        disableTelemetry: true,
        httpProxy: 'http://proxy:8080',
        httpsProxy: 'https://proxy:8080',
        maxThinkingTokens: 2048,
        mcpTimeout: 10000,
        mcpToolTimeout: 5000,
        maxMcpOutputTokens: 1024,
        vertexRegionHaiku: 'us-central1',
        vertexRegionSonnet: 'us-east1',
        vertexRegion37Sonnet: 'us-west1',
        vertexRegion40Opus: 'europe-west1',
        vertexRegion40Sonnet: 'asia-east1',
      }

      configManager.addConfig(fullConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should handle multiple default configs by unsetting others', () => {
      const existingConfigs = {
        configs: [
          { name: 'config1', isDefault: true },
          { name: 'config2', isDefault: false },
        ],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingConfigs))

      const newDefaultConfig: ClaudeConfig = {
        name: 'config3',
        isDefault: true,
      }

      configManager.addConfig(newDefaultConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should handle file system errors gracefully', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      expect(() => {
        configManager.addConfig({ name: 'test', isDefault: false })
      }).toThrow('Permission denied')
    })

    it('should handle missing config directory', () => {
      mockFs.existsSync.mockReturnValue(false)
      mockFs.mkdirSync.mockImplementation(() => undefined)

      configManager.load()

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.start-claude'),
        { recursive: true },
      )
    })

    it('should preserve s3Sync settings when updating other settings', () => {
      const existingSettings = {
        configs: [],
        settings: {
          overrideClaudeCommand: false,
          s3Sync: {
            bucket: 'existing-bucket',
            region: 'us-east-1',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
            key: 'config.json',
            endpointUrl: 'https://r2.cloudflarestorage.com',
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingSettings))

      configManager.updateSettings({ overrideClaudeCommand: true })

      const writeCall = mockFs.writeFileSync.mock.calls[0]
      const savedData = JSON.parse(writeCall[1] as string)

      expect(savedData.settings.overrideClaudeCommand).toBe(true)
      expect(savedData.settings.s3Sync).toEqual(existingSettings.settings.s3Sync)
    })
  })
})
