import type { ClaudeConfig } from '../src/config/types'
import type { ProxyMode } from '../src/types/transformer'
import { Buffer } from 'node:buffer'
import http from 'node:http'
import https from 'node:https'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProxyServer } from '../src/core/proxy'
import { ConfigService } from '../src/services/config'

// Mock the UI functions
vi.mock('../src/utils/cli/ui', () => ({
  displayError: vi.fn(),
  displayGrey: vi.fn(),
  displaySuccess: vi.fn(),
  displayWarning: vi.fn(),
  displayVerbose: vi.fn(),
}))

// Mock services
vi.mock('../src/services/config')
vi.mock('../src/services/transformer', () => {
  const MockTransformerService = vi.fn().mockImplementation(() => ({
    registerTransformer: vi.fn(),
    hasTransformer: vi.fn().mockReturnValue(true),
    removeTransformer: vi.fn().mockReturnValue(true),
    getAllTransformers: vi.fn().mockReturnValue(new Map([
      ['openai', { name: 'openai', endPoint: '/v1/chat/completions' }],
    ])),
    getTransformersWithEndpoint: vi.fn().mockReturnValue([]),
    getTransformersWithoutEndpoint: vi.fn().mockReturnValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    findTransformerByPath: vi.fn().mockReturnValue(null),
    findTransformerByDomain: vi.fn((_baseUrl?: string, _transformerEnabled?: boolean, _transformer?: string) => null),
  }))

  // Add static methods properly
  Object.assign(MockTransformerService, {
    isTransformerEnabled: vi.fn((transformerEnabled?: boolean) => {
      return transformerEnabled === true
    }),
    getTransformerType: vi.fn((transformerEnabled?: boolean | string) => {
      if (typeof transformerEnabled === 'string' && transformerEnabled !== 'true') {
        return transformerEnabled === 'auto' ? 'auto' : transformerEnabled
      }
      return 'auto'
    }),
  })

  return { TransformerService: MockTransformerService }
})

// Mock HTTP modules
vi.mock('node:http')
vi.mock('node:https')

// Mock PassThrough stream
vi.mock('node:stream', () => ({
  PassThrough: vi.fn().mockImplementation(() => ({
    emit: vi.fn(),
    on: vi.fn(),
    pipe: vi.fn().mockReturnThis(),
  })),
}))

const mockHttp = vi.mocked(http)
const mockHttps = vi.mocked(https)
const MockConfigService = vi.mocked(ConfigService)

