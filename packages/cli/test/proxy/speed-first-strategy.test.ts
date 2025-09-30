import type { ClaudeConfig } from '../../src/config/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoadBalancerStrategy, SpeedTestStrategy } from '../../src/config/types'
import { ProxyServer } from '../../src/core/proxy'
import { SpeedTestManager } from '../../src/utils/network/speed-test'

// Mock configs for testing
const mockConfigs: ClaudeConfig[] = [
  {
    name: 'fast-endpoint',
    baseUrl: 'https://fast-api.example.com',
    apiKey: 'test-key-1',
    model: 'claude-3-haiku-20241022',
    order: 1,
  },
  {
    name: 'slow-endpoint',
    baseUrl: 'https://slow-api.example.com',
    apiKey: 'test-key-2',
    model: 'claude-3-haiku-20241022',
    order: 2,
  },
  {
    name: 'medium-endpoint',
    baseUrl: 'https://medium-api.example.com',
    apiKey: 'test-key-3',
    model: 'claude-3-haiku-20241022',
    order: 3,
  },
]

// Mock system settings for Speed First
const mockSpeedFirstSettings = {
  balanceMode: {
    enableByDefault: true,
    strategy: LoadBalancerStrategy.SpeedFirst,
    healthCheck: {
      enabled: true,
      intervalMs: 30000,
    },
    failedEndpoint: {
      banDurationSeconds: 300,
    },
    speedFirst: {
      responseTimeWindowMs: 300000,
      minSamples: 2,
      speedTestIntervalSeconds: 5, // 5 seconds for testing
      speedTestStrategy: SpeedTestStrategy.ResponseTime,
    },
  },
}

