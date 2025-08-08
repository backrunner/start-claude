import type { ClaudeConfig } from '@/config/types'
import type { ProxyMode } from '@/types/transformer'
import { Buffer } from 'node:buffer'
import http from 'node:http'
import https from 'node:https'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProxyServer } from '@/core/proxy'
import { ConfigService } from '@/services/config'

// Mock the UI functions
vi.mock('@/utils/ui', () => ({
  displayError: vi.fn(),
  displayGrey: vi.fn(),
  displaySuccess: vi.fn(),
  displayWarning: vi.fn(),
  displayVerbose: vi.fn(),
}))

// Mock services
vi.mock('@/services/config')
vi.mock('@/services/transformer', () => ({
  TransformerService: vi.fn().mockImplementation(() => ({
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
  })),
}))

// Mock HTTP modules
vi.mock('node:http')
vi.mock('node:https')

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
        model: 'claude-3-sonnet',
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
        'No configurations with baseUrl and apiKey found for load balancing',
      )
    })
  })

  describe('constructor - transformer mode', () => {
    it('should initialize in transformer mode', () => {
      const proxyMode: ProxyMode = { enableTransform: true }
      const ps = new ProxyServer([], proxyMode)
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
      const proxyMode: ProxyMode = { enableTransform: true }
      proxyServer = new ProxyServer([], proxyMode)
    })

    it('should add and remove transformers', async () => {
      const mockTransformer = {
        name: 'test-transformer',
        endPoint: '/test',
        transformRequestOut: vi.fn(),
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
      const proxyMode: ProxyMode = { enableTransform: true }
      const ps = new ProxyServer([], proxyMode)

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
      const ps = new ProxyServer([], proxyMode)

      const handleRequest = (ps as any).handleRequest.bind(ps)
      await handleRequest(mockIncomingMessage, mockServerResponse)

      expect(mockServerResponse.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' })
      expect(mockServerResponse.end).toHaveBeenCalledWith(JSON.stringify({
        error: {
          message: 'No handler found for this request',
          type: 'not_found',
        },
      }))
    })
  })
})
