import type { ClaudeConfig } from '@/config/types'
import fs from 'node:fs'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the file system operations
vi.mock('node:fs')
vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn().mockReturnValue('/home/user'),
  },
  homedir: vi.fn().mockReturnValue('/home/user'),
}))

// Mock the UI functions
vi.mock('@/utils/ui', () => ({
  displayInfo: vi.fn(),
  displaySuccess: vi.fn(),
  displayWarning: vi.fn(),
}))

const mockFs = vi.mocked(fs)

describe('configManager', () => {
  let ConfigManager: any
  let configManager: any

  beforeEach(async () => {
    const homeDir = '/home/user'

    vi.mocked(os.homedir).mockReturnValue(homeDir)
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockImplementation(() => undefined)
    mockFs.readFileSync.mockReturnValue('{}')
    mockFs.writeFileSync.mockImplementation(() => undefined)
    mockFs.copyFileSync.mockImplementation(() => undefined)
    mockFs.appendFileSync.mockImplementation(() => undefined)

    // Import ConfigManager after mocks are set up
    const configModule = await import('@/config/manager')
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
        version: 1,
        configs: [],
        settings: {
          overrideClaudeCommand: false,
        },
      })
    })

    it('should load existing config file', () => {
      const mockConfig = {
        version: 1,
        configs: [
          { name: 'test', baseUrl: 'https://api.test.com', isDefault: true, enabled: true },
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
      mockFs.copyFileSync.mockImplementation(() => undefined)

      const config = configManager.load()

      expect(config).toEqual({
        version: 1,
        configs: [],
        settings: {
          overrideClaudeCommand: false,
        },
      })
      expect(mockFs.copyFileSync).toHaveBeenCalled() // Backup created
    })

    it('should migrate legacy config file without version', () => {
      const legacyConfig = {
        configs: [
          { name: 'test', baseUrl: 'https://api.test.com', isDefault: true },
        ],
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

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(legacyConfig))
      mockFs.appendFileSync.mockImplementation(() => undefined)

      const config = configManager.load()

      expect(config.version).toBe(1)
      expect(config.configs).toEqual([
        { name: 'test', baseUrl: 'https://api.test.com', isDefault: true, enabled: true },
      ])
      expect(config.settings.overrideClaudeCommand).toBe(true)
      expect(config.settings.s3Sync).toEqual(legacyConfig.settings.s3Sync)
    })

    it('should ensure configs and settings exist in loaded config', () => {
      const incompleteConfig = { version: 1 }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(incompleteConfig))

      const config = configManager.load()

      expect(config.version).toBe(1)
      expect(config.configs).toEqual([])
      expect(config.settings).toEqual({ overrideClaudeCommand: false })
    })
  })

  describe('addConfig', () => {
    it('should add new configuration', async () => {
      const newConfig: ClaudeConfig = {
        name: 'test',
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        isDefault: false,
      }

      await configManager.addConfig(newConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should update existing configuration', async () => {
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

      await configManager.addConfig(updatedConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('getConfig', () => {
    it('should return configuration by name', () => {
      const testConfig = { name: 'test', baseUrl: 'https://api.test.com', isDefault: false, enabled: true }
      const mockConfigData = {
        version: 1,
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
      const defaultConfig = { name: 'default', isDefault: true, enabled: true }
      const mockConfigData = {
        version: 1,
        configs: [
          { name: 'test1', isDefault: false, enabled: true },
          defaultConfig,
          { name: 'test2', isDefault: false, enabled: true },
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
        version: 1,
        configs: [
          { name: 'test1', isDefault: false, enabled: true },
          { name: 'test2', isDefault: false, enabled: true },
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
    it('should remove existing configuration', async () => {
      const mockConfigData = {
        configs: [
          { name: 'test1', isDefault: false },
          { name: 'test2', isDefault: false },
        ],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = await configManager.removeConfig('test1')

      expect(result).toBe(true)
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should return false for non-existent configuration', async () => {
      const mockConfigData = {
        configs: [{ name: 'test1', isDefault: false }],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = await configManager.removeConfig('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('setDefaultConfig', () => {
    it('should set configuration as default', async () => {
      const mockConfigData = {
        configs: [
          { name: 'test1', isDefault: true },
          { name: 'test2', isDefault: false },
        ],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = await configManager.setDefaultConfig('test2')

      expect(result).toBe(true)
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should return false for non-existent configuration', async () => {
      const mockConfigData = {
        configs: [{ name: 'test1', isDefault: false }],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = await configManager.setDefaultConfig('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('listConfigs', () => {
    it('should return all configurations', () => {
      const configs = [
        { name: 'test1', isDefault: false, enabled: true },
        { name: 'test2', isDefault: true, enabled: true },
      ]
      const mockConfigData = {
        version: 1,
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
    it('should update settings', async () => {
      const mockConfigData = {
        configs: [],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      await configManager.updateSettings({ overrideClaudeCommand: true })

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
    it('should save complete config file', async () => {
      const configFile = {
        version: 1,
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

      await configManager.saveConfigFile(configFile)

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.stringContaining('"version": 1'),
      )
    })
  })

  describe('getConfigFile', () => {
    it('should return complete config file', () => {
      const mockConfigData = {
        version: 1,
        configs: [{ name: 'test', isDefault: true, enabled: true }],
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
    it('should handle empty config name gracefully', async () => {
      const config: ClaudeConfig = {
        name: '',
        isDefault: false,
      }

      await expect(configManager.addConfig(config)).rejects.toThrow('Config at index 0 must have a valid name')
    })

    it('should handle config with all optional fields', async () => {
      const fullConfig: ClaudeConfig = {
        name: 'full-config',
        profileType: 'default',
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

      await configManager.addConfig(fullConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should handle multiple default configs by unsetting others', async () => {
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

      await configManager.addConfig(newDefaultConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should handle file system errors gracefully', async () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      await expect(async () => {
        await configManager.addConfig({ name: 'test', isDefault: false })
      }).rejects.toThrow('Permission denied')
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

    it('should preserve s3Sync settings when updating other settings', async () => {
      const existingSettings = {
        version: 1,
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

      await configManager.updateSettings({ overrideClaudeCommand: true })

      const writeCall = mockFs.writeFileSync.mock.calls[0]
      const savedData = JSON.parse(writeCall[1] as string)

      expect(savedData.settings.overrideClaudeCommand).toBe(true)
      expect(savedData.settings.s3Sync).toEqual(existingSettings.settings.s3Sync)
    })
  })

  describe('profileType handling', () => {
    it('should handle official profileType configuration', async () => {
      const officialConfig: ClaudeConfig = {
        name: 'official-config',
        profileType: 'official',
        httpProxy: 'http://proxy:8080',
        httpsProxy: 'https://proxy:8080',
        model: 'claude-3-sonnet',
        isDefault: false,
      }

      await configManager.addConfig(officialConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should handle default profileType configuration', async () => {
      const defaultConfig: ClaudeConfig = {
        name: 'default-config',
        profileType: 'default',
        baseUrl: 'https://api.test.com',
        apiKey: 'sk-test-key',
        model: 'claude-3-sonnet',
        isDefault: false,
      }

      await configManager.addConfig(defaultConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should handle configuration without profileType (backward compatibility)', async () => {
      const legacyConfig: ClaudeConfig = {
        name: 'legacy-config',
        // profileType not specified for backward compatibility
        baseUrl: 'https://api.test.com',
        apiKey: 'sk-test-key',
        model: 'claude-3-sonnet',
        isDefault: false,
      }

      await configManager.addConfig(legacyConfig)

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should retrieve configuration with profileType correctly', () => {
      const configWithProfileType = {
        name: 'profile-test',
        profileType: 'official',
        httpProxy: 'http://proxy:8080',
        isDefault: false,
        enabled: true,
      }
      const mockConfigData = {
        version: 1,
        configs: [configWithProfileType],
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.getConfig('profile-test')

      expect(result).toEqual(configWithProfileType)
      expect(result?.profileType).toBe('official')
    })

    it('should handle mixed profileType configurations in list', () => {
      const configs = [
        { name: 'default-config', profileType: 'default', baseUrl: 'https://api.test.com', isDefault: false, enabled: true },
        { name: 'official-config', profileType: 'official', httpProxy: 'http://proxy:8080', isDefault: false, enabled: true },
        { name: 'legacy-config', baseUrl: 'https://api.legacy.com', isDefault: true, enabled: true }, // no profileType
      ]
      const mockConfigData = {
        version: 1,
        configs,
        settings: { overrideClaudeCommand: false },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfigData))

      const result = configManager.listConfigs()

      expect(result).toEqual(configs)
      expect(result[0].profileType).toBe('default')
      expect(result[1].profileType).toBe('official')
      expect(result[2].profileType).toBeUndefined()
    })
  })
})
