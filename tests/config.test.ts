import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { ConfigManager } from '@/config'
import type { ClaudeConfig } from '@/types'

// Mock the file system operations
vi.mock('node:fs')
vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(),
  },
}))

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)

describe('ConfigManager', () => {
  let configManager: ConfigManager
  let mockConfigDir: string

  beforeEach(() => {
    mockConfigDir = '/home/user/.start-claude'
    
    mockOs.homedir.mockReturnValue('/home/user')
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockImplementation(() => undefined)
    mockFs.readFileSync.mockReturnValue('{}')
    mockFs.writeFileSync.mockImplementation(() => undefined)
    
    // Create manager after mocks are set up
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
})