import type { ClaudeConfig } from './types'
import { Buffer } from 'node:buffer'
import http from 'node:http'
import https from 'node:https'
import { displayError, displayGrey, displaySuccess, displayWarning } from '../utils/ui'

const log = console.log

interface EndpointStatus {
  config: ClaudeConfig
  isHealthy: boolean
  lastCheck: number
  failureCount: number
  lastError?: string
}

export class LoadBalancer {
  private endpoints: EndpointStatus[] = []
  private currentIndex = 0
  private server?: http.Server
  private healthCheckInterval?: NodeJS.Timeout
  private proxyApiKey: string

  constructor(configs: ClaudeConfig[]) {
    // Filter configs that have baseUrl (only these can be load balanced)
    const validConfigs = configs.filter(c => c.baseUrl && c.apiKey)

    if (validConfigs.length === 0) {
      throw new Error('No configurations with baseUrl and apiKey found for load balancing')
    }

    this.endpoints = validConfigs.map(config => ({
      config,
      isHealthy: true,
      lastCheck: 0,
      failureCount: 0,
    }))

    // Use a fixed API key that will be used by Claude Code
    this.proxyApiKey = 'sk-claude-load-balancer-proxy-key'
  }

  getProxyApiKey(): string {
    return this.proxyApiKey
  }

