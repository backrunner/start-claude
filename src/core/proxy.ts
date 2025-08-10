import type { ClaudeConfig } from '../config/types'
import type { ProxyConfig, ProxyMode, Transformer } from '../types/transformer'
import { Buffer } from 'node:buffer'
import * as http from 'node:http'
import * as https from 'node:https'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { ConfigService } from '../services/config'
import { TransformerService } from '../services/transformer'
import { displayError, displayGrey, displaySuccess, displayVerbose, displayWarning } from '../utils/ui'

const log = console.log

interface EndpointStatus {
  config: ClaudeConfig
  isHealthy: boolean
  lastCheck: number
  failureCount: number
  lastError?: string
  bannedUntil?: number // Timestamp when ban expires
}

export class ProxyServer {
  private endpoints: EndpointStatus[] = []
  private currentIndex = 0
  private server?: http.Server
  private healthCheckInterval?: NodeJS.Timeout
  private healthCheckIntervalMs: number = 30000 // Default 30 seconds
  private healthCheckEnabled: boolean = true
  private failedEndpointBanDurationSeconds: number = 300 // Default 5 minutes
  private proxyApiKey: string = 'sk-claude-proxy-server'
  private transformerService: TransformerService
  private configService: ConfigService
  private proxyMode: ProxyMode
  private enableLoadBalance: boolean = false
  private enableTransform: boolean = false
  private verbose: boolean = false
  private proxyUrl?: string
  private httpAgent?: http.Agent
  private httpsAgent?: https.Agent

  constructor(configs: ClaudeConfig[] | ProxyConfig[], proxyMode?: ProxyMode, systemSettings?: any, proxyUrl?: string) {
    this.proxyMode = proxyMode || {}
    this.verbose = this.proxyMode.verbose || false
    this.proxyUrl = proxyUrl

    // Initialize proxy agents if proxy URL is provided
    if (this.proxyUrl) {
      this.httpAgent = new HttpProxyAgent(this.proxyUrl)
      this.httpsAgent = new HttpsProxyAgent(this.proxyUrl)
      displayVerbose(`Proxy configured: ${this.proxyUrl}`, this.verbose)
    }

    // Apply system settings for balance mode
    if (systemSettings?.balanceMode) {
      this.healthCheckIntervalMs = systemSettings.balanceMode.healthCheck?.intervalMs || 30000
      this.healthCheckEnabled = systemSettings.balanceMode.healthCheck?.enabled !== false
      this.failedEndpointBanDurationSeconds = systemSettings.balanceMode.failedEndpoint?.banDurationSeconds || 300
    }

    // Initialize services
    this.configService = new ConfigService()
    this.transformerService = new TransformerService(this.configService, this.verbose)

    // Set modes - both can be enabled at the same time
    this.enableLoadBalance = this.proxyMode.enableLoadBalance || false
    this.enableTransform = this.proxyMode.enableTransform || false

    displayVerbose(`Initializing proxy server - LoadBalance: ${this.enableLoadBalance}, Transform: ${this.enableTransform}`, this.verbose)

    // If load balancing is enabled, set up endpoints
    if (this.enableLoadBalance) {
      // Include configs that either have API credentials OR transformer enabled
      // The proxy will handle fallback logic for transformer-only configs
      const validConfigs = configs.filter((c) => {
        const hasApiCredentials = c.baseUrl && c.apiKey
        // Type guard to check if config has transformerEnabled property
        const hasTransformerEnabled = 'transformerEnabled' in c && c.transformerEnabled === true
        return hasApiCredentials || hasTransformerEnabled
      })

      if (validConfigs.length === 0) {
        throw new Error('No configurations found for load balancing (need either API credentials or transformer enabled)')
      }

      displayVerbose(`Found ${validConfigs.length} valid configs for load balancing`, this.verbose)

      // Sort configs by order (lower numbers first), with undefined order treated as highest priority (0)
      validConfigs.sort((a, b) => {
        const orderA = a.order ?? 0
        const orderB = b.order ?? 0
        return orderA - orderB
      })

      this.endpoints = validConfigs.map(config => ({
        config,
        isHealthy: true,
        lastCheck: 0,
        failureCount: 0,
      }))
    }
    else {
      // Create a single stub endpoint for Claude Code compatibility
      this.endpoints = [{
        config: {
          name: 'proxy-server',
          baseUrl: 'http://localhost:2333',
          apiKey: this.proxyApiKey,
          model: 'claude-3-haiku-20240307',
        } as ClaudeConfig,
        isHealthy: true,
        lastCheck: 0,
        failureCount: 0,
      }]
    }

    displayVerbose(`Initialized with ${this.endpoints.length} endpoint(s)`, this.verbose)
  }