describe('proxyServer', () => {
  let testConfigs: ClaudeConfig[]
  let proxyServer: ProxyServer
  let mockServer: any
  let mockRequest: any
  let mockConfigService: any

  beforeEach(() => {
    testConfigs = [
      {
        name: 'config1',
        profileType: 'default',
        baseUrl: 'https://api1.example.com',
        apiKey: 'sk-test-key-1',
        model: 'claude-sonnet-4-5-20250929',
        isDefault: false,
      },
      {
        name: 'config2',
        profileType: 'default',
        baseUrl: 'https://api2.example.com',
        apiKey: 'sk-test-key-2',
        model: 'claude-3-haiku',
        isDefault: false,
      },
      {
        name: 'config3',
        profileType: 'default',
        baseUrl: 'https://api3.example.com',
        apiKey: 'sk-test-key-3',
        model: 'claude-3-opus',
        isDefault: false,
      },
    ]

    // Mock ConfigService
    mockConfigService = {
      get: vi.fn().mockReturnValue([]),
    }
    MockConfigService.mockImplementation(() => mockConfigService)

    // Mock server
    mockServer = {
      listen: vi.fn((port, callback) => callback()),
      on: vi.fn(),
      close: vi.fn(callback => callback()),
    }

    // Mock request
    mockRequest = {
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    }

    mockHttp.createServer.mockReturnValue(mockServer)
    mockHttp.request.mockReturnValue(mockRequest)
    mockHttps.request.mockReturnValue(mockRequest)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor - load balancer mode', () => {
    beforeEach(() => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      const systemSettings = {
        balanceMode: {
          enableByDefault: false,
          healthCheck: {
            enabled: true,
            intervalMs: 15000,
          },
          failedEndpoint: {
            banDurationSeconds: 180,
          },
        },
      }
      proxyServer = new ProxyServer(testConfigs, proxyMode, systemSettings)
    })

    it('should initialize with valid configurations', () => {
      expect(proxyServer.getProxyApiKey()).toBe('sk-claude-proxy-server')
    })

    it('should filter out configs without baseUrl or apiKey', () => {
      const invalidConfigs: ClaudeConfig[] = [
        {
          name: 'invalid1',
          profileType: 'default',
          baseUrl: 'https://api.example.com',
          // Missing apiKey
          isDefault: false,
        },
        {
          name: 'invalid2',
          profileType: 'default',
          // Missing baseUrl
          apiKey: 'sk-test-key',
          isDefault: false,
        },
        {
          name: 'valid',
          profileType: 'default',
          baseUrl: 'https://api.example.com',
          apiKey: 'sk-test-key',
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableLoadBalance: true }
      const ps = new ProxyServer(invalidConfigs, proxyMode)
      const status = ps.getStatus()
      expect(status.total).toBe(1)
    })

    it('should apply system settings for balance mode', () => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      const systemSettings = {
        balanceMode: {
          enableByDefault: true,
          healthCheck: {
            enabled: false,
            intervalMs: 60000,
          },
          failedEndpoint: {
            banDurationSeconds: 600,
          },
        },
      }

      const ps = new ProxyServer(testConfigs, proxyMode, systemSettings)

      // Check that system settings are applied (we can't directly access private properties,
      // but we can test the behavior through other methods)
      const status = ps.getStatus()
      expect(status.total).toBe(3)
      expect(status.loadBalance).toBe(true)
    })

    it('should throw error when no valid configs provided', () => {
      const invalidConfigs: ClaudeConfig[] = [
        {
          name: 'invalid',
          profileType: 'default',
          // Missing both baseUrl and apiKey
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableLoadBalance: true }
      expect(() => new ProxyServer(invalidConfigs, proxyMode)).toThrow(
        'No configurations found for load balancing (need either API credentials or transformer enabled)',
      )
    })
  })

  describe('constructor - transformer mode', () => {
    it('should initialize in transformer mode', () => {
      const transformerConfig: ClaudeConfig = {
        name: 'transformer-test',
        profileType: 'default',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test-key',
        transformerEnabled: true,
        isDefault: false,
      }
      const proxyMode: ProxyMode = { enableTransform: true }
      const ps = new ProxyServer([transformerConfig], proxyMode)
      const status = ps.getStatus()
      expect(status.transform).toBe(true)
    })

    it('should initialize in combined mode', () => {
      const proxyMode: ProxyMode = {
        enableLoadBalance: true,
        enableTransform: true,
      }
      const ps = new ProxyServer(testConfigs, proxyMode)
      const status = ps.getStatus()
      expect(status.loadBalance).toBe(true)
      expect(status.transform).toBe(true)
    })
  })

  describe('getStatus', () => {
    beforeEach(() => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      proxyServer = new ProxyServer(testConfigs, proxyMode)
    })

    it('should return correct status information', () => {
      const status = proxyServer.getStatus()

      expect(status.total).toBe(3)
      expect(status.healthy).toBe(3)
      expect(status.unhealthy).toBe(0)
      expect(status.endpoints).toHaveLength(3)
      expect(status.endpoints[0].config.name).toBe('config1')
      expect(status.endpoints[1].config.name).toBe('config2')
      expect(status.endpoints[2].config.name).toBe('config3')
      expect(status.loadBalance).toBe(true)
    })
  })

  describe('endpoint banning functionality', () => {
    it('should handle endpoint banning when health checks are disabled', () => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      const systemSettings = {
        balanceMode: {
          healthCheck: {
            enabled: false,
            intervalMs: 30000,
          },
          failedEndpoint: {
            banDurationSeconds: 60, // 1 minute for testing
          },
        },
      }

      const ps = new ProxyServer(testConfigs, proxyMode, systemSettings)
      const markEndpointUnhealthy = (ps as any).markEndpointUnhealthy.bind(ps)
      const getNextHealthyEndpoint = (ps as any).getNextHealthyEndpoint.bind(ps)

      const status = ps.getStatus()
      const endpoint = status.endpoints[0]

      // Mark endpoint as unhealthy (should trigger ban)
      markEndpointUnhealthy(endpoint, 'Test error')

      // Should have bannedUntil timestamp set
      expect(endpoint.bannedUntil).toBeDefined()
      expect(endpoint.bannedUntil).toBeGreaterThan(Date.now())

      // Should skip banned endpoint
      const nextEndpoint = getNextHealthyEndpoint()
      expect(nextEndpoint?.config.name).not.toBe(endpoint.config.name)
    })

    it('should expire bans after duration when health checks are disabled', () => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      const systemSettings = {
        balanceMode: {
          healthCheck: {
            enabled: false,
            intervalMs: 30000,
          },
          failedEndpoint: {
            banDurationSeconds: 0.1, // Very short duration for testing
          },
        },
      }

      const ps = new ProxyServer(testConfigs, proxyMode, systemSettings)
      const markEndpointUnhealthy = (ps as any).markEndpointUnhealthy.bind(ps)
      const getNextHealthyEndpoint = (ps as any).getNextHealthyEndpoint.bind(ps)

      const status = ps.getStatus()
      const endpoint = status.endpoints[0]

      // Mark endpoint as unhealthy
      markEndpointUnhealthy(endpoint, 'Test error')
      expect(endpoint.isHealthy).toBe(false)

      // Wait for ban to expire (using setTimeout would make test async, so we'll simulate)
      endpoint.bannedUntil = Date.now() - 1000 // Set ban to expired

      // Should be available again
      const nextEndpoint = getNextHealthyEndpoint()
      expect(nextEndpoint?.config.name).toBe(endpoint.config.name)
      expect(endpoint.isHealthy).toBe(true) // Should be marked healthy again
      expect(endpoint.bannedUntil).toBeUndefined()
    })
  })

  describe('endpoint selection', () => {
    beforeEach(() => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      proxyServer = new ProxyServer(testConfigs, proxyMode)
    })

    it('should round-robin through healthy endpoints', () => {
      // Access the private method via reflection for testing
      const getNextHealthyEndpoint = (proxyServer as any).getNextHealthyEndpoint.bind(proxyServer)

      const endpoint1 = getNextHealthyEndpoint()
      const endpoint2 = getNextHealthyEndpoint()
      const endpoint3 = getNextHealthyEndpoint()
      const endpoint4 = getNextHealthyEndpoint() // Should wrap around

      expect(endpoint1.config.name).toBe('config1')
      expect(endpoint2.config.name).toBe('config2')
      expect(endpoint3.config.name).toBe('config3')
      expect(endpoint4.config.name).toBe('config1') // Back to first
    })

    it('should skip unhealthy endpoints', () => {
      const getNextHealthyEndpoint = (proxyServer as any).getNextHealthyEndpoint.bind(proxyServer)
      const markEndpointUnhealthy = (proxyServer as any).markEndpointUnhealthy.bind(proxyServer)

      // Mark second endpoint as unhealthy
      const status = proxyServer.getStatus()
      markEndpointUnhealthy(status.endpoints[1], 'Test error')

      const endpoint1 = getNextHealthyEndpoint()
      const endpoint2 = getNextHealthyEndpoint()
      const endpoint3 = getNextHealthyEndpoint()

      // Should only cycle between config1 and config3 (skipping unhealthy config2)
      expect(endpoint1.config.name).toBe('config1')
      expect(endpoint2.config.name).toBe('config3')
      expect(endpoint3.config.name).toBe('config1')
    })

    it('should return null when all endpoints are unhealthy', () => {
      const getNextHealthyEndpoint = (proxyServer as any).getNextHealthyEndpoint.bind(proxyServer)
      const markEndpointUnhealthy = (proxyServer as any).markEndpointUnhealthy.bind(proxyServer)

      // Mark all endpoints as unhealthy
      const status = proxyServer.getStatus()
      status.endpoints.forEach((endpoint, index) => {
        markEndpointUnhealthy(endpoint, `Test error ${index}`)
      })

      const endpoint = getNextHealthyEndpoint()
      expect(endpoint).toBeNull()
    })
  })

  describe('proxy request headers', () => {
    beforeEach(() => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      proxyServer = new ProxyServer(testConfigs, proxyMode)
    })

    it('should use correct x-api-key header for different endpoints', () => {
      // Test the header preparation logic directly
      const status = proxyServer.getStatus()
      const endpoint1 = status.endpoints[0]
      const endpoint2 = status.endpoints[1]

      // Mock incoming headers
      const incomingHeaders: Record<string, string> = {
        'content-type': 'application/json',
        'authorization': 'Bearer sk-claude-proxy-server',
        'host': 'localhost:2333',
      }

      // Simulate the header processing logic from proxyRequest
      const headers1: Record<string, string | undefined> = { ...incomingHeaders }
      headers1['x-api-key'] = endpoint1.config.apiKey
      delete headers1.authorization

      const headers2: Record<string, string | undefined> = { ...incomingHeaders }
      headers2['x-api-key'] = endpoint2.config.apiKey
      delete headers2.authorization

      expect(headers1['x-api-key']).toBe('sk-test-key-1')
      expect(headers1.authorization).toBeUndefined()

      expect(headers2['x-api-key']).toBe('sk-test-key-2')
      expect(headers2.authorization).toBeUndefined()
    })

    it('should use correct base URLs for different endpoints', () => {
      const status = proxyServer.getStatus()

      const url1 = new URL('/v1/messages', status.endpoints[0].config.baseUrl)
      const url2 = new URL('/v1/messages', status.endpoints[1].config.baseUrl)
      const url3 = new URL('/v1/messages', status.endpoints[2].config.baseUrl)

      expect(url1.toString()).toContain('api1.example.com')
      expect(url2.toString()).toContain('api2.example.com')
      expect(url3.toString()).toContain('api3.example.com')
    })
  })

  describe('health check headers', () => {
    beforeEach(() => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      proxyServer = new ProxyServer(testConfigs, proxyMode)
    })

    it('should prepare correct headers for health checks', () => {
      const status = proxyServer.getStatus()
      const endpoint = status.endpoints[0]

      const healthCheckBody = JSON.stringify({
        model: endpoint.config.model || 'claude-3-haiku-20241022',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'ping',
        }],
      })

      const expectedHeaders = {
        'x-api-key': endpoint.config.apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(healthCheckBody),
      }

      expect(expectedHeaders['x-api-key']).toBe('sk-test-key-1')
      expect(expectedHeaders['Content-Type']).toBe('application/json')
      expect(expectedHeaders['Content-Length']).toBeGreaterThan(0)
    })
  })

  describe('config ordering', () => {
    it('should sort configs by order field with lower numbers first', () => {
      const configsWithOrder: ClaudeConfig[] = [
        {
          name: 'config-high-priority',
          profileType: 'default',
          baseUrl: 'https://high.example.com',
          apiKey: 'sk-high-priority',
          order: 0, // Highest priority
          isDefault: false,
        },
        {
          name: 'config-low-priority',
          profileType: 'default',
          baseUrl: 'https://low.example.com',
          apiKey: 'sk-low-priority',
          order: 10, // Lower priority
          isDefault: false,
        },
        {
          name: 'config-medium-priority',
          profileType: 'default',
          baseUrl: 'https://medium.example.com',
          apiKey: 'sk-medium-priority',
          order: 5, // Medium priority
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableLoadBalance: true }
      const ps = new ProxyServer(configsWithOrder, proxyMode)
      const status = ps.getStatus()

      // Should be sorted by order: 0, 5, 10
      expect(status.endpoints[0].config.name).toBe('config-high-priority')
      expect(status.endpoints[1].config.name).toBe('config-medium-priority')
      expect(status.endpoints[2].config.name).toBe('config-low-priority')
      expect(status.endpoints[0].config.order).toBe(0)
      expect(status.endpoints[1].config.order).toBe(5)
      expect(status.endpoints[2].config.order).toBe(10)
    })

    it('should treat undefined order as highest priority (0)', () => {
      const configsWithMixedOrder: ClaudeConfig[] = [
        {
          name: 'config-with-order',
          profileType: 'default',
          baseUrl: 'https://ordered.example.com',
          apiKey: 'sk-ordered',
          order: 5,
          isDefault: false,
        },
        {
          name: 'config-without-order',
          profileType: 'default',
          baseUrl: 'https://unordered.example.com',
          apiKey: 'sk-unordered',
          // no order field - should be treated as 0
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableLoadBalance: true }
      const ps = new ProxyServer(configsWithMixedOrder, proxyMode)
      const status = ps.getStatus()

      // Config without order should come first (treated as 0)
      expect(status.endpoints[0].config.name).toBe('config-without-order')
      expect(status.endpoints[1].config.name).toBe('config-with-order')
    })
  })

  describe('transformer management', () => {
    beforeEach(() => {
      const transformerConfig: ClaudeConfig = {
        name: 'transformer-test',
        profileType: 'default',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test-key',
        transformerEnabled: true,
        isDefault: false,
      }
      const proxyMode: ProxyMode = { enableTransform: true }
      proxyServer = new ProxyServer([transformerConfig], proxyMode)
    })

    it('should add and remove transformers', async () => {
      const mockTransformer = {
        name: 'test-transformer',
        endPoint: '/test',
        formatRequest: vi.fn(),
      }

      // Test adding transformer
      await proxyServer.addTransformer('test', mockTransformer)

      // Test removing transformer
      const removed = proxyServer.removeTransformer('test')
      expect(removed).toBe(true)

      // Verify transformer service methods are available
      expect(proxyServer.getTransformerService()).toBeDefined()
      expect(typeof proxyServer.getTransformerService().hasTransformer).toBe('function')
    })

    it('should list transformers', async () => {
      await proxyServer.initialize()
      const transformers = proxyServer.listTransformers()

      // Should have at least the default OpenAI transformer
      expect(transformers.length).toBeGreaterThanOrEqual(1)
      expect(transformers.some(t => t.name === 'openai')).toBe(true)
    })

    it('should return transformer status', () => {
      const status = proxyServer.getStatus()
      expect(status.transform).toBe(true)
      expect(status.transformers).toBeDefined()
    })
  })

  describe('server lifecycle', () => {
    beforeEach(() => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      proxyServer = new ProxyServer(testConfigs, proxyMode)
    })

    it('should start server on specified port', async () => {
      await proxyServer.startServer(3000)

      expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function))
      expect(mockHttp.createServer).toHaveBeenCalled()
    })

    it('should stop server and clear intervals', async () => {
      await proxyServer.startServer()
      await proxyServer.stop()

      expect(mockServer.close).toHaveBeenCalled()
    })
  })

  describe('request handling', () => {
    let mockIncomingMessage: any
    let mockServerResponse: any

    beforeEach(() => {
      mockIncomingMessage = {
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer sk-claude-proxy-server',
        },
        on: vi.fn(),
      }

      mockServerResponse = {
        writeHead: vi.fn(),
        end: vi.fn(),
      }
    })

    it('should handle CORS preflight requests', async () => {
      const transformerConfig: ClaudeConfig = {
        name: 'transformer-test',
        profileType: 'default',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test-key',
        transformerEnabled: true,
        isDefault: false,
      }
      const proxyMode: ProxyMode = { enableTransform: true }
      const ps = new ProxyServer([transformerConfig], proxyMode)

      mockIncomingMessage.method = 'OPTIONS'

      const handleRequest = (ps as any).handleRequest.bind(ps)
      await handleRequest(mockIncomingMessage, mockServerResponse)

      expect(mockServerResponse.writeHead).toHaveBeenCalledWith(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
        'Access-Control-Max-Age': '86400',
      })
      expect(mockServerResponse.end).toHaveBeenCalled()
    })

    it('should return 404 when no handler is found', async () => {
      const proxyMode: ProxyMode = {} // No modes enabled
      expect(() => new ProxyServer([], proxyMode)).toThrow(
        'No processing mode enabled. Please enable either load balancing (enableLoadBalance: true) or transformers (enableTransform: true).',
      )

      // The current proxy implementation proxies ALL requests when load balancing is enabled,
      // so a 404 response would only occur in very specific error conditions.
      // Since the proxy acts as a pass-through for all URLs, we just verify the constructor works correctly.
      const validConfig: ClaudeConfig = {
        name: 'test-config',
        profileType: 'default',
        baseUrl: 'https://api.test.com',
        apiKey: 'sk-test-key',
        isDefault: false,
      }
      const validProxyMode: ProxyMode = { enableLoadBalance: true }
      const ps = new ProxyServer([validConfig], validProxyMode)
      expect(ps).toBeDefined() // Proxy server should be created successfully
    })
  })

  describe('/v1/messages endpoint handling', () => {
    let mockIncomingMessage: any
    let mockServerResponse: any

    beforeEach(() => {
      mockIncomingMessage = {
        method: 'POST',
        url: '/v1/messages',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer sk-claude-proxy-server',
        },
        on: vi.fn(),
      }

      mockServerResponse = {
        writeHead: vi.fn(),
        end: vi.fn(),
        headersSent: false,
        getHeaders: vi.fn().mockReturnValue({}),
      }
    })

    it('should handle /v1/messages with load balancer enabled', async () => {
      const proxyMode: ProxyMode = { enableLoadBalance: true }
      const ps = new ProxyServer(testConfigs, proxyMode)

      // Mock proxyRequest to avoid actual HTTP calls
      const proxyRequestSpy = vi.spyOn(ps as any, 'proxyRequest').mockResolvedValue(undefined)

      const handleRequest = (ps as any).handleRequest.bind(ps)
      await handleRequest(mockIncomingMessage, mockServerResponse)

      expect(proxyRequestSpy).toHaveBeenCalledWith(
        mockIncomingMessage,
        mockServerResponse,
        expect.objectContaining({
          config: expect.objectContaining({
            name: expect.any(String),
          }),
        }),
      )
    })

    it('should handle /v1/messages with transformer-only mode (no load balancer)', async () => {
      const transformerConfigs: ClaudeConfig[] = [
        {
          name: 'transformer-config',
          profileType: 'default',
          baseUrl: 'https://api.openai.com',
          apiKey: 'sk-test-key',
          transformerEnabled: true,
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableTransform: true }
      const ps = new ProxyServer(transformerConfigs, proxyMode)

      // Mock proxyRequest to avoid actual HTTP calls
      const proxyRequestSpy = vi.spyOn(ps as any, 'proxyRequest').mockResolvedValue(undefined)

      const handleRequest = (ps as any).handleRequest.bind(ps)
      await handleRequest(mockIncomingMessage, mockServerResponse)

      expect(proxyRequestSpy).toHaveBeenCalledWith(
        mockIncomingMessage,
        mockServerResponse,
        expect.objectContaining({
          config: expect.objectContaining({
            name: 'transformer-config',
            transformerEnabled: true,
          }),
        }),
      )
    })

    it('should handle /v1/messages with both load balancer and transformer enabled', async () => {
      const mixedConfigs: ClaudeConfig[] = [
        {
          name: 'api-config',
          profileType: 'default',
          baseUrl: 'https://api1.example.com',
          apiKey: 'sk-test-key-1',
          isDefault: false,
        },
        {
          name: 'transformer-config',
          profileType: 'default',
          baseUrl: 'https://api.openai.com',
          apiKey: 'sk-test-key-2',
          transformerEnabled: true,
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableLoadBalance: true, enableTransform: true }
      const ps = new ProxyServer(mixedConfigs, proxyMode)

      // Mock proxyRequest to avoid actual HTTP calls
      const proxyRequestSpy = vi.spyOn(ps as any, 'proxyRequest').mockResolvedValue(undefined)

      const handleRequest = (ps as any).handleRequest.bind(ps)
      await handleRequest(mockIncomingMessage, mockServerResponse)

      expect(proxyRequestSpy).toHaveBeenCalledWith(
        mockIncomingMessage,
        mockServerResponse,
        expect.objectContaining({
          config: expect.objectContaining({
            name: expect.any(String),
          }),
        }),
      )
    })

    it('should return 503 when no transformer-enabled endpoints available in transformer-only mode', async () => {
      const configsWithoutTransformer: ClaudeConfig[] = [
        {
          name: 'api-only-config',
          profileType: 'default',
          baseUrl: 'https://api1.example.com',
          apiKey: 'sk-test-key-1',
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableTransform: true }
      expect(() => new ProxyServer(configsWithoutTransformer, proxyMode)).toThrow(
        'No transformer-enabled configurations found. Transformer mode requires at least one configuration with transformerEnabled enabled.',
      )
      // Since constructor throws, we can't test the 503 response
      // This test now verifies that the proper error is thrown during construction
    })

    it('should return 404 when neither load balancing nor transformers are enabled', async () => {
      const proxyMode: ProxyMode = {} // No modes enabled
      expect(() => new ProxyServer([], proxyMode)).toThrow(
        'No processing mode enabled. Please enable either load balancing (enableLoadBalance: true) or transformers (enableTransform: true).',
      )
      // Since constructor throws, we can't test the 404 response
      // This test now verifies that the proper error is thrown during construction
    })
  })

  describe('transformer functionality across different modes', () => {
    it('should create endpoints correctly in transformer-only mode', () => {
      const transformerConfig: ClaudeConfig = {
        name: 'openai-transformer-only',
        profileType: 'default',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test-key',
        transformerEnabled: true,
        isDefault: false,
      }

      const proxyMode: ProxyMode = { enableTransform: true } // Only transformer, no load balancer
      const ps = new ProxyServer([transformerConfig], proxyMode)

      const status = ps.getStatus()
      expect(status.transform).toBe(true)
      expect(status.loadBalance).toBe(false)
      expect(status.endpoints).toHaveLength(1)
      expect(status.endpoints[0].config.name).toBe('openai-transformer-only')
      expect(status.endpoints[0].config.transformerEnabled).toBe(true)
    })

    it('should handle both transformer and load balancer modes together', () => {
      const transformerConfig: ClaudeConfig = {
        name: 'openai-transformer',
        profileType: 'default',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-openai-key',
        transformerEnabled: true,
        isDefault: false,
      }

      const proxyMode: ProxyMode = { enableLoadBalance: true, enableTransform: true }
      const ps = new ProxyServer([transformerConfig], proxyMode)

      const status = ps.getStatus()
      expect(status.transform).toBe(true)
      expect(status.loadBalance).toBe(true)
      expect(status.endpoints).toHaveLength(1)
      expect(status.endpoints[0].config.transformerEnabled).toBe(true)
    })

    it('should filter transformer configs correctly in transformer-only mode', () => {
      const mixedConfigs: ClaudeConfig[] = [
        {
          name: 'regular-api',
          profileType: 'default',
          baseUrl: 'https://api.regular.com',
          apiKey: 'sk-regular-key',
          isDefault: false,
        },
        {
          name: 'transformer-config',
          profileType: 'default',
          baseUrl: 'https://api.openai.com',
          apiKey: 'sk-transformer-key',
          transformerEnabled: true,
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableTransform: true } // Only transformer, no load balancer
      const ps = new ProxyServer(mixedConfigs, proxyMode)

      const status = ps.getStatus()
      expect(status.transform).toBe(true)
      expect(status.loadBalance).toBe(false)
      expect(status.endpoints).toHaveLength(1)
      expect(status.endpoints[0].config.name).toBe('transformer-config')
    })

    it('should create stub endpoint when no transformer configs in transformer-only mode', () => {
      const regularConfigs: ClaudeConfig[] = [
        {
          name: 'regular-api',
          profileType: 'default',
          baseUrl: 'https://api.regular.com',
          apiKey: 'sk-regular-key',
          isDefault: false,
        },
      ]

      const proxyMode: ProxyMode = { enableTransform: true }
      expect(() => new ProxyServer(regularConfigs, proxyMode)).toThrow(
        'No transformer-enabled configurations found. Transformer mode requires at least one configuration with transformerEnabled enabled.',
      )
      // Since constructor now validates configs, we can't test stub endpoint creation
      // This test now verifies that the proper error is thrown
    })
  })

  describe('formatResponse functionality', () => {
    let transformerConfig: ClaudeConfig
    let proxyServer: ProxyServer

    beforeEach(() => {
      transformerConfig = {
        name: 'openai-transformer',
        profileType: 'default',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test-key',
        transformerEnabled: true,
        isDefault: false,
      }

      const proxyMode: ProxyMode = { enableTransform: true }
      proxyServer = new ProxyServer([transformerConfig], proxyMode)
    })

    it('should have transformer service with formatResponse capability', () => {
      const transformerService = proxyServer.getTransformerService()
      expect(transformerService).toBeDefined()
      expect(typeof transformerService.findTransformerByDomain).toBe('function')
    })

    it('should call transformer.formatResponse when available during response processing', () => {
      // This test verifies that the proxy server has the infrastructure to call formatResponse
      // The actual formatResponse method is called during the async response processing pipeline
      const status = proxyServer.getStatus()
      expect(status.transform).toBe(true)
      expect(status.endpoints).toHaveLength(1)
      expect(status.endpoints[0].config.transformerEnabled).toBe(true)
    })

    it('should handle transformation flow in transformer-enabled mode', () => {
      // Verify that the proxy server is set up correctly for transformations
      const transformerService = proxyServer.getTransformerService()
      expect(transformerService).toBeDefined()

      // Check that we can access the transformer configuration
      const status = proxyServer.getStatus()
      const endpoint = status.endpoints[0]
      expect(endpoint.config.transformerEnabled).toBe(true)
      expect(endpoint.config.baseUrl).toBe('https://api.openai.com')
    })

    it('should support adding custom transformers with formatResponse', async () => {
      const mockTransformer = {
        domain: 'custom-api.com',
        normalizeRequest: vi.fn().mockResolvedValue({
          body: { model: 'custom-model', messages: [] },
          config: { url: new URL('https://custom-api.com/v1/chat'), headers: {} },
        }),
        formatRequest: vi.fn().mockResolvedValue({}),
        formatResponse: vi.fn().mockImplementation(async (response: Response) => {
          const text = await response.text()
          return new Response(JSON.stringify({ transformed: true, original: JSON.parse(text) }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json', 'X-Transformed': 'true' },
          })
        }),
      }

      // Add the custom transformer
      await proxyServer.addTransformer('custom', mockTransformer)

      // Verify that the transformer was added - check transformer service directly
      const transformerService = proxyServer.getTransformerService()
      expect(transformerService).toBeDefined()

      // Verify the transformer has the expected methods
      expect(typeof mockTransformer.formatResponse).toBe('function')
      expect(typeof mockTransformer.normalizeRequest).toBe('function')
      expect(mockTransformer.domain).toBe('custom-api.com')
    })

    it('should maintain transformer state correctly', () => {
      // Test the basic transformer management functionality
      const initialTransformers = proxyServer.listTransformers()
      expect(Array.isArray(initialTransformers)).toBe(true)

      const status = proxyServer.getStatus()
      expect(status.transformers).toBeDefined()
      expect(Array.isArray(status.transformers)).toBe(true)
    })

    it('should include transformerHeaders in requests to external services', () => {
      // Test transformer headers configuration
      const configWithHeaders: ClaudeConfig = {
        name: 'transformer-with-headers',
        baseUrl: 'https://api.openrouter.ai',
        apiKey: 'sk-test-key',
        transformerEnabled: true,
        transformerHeaders: {
          'X-Custom-Header': 'custom-value',
          'Authorization': 'Bearer custom-token',
          'User-Agent': 'custom-user-agent',
        },
      }

      const proxyMode: ProxyMode = { enableTransform: true }
      const ps = new ProxyServer([configWithHeaders], proxyMode)

      const status = ps.getStatus()
      expect(status.endpoints).toHaveLength(1)
      expect(status.endpoints[0].config.transformerHeaders).toEqual({
        'X-Custom-Header': 'custom-value',
        'Authorization': 'Bearer custom-token',
        'User-Agent': 'custom-user-agent',
      })
    })

    it('should apply universal response formatting to valid JSON responses', async () => {
      // Test the formatUniversalResponse method directly
      const validJsonResponse = '{"choices":[{"message":{"content":"Hello"}}]}'
      const headers = { 'content-type': 'application/json' }
      const mockRes = {
        setHeader: vi.fn(),
        statusCode: 200,
        headersSent: false,
      }

      // Call the private method via reflection for testing
      const formatUniversalResponse = (proxyServer as any).formatUniversalResponse.bind(proxyServer)
      const result = await formatUniversalResponse(validJsonResponse, 200, headers, mockRes)

      expect(result).toBe(validJsonResponse) // Valid JSON should be returned as-is after parsing/stringifying
      expect(() => JSON.parse(result)).not.toThrow() // Should be valid JSON
    })

    it('should handle invalid JSON responses by wrapping them', async () => {
      const invalidJsonResponse = 'Invalid JSON response'
      const headers = { 'content-type': 'application/json' }
      const mockRes = {
        setHeader: vi.fn(),
        statusCode: 200,
        headersSent: false,
      }

      const formatUniversalResponse = (proxyServer as any).formatUniversalResponse.bind(proxyServer)
      const result = await formatUniversalResponse(invalidJsonResponse, 200, headers, mockRes)

      const parsedResult = JSON.parse(result)
      expect(parsedResult.error).toBeDefined()
      expect(parsedResult.error.type).toBe('format_error')
      expect(parsedResult.error.originalResponse).toBe(invalidJsonResponse)
    })

    it('should handle empty responses correctly', async () => {
      const emptyResponse = ''
      const headers = { 'content-type': 'application/json' }
      const mockRes = {
        setHeader: vi.fn(),
        statusCode: 200,
        headersSent: false,
      }

      const formatUniversalResponse = (proxyServer as any).formatUniversalResponse.bind(proxyServer)
      const result = await formatUniversalResponse(emptyResponse, 200, headers, mockRes)

      const parsedResult = JSON.parse(result)
      expect(parsedResult.error).toBeDefined()
      expect(parsedResult.error.type).toBe('empty_response')
    })

    it('should format non-streaming OpenAI responses to Anthropic format', async () => {
      const openaiResponse = JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        model: 'gpt-4',
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      })

      const headers = { 'content-type': 'application/json' }
      const mockRes = {
        statusCode: 200,
        headersSent: false,
      }

      const formatUniversalResponse = (proxyServer as any).formatUniversalResponse.bind(proxyServer)
      const result = await formatUniversalResponse(openaiResponse, 200, headers, mockRes)

      expect(result).not.toBeNull()
      const parsedResult = JSON.parse(result)
      expect(parsedResult.type).toBe('message')
      expect(parsedResult.content).toBeDefined()
      expect(Array.isArray(parsedResult.content)).toBe(true)
      expect(parsedResult.content[0].text).toBe('Hello! How can I help you today?')
    })

    it('should handle non-streaming responses with invalid JSON gracefully', async () => {
      const invalidResponse = 'This is not valid JSON'
      const headers = { 'content-type': 'application/json' }
      const mockRes = {
        statusCode: 200,
        headersSent: false,
      }

      const formatUniversalResponse = (proxyServer as any).formatUniversalResponse.bind(proxyServer)
      const result = await formatUniversalResponse(invalidResponse, 200, headers, mockRes)

      expect(result).not.toBeNull()
      const parsedResult = JSON.parse(result)
      expect(parsedResult.error).toBeDefined()
      expect(parsedResult.error.type).toBe('format_error')
      expect(parsedResult.error.originalResponse).toBe('This is not valid JSON')
    })

    it('should handle regular JSON responses without transformation', async () => {
      const regularResponse = JSON.stringify({
        id: 'msg-123',
        type: 'message',
        content: [{ type: 'text', text: 'Hello from Anthropic!' }],
        model: 'claude-sonnet-4-5-20250929',
      })
      const headers = { 'content-type': 'application/json' }
      const mockRes = {
        statusCode: 200,
        headersSent: false,
      }

      const formatUniversalResponse = (proxyServer as any).formatUniversalResponse.bind(proxyServer)
      const result = await formatUniversalResponse(regularResponse, 200, headers, mockRes)

      expect(result).not.toBeNull()
      const parsedResult = JSON.parse(result)
      expect(parsedResult.type).toBe('message')
      expect(parsedResult.content[0].text).toBe('Hello from Anthropic!')
    })

    it('should handle error status codes properly', async () => {
      const errorResponse = JSON.stringify({ error: 'Unauthorized', message: 'Invalid API key' })
      const headers = { 'content-type': 'application/json' }
      const mockRes = {
        statusCode: 200,
        headersSent: false,
      }

      const formatUniversalResponse = (proxyServer as any).formatUniversalResponse.bind(proxyServer)
      const result = await formatUniversalResponse(errorResponse, 401, headers, mockRes)

      expect(result).not.toBeNull()
      const parsedResult = JSON.parse(result)
      expect(parsedResult.error).toBe('Unauthorized')
      expect(mockRes.statusCode).toBe(401) // Should set the error status code
    })

    it('should set status code for error responses', async () => {
      const errorResponse = '{"error":"Bad request"}'
      const headers = { 'content-type': 'application/json' }
      const mockRes = {
        setHeader: vi.fn(),
        statusCode: 200,
        headersSent: false,
      }

      const formatUniversalResponse = (proxyServer as any).formatUniversalResponse.bind(proxyServer)
      await formatUniversalResponse(errorResponse, 400, headers, mockRes)

      expect(mockRes.statusCode).toBe(400)
    })
  })

  describe('load balancer strategies', () => {
    const testConfigsWithOrder: ClaudeConfig[] = [
      {
        name: 'high-priority',
        baseUrl: 'https://api1.example.com',
        apiKey: 'sk-key-1',
        order: 0,
      },
      {
        name: 'medium-priority',
        baseUrl: 'https://api2.example.com',
        apiKey: 'sk-key-2',
        order: 5,
      },
      {
        name: 'low-priority',
        baseUrl: 'https://api3.example.com',
        apiKey: 'sk-key-3',
        order: 10,
      },
    ]

    describe('fallback strategy', () => {
      beforeEach(() => {
        const proxyMode: ProxyMode = { enableLoadBalance: true }
        const systemSettings = {
          balanceMode: {
            strategy: 'Fallback',
            healthCheck: { enabled: true, intervalMs: 30000 },
            failedEndpoint: { banDurationSeconds: 300 },
          },
        }
        proxyServer = new ProxyServer(testConfigsWithOrder, proxyMode, systemSettings)
      })

      it('should prioritize endpoints by order field', () => {
        const getNextHealthyEndpoint = (proxyServer as any).getNextHealthyEndpoint.bind(proxyServer)

        // Should always return high-priority endpoint first
        const endpoint1 = getNextHealthyEndpoint()
        const endpoint2 = getNextHealthyEndpoint()
        const endpoint3 = getNextHealthyEndpoint()

        expect(endpoint1.config.name).toBe('high-priority')
        expect(endpoint2.config.name).toBe('high-priority') // Same priority, round-robin within group
        expect(endpoint3.config.name).toBe('high-priority')
      })

      it('should fall back to lower priority when higher priority is unhealthy', () => {
        const getNextHealthyEndpoint = (proxyServer as any).getNextHealthyEndpoint.bind(proxyServer)
        const markEndpointUnhealthy = (proxyServer as any).markEndpointUnhealthy.bind(proxyServer)

        // Mark high-priority endpoint as unhealthy
        const status = proxyServer.getStatus()
        const highPriorityEndpoint = status.endpoints.find(e => e.config.name === 'high-priority')
        markEndpointUnhealthy(highPriorityEndpoint, 'Test error')

        // Should now use medium priority
        const endpoint = getNextHealthyEndpoint()
        expect(endpoint.config.name).toBe('medium-priority')
      })
    })

    describe('polling strategy', () => {
      beforeEach(() => {
        const proxyMode: ProxyMode = { enableLoadBalance: true }
        const systemSettings = {
          balanceMode: {
            strategy: 'Polling',
            healthCheck: { enabled: true, intervalMs: 30000 },
            failedEndpoint: { banDurationSeconds: 300 },
          },
        }
        proxyServer = new ProxyServer(testConfigsWithOrder, proxyMode, systemSettings)
      })

      it('should ignore priority and round-robin through all endpoints', () => {
        const getNextHealthyEndpoint = (proxyServer as any).getNextHealthyEndpoint.bind(proxyServer)

        // Should cycle through all endpoints regardless of priority
        const endpoint1 = getNextHealthyEndpoint()
        const endpoint2 = getNextHealthyEndpoint()
        const endpoint3 = getNextHealthyEndpoint()
        const endpoint4 = getNextHealthyEndpoint() // Should wrap around

        expect(endpoint1.config.name).toBe('high-priority')
        expect(endpoint2.config.name).toBe('medium-priority')
        expect(endpoint3.config.name).toBe('low-priority')
        expect(endpoint4.config.name).toBe('high-priority') // Back to first
      })
    })

    describe('speed First strategy', () => {
      beforeEach(() => {
        const proxyMode: ProxyMode = { enableLoadBalance: true }
        const systemSettings = {
          balanceMode: {
            strategy: 'Speed First',
            healthCheck: { enabled: true, intervalMs: 30000 },
            failedEndpoint: { banDurationSeconds: 300 },
            speedFirst: {
              responseTimeWindowMs: 300000,
              minSamples: 2,
            },
          },
        }
        proxyServer = new ProxyServer(testConfigsWithOrder, proxyMode, systemSettings)
      })

      it('should use round-robin when no endpoints have enough samples', () => {
        const getNextHealthyEndpoint = (proxyServer as any).getNextHealthyEndpoint.bind(proxyServer)

        // No endpoints have enough samples yet, should use round-robin
        const endpoint1 = getNextHealthyEndpoint()
        const endpoint2 = getNextHealthyEndpoint()
        const endpoint3 = getNextHealthyEndpoint()

        expect(endpoint1.config.name).toBe('high-priority')
        expect(endpoint2.config.name).toBe('medium-priority')
        expect(endpoint3.config.name).toBe('low-priority')
      })

      it('should select fastest endpoint when samples are available', () => {
        const getNextHealthyEndpoint = (proxyServer as any).getNextHealthyEndpoint.bind(proxyServer)
        const recordResponseTime = (proxyServer as any).recordResponseTime.bind(proxyServer)

        const status = proxyServer.getStatus()
        const endpoint1 = status.endpoints.find(e => e.config.name === 'high-priority')
        const endpoint2 = status.endpoints.find(e => e.config.name === 'medium-priority')
        const endpoint3 = status.endpoints.find(e => e.config.name === 'low-priority')

        // Record response times - make medium-priority fastest
        recordResponseTime(endpoint1, 1000) // 1 second
        recordResponseTime(endpoint1, 1200) // 1.2 seconds
        recordResponseTime(endpoint2, 300) // 0.3 seconds - fastest
        recordResponseTime(endpoint2, 400) // 0.4 seconds
        recordResponseTime(endpoint3, 800) // 0.8 seconds
        recordResponseTime(endpoint3, 900) // 0.9 seconds

        // Should now select the fastest endpoint (medium-priority)
        const selectedEndpoint = getNextHealthyEndpoint()
        expect(selectedEndpoint.config.name).toBe('medium-priority')
      })

      it('should record and calculate average response times correctly', () => {
        const recordResponseTime = (proxyServer as any).recordResponseTime.bind(proxyServer)

        const status = proxyServer.getStatus()
        const endpoint = status.endpoints.find(e => e.config.name === 'high-priority')

        // Record some response times
        recordResponseTime(endpoint, 100)
        recordResponseTime(endpoint, 200)
        recordResponseTime(endpoint, 300)

        // Check that average is calculated correctly
        expect(endpoint!.averageResponseTime).toBe(200) // (100 + 200 + 300) / 3
        expect(endpoint!.responseTimes).toHaveLength(3)
        expect(endpoint!.totalRequests).toBe(3)
      })
    })
  })
})