  async startServer(port = 2333): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res)
      })

      this.server.listen(port, () => {
        displaySuccess(`🚀 Load balancer proxy server started on port ${port}`)

        // Start health checks
        this.startHealthChecks()
        resolve()
      })

      this.server.on('error', (error) => {
        displayError(`❌ Failed to start proxy server: ${error.message}`)
        reject(error)
      })
    })
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // No need to validate API key - it's just a stub value for Claude Code
      // Claude Code requires some API key to be present, but we'll substitute the real ones

      // Get the next healthy endpoint
      const endpoint = this.getNextHealthyEndpoint()
      if (!endpoint) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: {
            message: 'All endpoints are currently unavailable',
            type: 'service_unavailable',
          },
        }))
        return
      }

      await this.proxyRequest(req, res, endpoint)
    }
    catch (error) {
      displayError(`⚠️ Request handling error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: {
          message: 'Internal server error',
          type: 'internal_error',
        },
      }))
    }
  }

  private getNextHealthyEndpoint(): EndpointStatus | null {
    const healthyEndpoints = this.endpoints.filter(e => e.isHealthy)

    if (healthyEndpoints.length === 0) {
      return null
    }

    // Simple round-robin selection among healthy endpoints
    const endpoint = healthyEndpoints[this.currentIndex % healthyEndpoints.length]
    this.currentIndex = (this.currentIndex + 1) % healthyEndpoints.length

    return endpoint
  }

  private async proxyRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    endpoint: EndpointStatus,
  ): Promise<void> {
    const targetUrl = new URL(req.url || '/', endpoint.config.baseUrl)

    // Collect request body
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))

    req.on('end', () => {
      void (async () => {
        try {
          const body = Buffer.concat(chunks)

          // Prepare headers for the upstream request
          const headers = { ...req.headers }

          // Replace the x-api-key header with the real API key
          headers['x-api-key'] = endpoint.config.apiKey
          delete headers.authorization

          // Fix Host header to match the target server
          headers.host = targetUrl.host

          // Remove hop-by-hop headers
          delete headers.connection
          delete headers['proxy-connection']
          delete headers['transfer-encoding']
          delete headers.upgrade

          const options = {
            method: req.method,
            headers,
            timeout: 30000, // 30 second timeout
          }

          const isHttps = targetUrl.protocol === 'https:'
          const httpModule = isHttps ? https : http

          const proxyReq = httpModule.request(targetUrl, options, (proxyRes) => {
          // Forward status and headers
            const responseHeaders = { ...proxyRes.headers }
            delete responseHeaders.connection
            delete responseHeaders['transfer-encoding']

            res.writeHead(proxyRes.statusCode || 200, responseHeaders)

            // Forward response body
            proxyRes.pipe(res)

            // Mark endpoint as healthy on successful response
            if (proxyRes.statusCode && proxyRes.statusCode < 500) {
              this.markEndpointHealthy(endpoint)
            }
            else if (proxyRes.statusCode && proxyRes.statusCode >= 500) {
              this.markEndpointUnhealthy(endpoint, `HTTP ${proxyRes.statusCode}`)
            }
          })

          proxyReq.on('error', (error) => {
            this.markEndpointUnhealthy(endpoint, error.message)

            // For retry, we need to create a new request instead of reusing the consumed one
            if (!res.headersSent) {
              const retryEndpoint = this.getNextHealthyEndpoint()
              if (retryEndpoint && retryEndpoint !== endpoint) {
                // Create a new proxy request with the same data
                void this.retryRequest(req.method || 'GET', req.url || '/', { ...req.headers }, body, res, retryEndpoint)
                return
              }

              // No healthy endpoints available
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                error: {
                  message: `Upstream server error: ${error.message}`,
                  type: 'upstream_error',
                },
              }))
            }
          })

          proxyReq.on('timeout', () => {
            this.markEndpointUnhealthy(endpoint, 'Request timeout')
            proxyReq.destroy()
          })

          // Send the request body
          if (body.length > 0) {
            proxyReq.write(body)
          }

          proxyReq.end()
        }
        catch (error) {
          this.markEndpointUnhealthy(endpoint, error instanceof Error ? error.message : 'Unknown error')

          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              error: {
                message: 'Proxy request failed',
                type: 'proxy_error',
              },
            }))
          }
        }
      })()
    })
  }

  private async retryRequest(
    method: string,
    url: string,
    originalHeaders: http.IncomingHttpHeaders,
    body: Buffer,
    res: http.ServerResponse,
    endpoint: EndpointStatus,
  ): Promise<void> {
    const targetUrl = new URL(url, endpoint.config.baseUrl)

    // Prepare headers for the upstream request
    const headers = { ...originalHeaders }

    // Replace the x-api-key header with the real API key
    headers['x-api-key'] = endpoint.config.apiKey
    delete headers.authorization

    // Fix Host header to match the target server
    headers.host = targetUrl.host

    // Remove hop-by-hop headers
    delete headers.connection
    delete headers['proxy-connection']
    delete headers['transfer-encoding']
    delete headers.upgrade

    const options = {
      method,
      headers,
      timeout: 30000, // 30 second timeout
    }

    const isHttps = targetUrl.protocol === 'https:'
    const httpModule = isHttps ? https : http

    const proxyReq = httpModule.request(targetUrl, options, (proxyRes) => {
      // Forward status and headers
      const responseHeaders = { ...proxyRes.headers }
      delete responseHeaders.connection
      delete responseHeaders['transfer-encoding']

      res.writeHead(proxyRes.statusCode || 200, responseHeaders)

      // Forward response body
      proxyRes.pipe(res)

      // Mark endpoint as healthy on successful response
      if (proxyRes.statusCode && proxyRes.statusCode < 500) {
        this.markEndpointHealthy(endpoint)
      }
      else if (proxyRes.statusCode && proxyRes.statusCode >= 500) {
        this.markEndpointUnhealthy(endpoint, `HTTP ${proxyRes.statusCode}`)
      }
    })

    proxyReq.on('error', (error) => {
      this.markEndpointUnhealthy(endpoint, error.message)

      // No more retries - send error response
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: {
            message: `Upstream server error: ${error.message}`,
            type: 'upstream_error',
          },
        }))
      }
    })

    proxyReq.on('timeout', () => {
      this.markEndpointUnhealthy(endpoint, 'Request timeout')
      proxyReq.destroy()
    })

    // Send the request body
    if (body.length > 0) {
      proxyReq.write(body)
    }

    proxyReq.end()
  }

  private markEndpointHealthy(endpoint: EndpointStatus): void {
    endpoint.isHealthy = true
    endpoint.failureCount = 0
    endpoint.lastError = undefined
  }

  private markEndpointUnhealthy(endpoint: EndpointStatus, error: string): void {
    endpoint.isHealthy = false
    endpoint.failureCount++
    endpoint.lastError = error
    endpoint.lastCheck = Date.now()
  }

  private startHealthChecks(): void {
    // Check unhealthy endpoints every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      void this.performHealthChecks()
    }, 30000)
  }

  private async performHealthChecks(): Promise<void> {
    const unhealthyEndpoints = this.endpoints.filter(e => !e.isHealthy)

    for (const endpoint of unhealthyEndpoints) {
      // Only check if it's been at least 30 seconds since last check
      if (Date.now() - endpoint.lastCheck < 30000) {
        continue
      }

      try {
        await this.healthCheck(endpoint)
      }
      catch {
        // Health check failed, but we already marked it as unhealthy
        endpoint.lastCheck = Date.now()
      }
    }
  }

  private async healthCheck(endpoint: EndpointStatus): Promise<void> {
    return new Promise((resolve, reject) => {
      const healthUrl = new URL('/v1/messages', endpoint.config.baseUrl)

      const healthCheckBody = JSON.stringify({
        model: endpoint.config.model || 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'ping',
        }],
      })

      const options = {
        method: 'POST',
        headers: {
          'x-api-key': endpoint.config.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(healthCheckBody),
        },
        timeout: 10000,
      }

      const isHttps = healthUrl.protocol === 'https:'
      const httpModule = isHttps ? https : http

      const req = httpModule.request(healthUrl, options, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          this.markEndpointHealthy(endpoint)
          resolve()
        }
        else {
          endpoint.lastCheck = Date.now()
          reject(new Error(`Health check failed with status ${res.statusCode}`))
        }

        // Consume response to free up the socket
        res.resume()
      })

      req.on('error', (error) => {
        endpoint.lastCheck = Date.now()
        reject(error)
      })

      req.on('timeout', () => {
        endpoint.lastCheck = Date.now()
        req.destroy()
        reject(new Error('Health check timeout'))
      })

      // Send the health check request body
      req.write(healthCheckBody)
      req.end()
    })
  }

  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          resolve()
        })
      })
    }
  }

  getStatus(): { total: number, healthy: number, unhealthy: number, endpoints: EndpointStatus[] } {
    const healthy = this.endpoints.filter(e => e.isHealthy).length
    return {
      total: this.endpoints.length,
      healthy,
      unhealthy: this.endpoints.length - healthy,
      endpoints: this.endpoints,
    }
  }

  async performInitialHealthChecks(): Promise<void> {
    let hasShownQuietMessage = false

    for (let i = 0; i < this.endpoints.length; i++) {
      const endpoint = this.endpoints[i]
      const configName = endpoint.config.name || endpoint.config.baseUrl

      try {
        if (i === 0 && !hasShownQuietMessage) {
          displayGrey('🔍 Testing endpoints...')
          hasShownQuietMessage = true
        }
        await this.initialHealthCheck(endpoint)

        // If first endpoint is healthy, we can proceed
        if (i === 0) {
          return
        }
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Parse HTTP status code from error message if available
        const statusMatch = errorMessage.match(/status (\d+)/)
        const statusCode = statusMatch ? statusMatch[1] : null

        if (statusCode) {
          displayError(`❌ ${configName} - HTTP ${statusCode}: ${this.getStatusMessage(statusCode)}`)
        }
        else {
          displayError(`❌ ${configName} - ${errorMessage}`)
        }

        this.markEndpointUnhealthy(endpoint, errorMessage)

        // If first endpoint failed, try the next one
        if (i === 0) {
          displayWarning(`First endpoint failed, trying alternatives...`)
          continue
        }
      }
    }

    // Check if we have any healthy endpoints left
    const healthyCount = this.endpoints.filter(e => e.isHealthy).length
    if (healthyCount === 0) {
      log()
      displayError('❌ All endpoints failed initial health checks!')
      displayWarning('⚠️ Load balancer will continue but may not work properly')
      log()
    }
  }

  private async initialHealthCheck(endpoint: EndpointStatus): Promise<void> {
    return new Promise((resolve, reject) => {
      const healthUrl = new URL('/v1/messages', endpoint.config.baseUrl)

      const healthCheckBody = JSON.stringify({
        model: endpoint.config.model || 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'ping',
        }],
      })

      const options = {
        method: 'POST',
        headers: {
          'x-api-key': endpoint.config.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(healthCheckBody),
        },
        timeout: 15000, // 15 second timeout for initial check
      }

      const isHttps = healthUrl.protocol === 'https:'
      const httpModule = isHttps ? https : http

      const req = httpModule.request(healthUrl, options, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve()
        }
        else {
          reject(new Error(`Health check failed with status ${res.statusCode}`))
        }

        // Consume response to free up the socket
        res.resume()
      })

      req.on('error', (error) => {
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Health check timeout (15s)'))
      })

      // Send the health check request body
      req.write(healthCheckBody)
      req.end()
    })
  }

  private getStatusMessage(statusCode: string): string {
    const code = Number.parseInt(statusCode)
    switch (code) {
      case 400: return 'Bad Request - Invalid request format'
      case 401: return 'Unauthorized - Invalid API key'
      case 403: return 'Forbidden - Access denied'
      case 404: return 'Not Found - Endpoint not available'
      case 429: return 'Rate Limited - Too many requests'
      case 500: return 'Internal Server Error'
      case 502: return 'Bad Gateway - Server unavailable'
      case 503: return 'Service Unavailable'
      case 504: return 'Gateway Timeout'
      default: return `HTTP Error ${code}`
    }
  }
}