  private getAgent(isHttps: boolean): http.Agent | https.Agent | undefined {
    if (this.proxyUrl) {
      return isHttps ? this.httpsAgent : this.httpAgent
    }
    return undefined
  }

  async initialize(): Promise<void> {
    if (this.enableTransform) {
      await this.transformerService.initialize()
      displaySuccess('🔧 Transformer service initialized')
    }
  }

  getProxyApiKey(): string {
    return this.proxyApiKey
  }

  async startServer(port = 2333): Promise<void> {
    // Initialize transformer service if needed
    if (this.enableTransform) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res)
      })

      this.server.listen(port, () => {
        const features = []
        if (this.enableLoadBalance)
          features.push('Load Balancer')
        if (this.enableTransform)
          features.push('Transformer')

        const featureText = features.length > 0 ? ` (${features.join(' + ')})` : ''
        displaySuccess(`🚀 Proxy server started on port ${port}${featureText}`)

        // Start health checks only if load balancing is enabled and health checks are enabled
        if (this.enableLoadBalance && this.healthCheckEnabled) {
          this.startHealthChecks()
        }
        resolve()
      })

      this.server.on('error', (error) => {
        displayError(`❌ Failed to start proxy server: ${error.message}`)
        reject(error)
      })
    })
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    console.log('handle req', req.url)
    try {
      // Handle CORS preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
          'Access-Control-Max-Age': '86400',
        })
        res.end()
        return
      }

      displayVerbose(`Handling ${req.method} ${req.url}`, this.verbose)

      // All requests go to load balancer now, which will handle both regular and transformer endpoints
      if (this.enableLoadBalance) {
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
      else {
        // Single endpoint mode - no load balancing
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: {
            message: 'No handler found for this request',
            type: 'not_found',
          },
        }))
      }
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

  /**
   * Forward transformed request to the actual API endpoint
   */
  private async forwardTransformedRequest(
    originalReq: http.IncomingMessage,
    res: http.ServerResponse,
    transformedRequest: any,
    targetConfig: ClaudeConfig,
  ): Promise<void> {
    try {
      const targetUrl = new URL(originalReq.url || '/', targetConfig.baseUrl)

      const requestBody = JSON.stringify(transformedRequest)

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody).toString(),
        'x-api-key': targetConfig.apiKey!,
        'User-Agent': originalReq.headers['user-agent'] || 'start-claude-transformer-proxy',
      }

      const isHttps = targetUrl.protocol === 'https:'
      const httpModule = isHttps ? https : http

      const options = {
        method: originalReq.method || 'POST',
        headers,
        timeout: 60000, // 60 second timeout
        agent: this.getAgent(isHttps),
      }

      const proxyReq = httpModule.request(targetUrl, options, (proxyRes) => {
        // Forward status and headers
        const responseHeaders = { ...proxyRes.headers }
        delete responseHeaders.connection
        delete responseHeaders['transfer-encoding']

        // Add CORS headers
        responseHeaders['Access-Control-Allow-Origin'] = '*'
        responseHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        responseHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-api-key'

        res.writeHead(proxyRes.statusCode || 200, responseHeaders)

        // Forward response body
        proxyRes.pipe(res)
      })

      proxyReq.on('error', (error) => {
        displayError(`⚠️ Transformer proxy request error: ${error.message}`)

        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            error: {
              message: `Transformer proxy request failed: ${error.message}`,
              type: 'proxy_error',
            },
          }))
        }
      })

      proxyReq.on('timeout', () => {
        displayError('⚠️ Transformer proxy request timeout')
        proxyReq.destroy()
      })

      // Send the transformed request body
      proxyReq.write(requestBody)
      proxyReq.end()
    }
    catch (error) {
      displayError(`⚠️ Transformer forwarding error: ${error instanceof Error ? error.message : 'Unknown error'}`)

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: {
            message: 'Transformer request forwarding failed',
            type: 'transformer_forwarding_error',
          },
        }))
      }
    }
  }

  private getNextHealthyEndpoint(): EndpointStatus | null {
    const now = Date.now()

    // Filter out banned endpoints and unhealthy endpoints
    const availableEndpoints = this.endpoints.filter((e) => {
      // If health checks are disabled, check if ban has expired
      if (!this.healthCheckEnabled && e.bannedUntil) {
        if (now < e.bannedUntil) {
          return false // Still banned
        }
        else {
          // Ban expired, mark as healthy
          e.isHealthy = true
          e.bannedUntil = undefined
        }
      }

      return e.isHealthy
    })

    if (availableEndpoints.length === 0) {
      return null
    }

    // Simple round-robin selection among available endpoints
    const endpoint = availableEndpoints[this.currentIndex % availableEndpoints.length]
    this.currentIndex = (this.currentIndex + 1) % availableEndpoints.length

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
          let requestData: any = {}

          // Parse request body to check for transformer requirements
          if (body.length > 0) {
            try {
              requestData = JSON.parse(body.toString())
            }
            catch {
              // If we can't parse JSON, just continue with regular proxy
              displayVerbose('Could not parse request JSON for transformer check', this.verbose)
            }
          }

          // Check if this endpoint has transformer enabled and we have transformer service
          if (this.enableTransform && 'transformerEnabled' in endpoint.config && endpoint.config.transformerEnabled) {
            displayVerbose(`Checking for transformer for endpoint: ${endpoint.config.baseUrl}`, this.verbose)
            const transformer = this.transformerService.findTransformerByDomain(endpoint.config.baseUrl)

            if (transformer) {
              // Find the transformer name for logging
              const transformerName = Array.from(this.transformerService.getAllTransformers().entries())
                .find(([, t]) => t === transformer)?.[0] || 'unknown'
              displayVerbose(`Found transformer for domain ${endpoint.config.baseUrl}: ${transformerName}`, this.verbose)

              // Transform request if transformer supports it
              let transformedRequest = requestData
              if (transformer.transformRequestOut) {
                transformedRequest = await transformer.transformRequestOut(requestData)
                displayVerbose(`Request transformed by ${transformer.domain || 'transformer'}`, this.verbose)
              }

              // Forward the transformed request to this endpoint's API
              if (endpoint.config.baseUrl && endpoint.config.apiKey) {
                await this.forwardTransformedRequest(req, res, transformedRequest, endpoint.config)
                return
              }
              else {
                // This is a transformer-only endpoint, find fallback with API credentials
                displayVerbose(`Endpoint ${endpoint.config.name} is transformer-only, looking for fallback`, this.verbose)

                const fallbackEndpoint = this.endpoints.find(e =>
                  e.isHealthy && e.config.baseUrl && e.config.apiKey && e !== endpoint,
                )

                if (fallbackEndpoint) {
                  displayVerbose(`Using fallback endpoint ${fallbackEndpoint.config.name}`, this.verbose)
                  await this.forwardTransformedRequest(req, res, transformedRequest, fallbackEndpoint.config)
                  return
                }
                else {
                  this.markEndpointUnhealthy(endpoint, 'No fallback endpoint available')

                  const nextEndpoint = this.getNextHealthyEndpoint()
                  if (nextEndpoint && nextEndpoint !== endpoint) {
                    void this.retryRequest(req.method || 'GET', req.url || '/', { ...req.headers }, body, res, nextEndpoint)
                    return
                  }

                  res.writeHead(503, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({
                    error: {
                      message: 'No available endpoints with API credentials for transformer fallback',
                      type: 'service_unavailable',
                    },
                  }))
                  return
                }
              }
            }
          }

          // Regular proxy request (no transformation)
          // Check if this endpoint has API credentials for regular requests
          if (!endpoint.config.baseUrl || !endpoint.config.apiKey) {
            displayVerbose(`Endpoint ${endpoint.config.name} has no API credentials, skipping`, this.verbose)
            this.markEndpointUnhealthy(endpoint, 'Missing API credentials')

            // Try next endpoint in rotation
            const nextEndpoint = this.getNextHealthyEndpoint()
            if (nextEndpoint && nextEndpoint !== endpoint) {
              displayVerbose(`Retrying with next endpoint: ${nextEndpoint.config.name}`, this.verbose)
              void this.retryRequest(req.method || 'GET', req.url || '/', { ...req.headers }, body, res, nextEndpoint)
              return
            }

            // No healthy endpoints available
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              error: {
                message: 'No endpoints with API credentials available',
                type: 'service_unavailable',
              },
            }))
            return
          }

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

          const isHttps = targetUrl.protocol === 'https:'
          const httpModule = isHttps ? https : http

          const options = {
            method: req.method,
            headers,
            timeout: 30000, // 30 second timeout
            agent: this.getAgent(isHttps),
          }

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

    const isHttps = targetUrl.protocol === 'https:'
    const httpModule = isHttps ? https : http

    const options = {
      method,
      headers,
      timeout: 30000, // 30 second timeout
      agent: this.getAgent(isHttps),
    }

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

    // If health checks are disabled, ban the endpoint for a duration
    if (!this.healthCheckEnabled) {
      endpoint.bannedUntil = Date.now() + (this.failedEndpointBanDurationSeconds * 1000)
      displayVerbose(`Endpoint ${endpoint.config.name} banned until ${new Date(endpoint.bannedUntil).toLocaleTimeString()}`, this.verbose)
    }
  }

  private startHealthChecks(): void {
    // Only start if health checks are enabled
    if (!this.healthCheckEnabled) {
      displayVerbose('Health checks disabled', this.verbose)
      return
    }

    // Check unhealthy endpoints at configured interval
    this.healthCheckInterval = setInterval(() => {
      void this.performHealthChecks()
    }, this.healthCheckIntervalMs)

    displayVerbose(`Health checks started with ${this.healthCheckIntervalMs}ms interval`, this.verbose)
  }

  private async performHealthChecks(): Promise<void> {
    if (!this.healthCheckEnabled) {
      return
    }

    const unhealthyEndpoints = this.endpoints.filter(e => !e.isHealthy)

    for (const endpoint of unhealthyEndpoints) {
      // Only check if it's been at least the configured interval since last check
      if (Date.now() - endpoint.lastCheck < this.healthCheckIntervalMs) {
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

      const isHttps = healthUrl.protocol === 'https:'
      const httpModule = isHttps ? https : http

      const options = {
        method: 'POST',
        headers: {
          'x-api-key': endpoint.config.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(healthCheckBody),
        },
        timeout: 10000,
        agent: this.getAgent(isHttps),
      }

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

  getStatus(): { total: number, healthy: number, unhealthy: number, endpoints: EndpointStatus[], loadBalance: boolean, transform: boolean, transformers?: string[] } {
    const healthy = this.endpoints.filter(e => e.isHealthy).length
    const result = {
      total: this.endpoints.length,
      healthy,
      unhealthy: this.endpoints.length - healthy,
      endpoints: this.endpoints,
      loadBalance: this.enableLoadBalance,
      transform: this.enableTransform,
    } as any

    if (this.enableTransform) {
      result.transformers = Array.from(this.transformerService.getAllTransformers().keys())
    }

    return result
  }

  async performInitialHealthChecks(): Promise<void> {
    // Skip health checks if load balancing is disabled
    if (!this.enableLoadBalance) {
      displaySuccess('🔧 Proxy ready - health checks skipped (load balancing disabled)')
      return
    }

    // Skip initial health checks if health checking is disabled
    if (!this.healthCheckEnabled) {
      displaySuccess('🔧 Proxy ready - health checks disabled, using ban system for failures')
      return
    }

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
        model: endpoint.config.model || 'claude-3-haiku-20241022',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'ping',
        }],
      })

      const isHttps = healthUrl.protocol === 'https:'
      const httpModule = isHttps ? https : http

      const options = {
        method: 'POST',
        headers: {
          'x-api-key': endpoint.config.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(healthCheckBody),
        },
        timeout: 15000, // 15 second timeout for initial check
        agent: this.getAgent(isHttps),
      }

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

  // Transformer management methods
  getTransformerService(): TransformerService {
    return this.transformerService
  }

  async addTransformer(name: string, transformer: Transformer): Promise<void> {
    this.transformerService.registerTransformer(name, transformer)
  }

  removeTransformer(name: string): boolean {
    return this.transformerService.removeTransformer(name)
  }

  listTransformers(): { name: string, hasDomain: boolean, domain?: string }[] {
    const transformers: { name: string, hasDomain: boolean, domain?: string }[] = []
    const entries = Array.from(this.transformerService.getAllTransformers().entries())

    for (const [name, transformer] of entries) {
      if (typeof transformer === 'object') {
        transformers.push({
          name,
          hasDomain: !!transformer.domain,
          domain: transformer.domain,
        })
      }
    }

    return transformers
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
