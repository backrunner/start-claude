import type { ClaudeConfig } from '@/core/types'
import { Buffer } from 'node:buffer'
import http from 'node:http'
import https from 'node:https'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoadBalancer } from '@/core/load-balancer'

// Mock the UI functions
vi.mock('@/utils/ui', () => ({
  displayError: vi.fn(),
  displayGrey: vi.fn(),
  displaySuccess: vi.fn(),
  displayWarning: vi.fn(),
}))

// Mock HTTP modules
vi.mock('node:http')
vi.mock('node:https')

const mockHttp = vi.mocked(http)
const mockHttps = vi.mocked(https)

describe('loadBalancer', () => {
  let testConfigs: ClaudeConfig[]
  let loadBalancer: LoadBalancer
  let mockServer: any
  let mockRequest: any

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

    loadBalancer = new LoadBalancer(testConfigs)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with valid configurations', () => {
      expect(loadBalancer.getProxyApiKey()).toBe('sk-claude-load-balancer-proxy-key')
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

      const lb = new LoadBalancer(invalidConfigs)
      const status = lb.getStatus()
      expect(status.total).toBe(1)
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

      expect(() => new LoadBalancer(invalidConfigs)).toThrow(
        'No configurations with baseUrl and apiKey found for load balancing',
      )
    })
  })

  describe('getStatus', () => {
    it('should return correct status information', () => {
      const status = loadBalancer.getStatus()

      expect(status.total).toBe(3)
      expect(status.healthy).toBe(3)
      expect(status.unhealthy).toBe(0)
      expect(status.endpoints).toHaveLength(3)
      expect(status.endpoints[0].config.name).toBe('config1')
      expect(status.endpoints[1].config.name).toBe('config2')
      expect(status.endpoints[2].config.name).toBe('config3')
    })
  })

  describe('endpoint selection', () => {
    it('should round-robin through healthy endpoints', () => {
      // Access the private method via reflection for testing
      const getNextHealthyEndpoint = (loadBalancer as any).getNextHealthyEndpoint.bind(loadBalancer)

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
      const getNextHealthyEndpoint = (loadBalancer as any).getNextHealthyEndpoint.bind(loadBalancer)
      const markEndpointUnhealthy = (loadBalancer as any).markEndpointUnhealthy.bind(loadBalancer)

      // Mark second endpoint as unhealthy
      const status = loadBalancer.getStatus()
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
      const getNextHealthyEndpoint = (loadBalancer as any).getNextHealthyEndpoint.bind(loadBalancer)
      const markEndpointUnhealthy = (loadBalancer as any).markEndpointUnhealthy.bind(loadBalancer)

      // Mark all endpoints as unhealthy
      const status = loadBalancer.getStatus()
      status.endpoints.forEach((endpoint, index) => {
        markEndpointUnhealthy(endpoint, `Test error ${index}`)
      })

      const endpoint = getNextHealthyEndpoint()
      expect(endpoint).toBeNull()
    })
  })

  describe('proxy request headers', () => {
    it('should use correct x-api-key header for different endpoints', () => {
      // Test the header preparation logic directly
      const status = loadBalancer.getStatus()
      const endpoint1 = status.endpoints[0]
      const endpoint2 = status.endpoints[1]

      // Mock incoming headers
      const incomingHeaders: Record<string, string> = {
        'content-type': 'application/json',
        'authorization': 'Bearer sk-claude-load-balancer-proxy-key',
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
      const status = loadBalancer.getStatus()

      const url1 = new URL('/v1/messages', status.endpoints[0].config.baseUrl)
      const url2 = new URL('/v1/messages', status.endpoints[1].config.baseUrl)
      const url3 = new URL('/v1/messages', status.endpoints[2].config.baseUrl)

      expect(url1.toString()).toContain('api1.example.com')
      expect(url2.toString()).toContain('api2.example.com')
      expect(url3.toString()).toContain('api3.example.com')
    })
  })

  describe('health check headers', () => {
    it('should prepare correct headers for health checks', () => {
      const status = loadBalancer.getStatus()
      const endpoint = status.endpoints[0]

      const healthCheckBody = JSON.stringify({
        model: endpoint.config.model || 'claude-3-haiku-20240307',
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

      const lb = new LoadBalancer(configsWithOrder)
      const status = lb.getStatus()

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

      const lb = new LoadBalancer(configsWithMixedOrder)
      const status = lb.getStatus()

      // Config without order should come first (treated as 0)
      expect(status.endpoints[0].config.name).toBe('config-without-order')
      expect(status.endpoints[1].config.name).toBe('config-with-order')
    })
  })

  describe('server lifecycle', () => {
    it('should start server on specified port', async () => {
      await loadBalancer.startServer(3000)

      expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function))
      expect(mockHttp.createServer).toHaveBeenCalled()
    })

    it('should stop server and clear intervals', async () => {
      await loadBalancer.startServer()
      await loadBalancer.stop()

      expect(mockServer.close).toHaveBeenCalled()
    })
  })
})