describe('speed First Load Balancer Strategy', () => {
  let proxyServer: ProxyServer
  let originalConsoleLog: typeof console.log

  beforeEach(() => {
    // Mock console.log to reduce test noise
    originalConsoleLog = console.log
    console.log = vi.fn()
  })

  afterEach(async () => {
    // Restore console.log
    console.log = originalConsoleLog

    if (proxyServer) {
      await proxyServer.stop()
    }
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('speed Test Manager', () => {
    it('should create speed test manager with different strategies', () => {
      const responseTimeManager = SpeedTestManager.fromConfig(SpeedTestStrategy.ResponseTime)
      const headRequestManager = SpeedTestManager.fromConfig(SpeedTestStrategy.HeadRequest)
      const pingManager = SpeedTestManager.fromConfig(SpeedTestStrategy.Ping)

      expect(responseTimeManager).toBeInstanceOf(SpeedTestManager)
      expect(headRequestManager).toBeInstanceOf(SpeedTestManager)
      expect(pingManager).toBeInstanceOf(SpeedTestManager)
    })

    it('should handle endpoint speed testing with mocked responses', async () => {
      // Mock HTTP requests
      const mockHttpRequest = vi.fn()
      const mockResponse = {
        statusCode: 200,
        resume: vi.fn(),
        on: vi.fn(),
      }

      vi.doMock('node:https', () => ({
        request: mockHttpRequest.mockImplementation((url, options, callback) => {
          // Simulate different response times based on endpoint
          setTimeout(() => {
            callback(mockResponse)
          }, url.hostname.includes('fast') ? 50 : 200)

          return {
            on: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
            destroy: vi.fn(),
          }
        }),
      }))

      const speedTestManager = SpeedTestManager.fromConfig(SpeedTestStrategy.ResponseTime, {
        timeout: 5000,
        verbose: false,
        debug: true,
      })

      const result = await speedTestManager.testEndpointSpeed(mockConfigs[0])

      expect(result.strategy).toBe(SpeedTestStrategy.ResponseTime)
      expect(typeof result.responseTime).toBe('number')
      expect(typeof result.success).toBe('boolean')
    })

    it('should test multiple endpoints concurrently', async () => {
      const speedTestManager = SpeedTestManager.fromConfig(SpeedTestStrategy.ResponseTime, {
        timeout: 5000,
        verbose: true,
        debug: true,
      })

      // Mock the testEndpointSpeed method to return predictable results
      speedTestManager.testEndpointSpeed = vi.fn().mockImplementation(async (endpoint: ClaudeConfig) => {
        // Simulate different response times based on endpoint name
        let responseTime: number
        if (endpoint.name?.includes('fast')) {
          responseTime = 50
        }
        else if (endpoint.name?.includes('slow')) {
          responseTime = 300
        }
        else {
          responseTime = 150
        }

        return {
          responseTime,
          success: true,
          strategy: SpeedTestStrategy.ResponseTime,
        }
      })

      const results = await speedTestManager.testMultipleEndpoints(mockConfigs)

      expect(results.size).toBe(3)
      expect(results.get('fast-endpoint')?.responseTime).toBe(50)
      expect(results.get('slow-endpoint')?.responseTime).toBe(300)
      expect(results.get('medium-endpoint')?.responseTime).toBe(150)

      // Test fastest endpoint detection
      const fastest = SpeedTestManager.getFastestEndpoint(results)
      expect(fastest).toBe('fast-endpoint')
    })
  })

  describe('proxy Server Speed First Integration', () => {
    it('should initialize with Speed First strategy', () => {
      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true }, mockSpeedFirstSettings)

      const status = proxyServer.getStatus()
      expect(status.strategy).toBe(LoadBalancerStrategy.SpeedFirst)
      expect(status.loadBalance).toBe(true)
      expect(status.total).toBe(3)
    })

    it('should collect response times during requests', async () => {
      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true }, mockSpeedFirstSettings)

      // Mock the internal endpoint selection to track response times
      const endpoints = (proxyServer as any).endpoints
      expect(endpoints).toHaveLength(3)

      // Simulate adding response times to endpoints
      const fastEndpoint = endpoints.find((e: any) => e.config.name === 'fast-endpoint')
      const slowEndpoint = endpoints.find((e: any) => e.config.name === 'slow-endpoint')
      const mediumEndpoint = endpoints.find((e: any) => e.config.name === 'medium-endpoint')

      // Add multiple samples to meet minSamples requirement
      fastEndpoint.responseTimes = [45, 50, 48, 52, 46]
      slowEndpoint.responseTimes = [280, 300, 290, 310, 295]
      mediumEndpoint.responseTimes = [140, 150, 145, 155, 148]

      // Update averages
      fastEndpoint.averageResponseTime = 48.2
      slowEndpoint.averageResponseTime = 295
      mediumEndpoint.averageResponseTime = 147.6

      // Test endpoint selection - should select fastest
      const selectedEndpoint = (proxyServer as any).selectEndpointSpeedFirst(endpoints)
      expect(selectedEndpoint.config.name).toBe('fast-endpoint')
    })

    it('should handle endpoint failures and trigger immediate speed tests', async () => {
      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true, verbose: true }, mockSpeedFirstSettings)

      const endpoints = (proxyServer as any).endpoints
      const fastEndpoint = endpoints.find((e: any) => e.config.name === 'fast-endpoint')

      // Initially mark as healthy with good response times
      fastEndpoint.isHealthy = true
      fastEndpoint.responseTimes = [50, 45, 52]
      fastEndpoint.averageResponseTime = 49

      // Simulate endpoint failure
      const triggerSpeedTestSpy = vi.spyOn(proxyServer as any, 'triggerImmediateSpeedTest')
      ;(proxyServer as any).markEndpointUnhealthy(fastEndpoint, 'Connection timeout')

      expect(fastEndpoint.isHealthy).toBe(false)
      expect(triggerSpeedTestSpy).toHaveBeenCalled()
    })

    it('should switch to next fastest endpoint when current fails', async () => {
      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true, verbose: true }, mockSpeedFirstSettings)

      const endpoints = (proxyServer as any).endpoints

      // Set up initial response times - fast endpoint is fastest
      endpoints[0].responseTimes = [50, 45, 48] // fast-endpoint
      endpoints[0].averageResponseTime = 47.7
      endpoints[0].isHealthy = true

      endpoints[1].responseTimes = [150, 145, 155] // slow-endpoint
      endpoints[1].averageResponseTime = 150
      endpoints[1].isHealthy = true

      endpoints[2].responseTimes = [100, 95, 105] // medium-endpoint
      endpoints[2].averageResponseTime = 100
      endpoints[2].isHealthy = true

      // Should select fastest endpoint initially
      let selectedEndpoint = (proxyServer as any).selectEndpointSpeedFirst(endpoints)
      expect(selectedEndpoint.config.name).toBe('fast-endpoint')

      // Mark fastest endpoint as unhealthy
      endpoints[0].isHealthy = false

      // Should now select second fastest (medium-endpoint)
      selectedEndpoint = (proxyServer as any).selectEndpointSpeedFirst(
        endpoints.filter((e: any) => e.isHealthy),
      )
      expect(selectedEndpoint.config.name).toBe('medium-endpoint')
    })

    it('should fall back to round-robin when insufficient samples', async () => {
      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true }, mockSpeedFirstSettings)

      const endpoints = (proxyServer as any).endpoints

      // Set up endpoints with insufficient samples (less than minSamples = 2)
      endpoints[0].responseTimes = [50] // Only 1 sample
      endpoints[0].averageResponseTime = 50
      endpoints[0].isHealthy = true

      endpoints[1].responseTimes = [] // No samples
      endpoints[1].averageResponseTime = 0
      endpoints[1].isHealthy = true

      endpoints[2].responseTimes = [100] // Only 1 sample
      endpoints[2].averageResponseTime = 100
      endpoints[2].isHealthy = true

      // Should fall back to round-robin selection
      const selectedEndpoint = (proxyServer as any).selectEndpointSpeedFirst(endpoints)

      // Should select one of the endpoints (round-robin behavior)
      expect(['fast-endpoint', 'slow-endpoint', 'medium-endpoint']).toContain(selectedEndpoint.config.name)
    })
  })

  describe('speed Test Strategies', () => {
    it('should support different speed test strategies', () => {
      const strategies = [
        SpeedTestStrategy.ResponseTime,
        SpeedTestStrategy.HeadRequest,
        SpeedTestStrategy.Ping,
      ]

      strategies.forEach((strategy) => {
        const manager = SpeedTestManager.fromConfig(strategy, {
          timeout: 5000,
          verbose: false,
          debug: true,
        })

        expect(manager).toBeInstanceOf(SpeedTestManager)
      })
    })

    it('should handle speed test strategy configuration in proxy server', () => {
      const settingsWithPingStrategy = {
        ...mockSpeedFirstSettings,
        balanceMode: {
          ...mockSpeedFirstSettings.balanceMode,
          speedFirst: {
            ...mockSpeedFirstSettings.balanceMode.speedFirst,
            speedTestStrategy: SpeedTestStrategy.Ping,
          },
        },
      }

      proxyServer = new ProxyServer(
        mockConfigs,
        { enableLoadBalance: true },
        settingsWithPingStrategy,
      )

      // Verify the configuration is applied
      const speedFirstConfig = (proxyServer as any).speedFirstConfig
      expect(speedFirstConfig.speedTestIntervalSeconds).toBe(5)
    })
  })

  describe('real Scenario Testing', () => {
    it('should handle realistic endpoint switching scenario', async () => {
      // Create proxy with realistic settings
      const realisticSettings = {
        balanceMode: {
          enableByDefault: true,
          strategy: LoadBalancerStrategy.SpeedFirst,
          healthCheck: {
            enabled: true,
            intervalMs: 30000,
          },
          failedEndpoint: {
            banDurationSeconds: 300,
          },
          speedFirst: {
            responseTimeWindowMs: 300000,
            minSamples: 3,
            speedTestIntervalSeconds: 60,
            speedTestStrategy: SpeedTestStrategy.ResponseTime,
          },
        },
      }

      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true, verbose: true }, realisticSettings)

      const endpoints = (proxyServer as any).endpoints

      // Scenario 1: All endpoints start healthy, collect initial data
      endpoints.forEach((endpoint: any, index: number) => {
        endpoint.isHealthy = true
        // Simulate different baseline performance
        const baseTimes = [60, 200, 120] // fast, slow, medium
        endpoint.responseTimes = Array.from({ length: 5 }).fill(0).map(() => baseTimes[index] + Math.random() * 20 - 10)
        endpoint.averageResponseTime = endpoint.responseTimes.reduce((a: number, b: number) => a + b, 0) / endpoint.responseTimes.length
      })

      // Initial selection should be fastest
      let selected = (proxyServer as any).getNextHealthyEndpoint()
      expect(selected?.config.name).toBe('fast-endpoint')

      // Scenario 2: Fastest endpoint degrades in performance
      const fastEndpoint = endpoints[0]
      fastEndpoint.responseTimes = [150, 160, 155, 165, 158] // Now slower than medium
      fastEndpoint.averageResponseTime = 157.6

      // Should switch to medium endpoint (now fastest)
      selected = (proxyServer as any).getNextHealthyEndpoint()
      expect(selected?.config.name).toBe('medium-endpoint')

      // Scenario 3: Current endpoint fails completely
      const mediumEndpoint = endpoints[2]
      ;(proxyServer as any).markEndpointUnhealthy(mediumEndpoint, 'Connection refused')

      // Should switch to remaining healthy endpoint
      const healthyEndpoints = endpoints.filter((e: any) => e.isHealthy)
      expect(healthyEndpoints).toHaveLength(2)

      selected = (proxyServer as any).getNextHealthyEndpoint()
      expect(['fast-endpoint', 'slow-endpoint']).toContain(selected?.config.name)

      // Scenario 4: Failed endpoint recovers with better performance
      mediumEndpoint.isHealthy = true
      mediumEndpoint.responseTimes = [40, 42, 38, 45, 41] // Now fastest
      mediumEndpoint.averageResponseTime = 41.2

      // Should switch back to recovered endpoint (now fastest)
      selected = (proxyServer as any).getNextHealthyEndpoint()
      expect(selected?.config.name).toBe('medium-endpoint')
    })

    it('should handle interval reset on endpoint failure', async () => {
      vi.useFakeTimers()

      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true }, mockSpeedFirstSettings)

      // Mock the interval methods
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

      await proxyServer.startServer(12345)

      // Trigger immediate speed test (which clears and resets interval)
      ;(proxyServer as any).triggerImmediateSpeedTest()

      expect(clearIntervalSpy).toHaveBeenCalled()
      expect(setIntervalSpy).toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('error Handling and Edge Cases', () => {
    it('should handle all endpoints being unhealthy', async () => {
      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true }, mockSpeedFirstSettings)

      const endpoints = (proxyServer as any).endpoints

      // Mark all endpoints as unhealthy
      endpoints.forEach((endpoint: any) => {
        endpoint.isHealthy = false
      })

      const selected = (proxyServer as any).getNextHealthyEndpoint()
      expect(selected).toBeNull()
    })

    it('should handle speed test failures gracefully', async () => {
      const speedTestManager = SpeedTestManager.fromConfig(SpeedTestStrategy.ResponseTime, {
        timeout: 100, // Very short timeout to force failures
        verbose: false,
        debug: true,
      })

      // Mock the endpoint speed test to always fail
      speedTestManager.testEndpointSpeed = vi.fn().mockResolvedValue({
        responseTime: Number.POSITIVE_INFINITY,
        success: false,
        error: 'Timeout',
        strategy: SpeedTestStrategy.ResponseTime,
      })

      const results = await speedTestManager.testMultipleEndpoints([mockConfigs[0]])

      expect(results.size).toBe(1)
      expect(results.get('fast-endpoint')?.success).toBe(false)
      expect(results.get('fast-endpoint')?.responseTime).toBe(Number.POSITIVE_INFINITY)
    })

    it('should handle empty endpoint list', async () => {
      const speedTestManager = SpeedTestManager.fromConfig(SpeedTestStrategy.ResponseTime)
      const results = await speedTestManager.testMultipleEndpoints([])

      expect(results.size).toBe(0)
    })

    it('should handle invalid speed test strategy', async () => {
      const speedTestManager = SpeedTestManager.fromConfig('invalid-strategy' as SpeedTestStrategy)

      const result = await speedTestManager.testEndpointSpeed(mockConfigs[0])

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown speed test strategy')
    })
  })

  describe('performance and Optimization', () => {
    it('should handle large numbers of endpoints efficiently', async () => {
      // Create 50 mock endpoints
      const manyEndpoints: ClaudeConfig[] = Array.from({ length: 50 }).fill(0).map((_, i) => ({
        name: `endpoint-${i}`,
        baseUrl: `https://api-${i}.example.com`,
        apiKey: `test-key-${i}`,
        model: 'claude-3-haiku-20241022',
        order: i,
      }))

      const speedTestManager = SpeedTestManager.fromConfig(SpeedTestStrategy.ResponseTime, {
        timeout: 5000,
        verbose: false,
        debug: false,
      })

      // Mock the test method to return quick results
      speedTestManager.testEndpointSpeed = vi.fn().mockImplementation(async (_endpoint: ClaudeConfig) => ({
        responseTime: Math.random() * 1000,
        success: true,
        strategy: SpeedTestStrategy.ResponseTime,
      }))

      const startTime = performance.now()
      const results = await speedTestManager.testMultipleEndpoints(manyEndpoints)
      const endTime = performance.now()

      expect(results.size).toBe(50)
      expect(endTime - startTime).toBeLessThan(1000) // Should complete in under 1 second with mocking
    })

    it('should maintain response time history efficiently', () => {
      proxyServer = new ProxyServer(mockConfigs, { enableLoadBalance: true }, mockSpeedFirstSettings)

      const endpoints = (proxyServer as any).endpoints
      const endpoint = endpoints[0]

      // Add many response times (simulate the 100+ limit mentioned in code)
      const responseTimes = Array.from({ length: 150 }).fill(0).map(() => Math.random() * 1000)
      responseTimes.forEach((time) => {
        ;(proxyServer as any).recordResponseTime(endpoint, time)
      })

      // Should limit the array size to prevent unbounded growth
      expect(endpoint.responseTimes.length).toBeLessThanOrEqual(100)
      expect(endpoint.averageResponseTime).toBeGreaterThan(0)
    })
  })
})
