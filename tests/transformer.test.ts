import type { ConfigService } from '../src/services/config'
import type { Transformer } from '../src/types/transformer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransformerService } from '../src/services/transformer'

// Mock the UI utilities
vi.mock('../src/utils/ui', () => ({
  displayVerbose: vi.fn(),
}))

// Mock the transformers
vi.mock('../src/transformers/openai', () => ({
  OpenaiTransformer: class MockOpenaiTransformer {
    static TransformerName = 'openai'
    domain = 'api.openai.com'
    isDefault = true
    async transformRequestOut(request: any) {
      return request
    }

    async transformResponseOut(response: Response) {
      return response
    }
  },
}))

vi.mock('../src/transformers/openrouter', () => ({
  OpenrouterTransformer: class MockOpenrouterTransformer {
    static TransformerName = 'openrouter'
    domain = 'openrouter.ai'
    isDefault = false
    async transformRequestOut(request: any) {
      return request
    }

    async transformResponseOut(response: Response) {
      return response
    }
  },
}))

describe('transformerService', () => {
  let transformerService: TransformerService
  let mockConfigService: ConfigService

  beforeEach(() => {
    // Create mock ConfigService
    mockConfigService = {
      get: vi.fn().mockReturnValue([]),
    } as unknown as ConfigService

    transformerService = new TransformerService(mockConfigService, false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('registerTransformer', () => {
    it('should register a transformer successfully', () => {
      const mockTransformer: Transformer = {
        domain: 'example.com',
        isDefault: false,
        async transformRequestOut(request: any) {
          return request
        },
        async transformResponseOut(response: Response) {
          return response
        },
      }

      transformerService.registerTransformer('test', mockTransformer)

      expect(transformerService.hasTransformer('test')).toBe(true)
      expect(transformerService.getTransformer('test')).toBe(mockTransformer)
    })

    it('should register a default transformer', () => {
      const mockTransformer: Transformer = {
        domain: 'example.com',
        isDefault: true,
        async transformRequestOut(request: any) {
          return request
        },
        async transformResponseOut(response: Response) {
          return response
        },
      }

      transformerService.registerTransformer('default', mockTransformer)

      expect(transformerService.hasTransformer('default')).toBe(true)
    })
  })

  describe('getTransformer', () => {
    it('should return transformer if exists', () => {
      const mockTransformer: Transformer = {
        domain: 'example.com',
        isDefault: false,
      }

      transformerService.registerTransformer('test', mockTransformer)

      expect(transformerService.getTransformer('test')).toBe(mockTransformer)
    })

    it('should return undefined if transformer does not exist', () => {
      expect(transformerService.getTransformer('nonexistent')).toBeUndefined()
    })
  })

  describe('getAllTransformers', () => {
    it('should return empty map when no transformers registered', () => {
      const transformers = transformerService.getAllTransformers()
      expect(transformers.size).toBe(0)
    })

    it('should return all registered transformers', () => {
      const mockTransformer1: Transformer = { domain: 'example1.com', isDefault: false }
      const mockTransformer2: Transformer = { domain: 'example2.com', isDefault: true }

      transformerService.registerTransformer('test1', mockTransformer1)
      transformerService.registerTransformer('test2', mockTransformer2)

      const transformers = transformerService.getAllTransformers()
      expect(transformers.size).toBe(2)
      expect(transformers.has('test1')).toBe(true)
      expect(transformers.has('test2')).toBe(true)
    })
  })

  describe('getTransformersWithDomain', () => {
    it('should return transformers that have domain property', () => {
      const transformerWithDomain: Transformer = { domain: 'example.com', isDefault: false }
      const transformerWithoutDomain: Transformer = { isDefault: false }

      transformerService.registerTransformer('withDomain', transformerWithDomain)
      transformerService.registerTransformer('withoutDomain', transformerWithoutDomain)

      const result = transformerService.getTransformersWithDomain()
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('withDomain')
      expect(result[0].transformer).toBe(transformerWithDomain)
    })

    it('should return empty array when no transformers have domain', () => {
      const transformer: Transformer = { isDefault: false }
      transformerService.registerTransformer('noDomain', transformer)

      const result = transformerService.getTransformersWithDomain()
      expect(result).toHaveLength(0)
    })
  })

  describe('removeTransformer', () => {
    it('should remove existing transformer and return true', () => {
      const mockTransformer: Transformer = { domain: 'example.com', isDefault: false }
      transformerService.registerTransformer('test', mockTransformer)

      expect(transformerService.hasTransformer('test')).toBe(true)
      expect(transformerService.removeTransformer('test')).toBe(true)
      expect(transformerService.hasTransformer('test')).toBe(false)
    })

    it('should return false when trying to remove non-existent transformer', () => {
      expect(transformerService.removeTransformer('nonexistent')).toBe(false)
    })
  })

  describe('hasTransformer', () => {
    it('should return true for existing transformer', () => {
      const mockTransformer: Transformer = { domain: 'example.com', isDefault: false }
      transformerService.registerTransformer('test', mockTransformer)

      expect(transformerService.hasTransformer('test')).toBe(true)
    })

    it('should return false for non-existent transformer', () => {
      expect(transformerService.hasTransformer('nonexistent')).toBe(false)
    })
  })

  describe('findTransformerByDomain', () => {
    beforeEach(() => {
      // Register test transformers
      const openaiTransformer: Transformer = {
        domain: 'api.openai.com',
        isDefault: true,
      }
      const openrouterTransformer: Transformer = {
        domain: 'openrouter.ai',
        isDefault: false,
      }

      transformerService.registerTransformer('openai', openaiTransformer)
      transformerService.registerTransformer('openrouter', openrouterTransformer)
    })

    it('should return transformer for exact domain match', () => {
      const result = transformerService.findTransformerByDomain('https://api.openai.com/v1/chat/completions')
      expect(result).toBeTruthy()
      expect(result?.domain).toBe('api.openai.com')
    })

    it('should return transformer for exact domain match with different path', () => {
      const result = transformerService.findTransformerByDomain('https://openrouter.ai/api/v1/chat/completions')
      expect(result).toBeTruthy()
      expect(result?.domain).toBe('openrouter.ai')
    })

    it('should return default transformer when no exact match found', () => {
      const result = transformerService.findTransformerByDomain('https://unknown-domain.com/api')
      expect(result).toBeTruthy()
      expect(result?.isDefault).toBe(true)
      expect(result?.domain).toBe('api.openai.com')
    })

    it('should return null when baseUrl is undefined', () => {
      const result = transformerService.findTransformerByDomain(undefined)
      expect(result).toBeNull()
    })

    it('should return null when baseUrl is empty string', () => {
      const result = transformerService.findTransformerByDomain('')
      expect(result).toBeNull()
    })

    it('should return null when baseUrl is invalid URL', () => {
      const result = transformerService.findTransformerByDomain('invalid-url')
      expect(result).toBeNull()
    })

    it('should return null when no transformers registered', () => {
      const emptyService = new TransformerService(mockConfigService, false)
      const result = emptyService.findTransformerByDomain('https://api.openai.com')
      expect(result).toBeNull()
    })
  })

  describe('registerTransformerFromConfig', () => {
    it('should return false when no path provided', async () => {
      const result = await transformerService.registerTransformerFromConfig({})
      expect(result).toBe(false)
    })

    it('should return false when path cannot be resolved', async () => {
      const result = await transformerService.registerTransformerFromConfig({
        path: 'non-existent-module',
      })
      expect(result).toBe(false)
    })

    it('should handle module loading error gracefully', async () => {
      const result = await transformerService.registerTransformerFromConfig({
        path: './invalid-transformer',
      })
      expect(result).toBe(false)
    })
  })

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      mockConfigService.get = vi.fn().mockReturnValue([])

      await expect(transformerService.initialize()).resolves.not.toThrow()
    })

    it('should register default transformers', async () => {
      mockConfigService.get = vi.fn().mockReturnValue([])

      await transformerService.initialize()

      expect(transformerService.hasTransformer('openai')).toBe(true)
      expect(transformerService.hasTransformer('openrouter')).toBe(true)
    })

    it('should load transformers from config', async () => {
      const mockTransformerConfigs = [
        {
          name: 'test-transformer',
          type: 'module' as const,
          path: './test-transformer',
          options: {},
        },
      ]
      mockConfigService.get = vi.fn().mockReturnValue(mockTransformerConfigs)

      // Mock the registerTransformerFromConfig method
      const registerSpy = vi.spyOn(transformerService, 'registerTransformerFromConfig')
        .mockResolvedValue(true)

      await transformerService.initialize()

      expect(registerSpy).toHaveBeenCalledWith(mockTransformerConfigs[0])
    })

    it('should handle initialization errors gracefully', async () => {
      // Mock config service to throw an error
      mockConfigService.get = vi.fn().mockImplementation(() => {
        throw new Error('Config error')
      })

      await expect(transformerService.initialize()).resolves.not.toThrow()
    })
  })

  describe('verbose logging', () => {
    it('should initialize with verbose logging enabled', () => {
      const verboseService = new TransformerService(mockConfigService, true)
      expect(verboseService).toBeDefined()
    })

    it('should log transformer registration when verbose is enabled', () => {
      const verboseService = new TransformerService(mockConfigService, true)
      const mockTransformer: Transformer = {
        domain: 'example.com',
        isDefault: false,
      }

      verboseService.registerTransformer('test', mockTransformer)
      expect(verboseService.hasTransformer('test')).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle transformer without domain in findTransformerByDomain', () => {
      const transformerWithoutDomain: Transformer = { isDefault: false }
      const defaultTransformer: Transformer = { domain: 'default.com', isDefault: true }

      transformerService.registerTransformer('noDomain', transformerWithoutDomain)
      transformerService.registerTransformer('default', defaultTransformer)

      const result = transformerService.findTransformerByDomain('https://unknown.com')
      expect(result?.isDefault).toBe(true)
    })

    it('should handle multiple default transformers by returning the first one found', () => {
      const defaultTransformer1: Transformer = { domain: 'default1.com', isDefault: true }
      const defaultTransformer2: Transformer = { domain: 'default2.com', isDefault: true }

      transformerService.registerTransformer('default1', defaultTransformer1)
      transformerService.registerTransformer('default2', defaultTransformer2)

      const result = transformerService.findTransformerByDomain('https://unknown.com')
      expect(result?.isDefault).toBe(true)
      // Should return one of the default transformers
      expect(['default1.com', 'default2.com']).toContain(result?.domain)
    })

    it('should handle URL with port numbers', () => {
      const transformer: Transformer = { domain: 'localhost', isDefault: false }
      transformerService.registerTransformer('localhost', transformer)

      const result = transformerService.findTransformerByDomain('http://localhost:3000/api')
      expect(result?.domain).toBe('localhost')
    })

    it('should handle URL with different protocols', () => {
      const transformer: Transformer = { domain: 'example.com', isDefault: false }
      transformerService.registerTransformer('example', transformer)

      const httpResult = transformerService.findTransformerByDomain('http://example.com/api')
      const httpsResult = transformerService.findTransformerByDomain('https://example.com/api')

      expect(httpResult?.domain).toBe('example.com')
      expect(httpsResult?.domain).toBe('example.com')
    })
  })
})
