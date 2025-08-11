import type { ClaudeConfig } from '../config/types'
import type { LLMProvider } from '../types/llm'
import type { ProxyConfig, ProxyMode, Transformer } from '../types/transformer'
import { Buffer } from 'node:buffer'
import * as http from 'node:http'
import * as https from 'node:https'
import { PassThrough } from 'node:stream'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { ConfigService } from '../services/config'
import { TransformerService } from '../services/transformer'
import { fileLogger } from '../utils/file-logger'
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
  private debug: boolean = false
  private proxyUrl?: string
  private httpAgent?: http.Agent
  private httpsAgent?: https.Agent

  constructor(configs: ClaudeConfig[] | ProxyConfig[], proxyMode?: ProxyMode, systemSettings?: any, proxyUrl?: string) {
    this.proxyMode = proxyMode || {}
    this.verbose = this.proxyMode.verbose || false
    this.debug = this.proxyMode.debug || false
    this.proxyUrl = proxyUrl

    // Enable verbose mode automatically if debug mode is enabled
    if (this.debug && !this.verbose) {
      this.verbose = true
    }

    // Enable file logging if debug mode is on
    if (this.debug) {
      fileLogger.enable()
      fileLogger.info('PROXY', 'Debug logging enabled for proxy server')
      fileLogger.info('PROXY', `Verbose mode: ${this.verbose}`)
    }

    // Initialize proxy agents if proxy URL is provided
    if (this.proxyUrl) {
      this.httpAgent = new HttpProxyAgent(this.proxyUrl)
      this.httpsAgent = new HttpsProxyAgent(this.proxyUrl)
      displayVerbose(`Proxy configured: ${this.proxyUrl}`, this.verbose)
      fileLogger.debug('PROXY', `HTTP/HTTPS proxy configured: ${this.proxyUrl}`)
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
      // Note: transformer-enabled configs MUST have real external API credentials
      const validConfigs = configs.filter((c) => {
        const hasApiCredentials = c.baseUrl && c.apiKey
        const hasTransformerEnabled = 'transformerEnabled' in c && c.transformerEnabled === true

        if (hasTransformerEnabled && !hasApiCredentials) {
          throw new Error(`Configuration "${c.name}" has transformerEnabled=true but is missing baseUrl or apiKey. Transformer configurations must include the real external API credentials (e.g., https://openrouter.ai + real API key).`)
        }

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
      // Non-load balancer mode - but still need to handle transformer configs
      if (this.enableTransform) {
        // Filter for transformer-enabled configs - they MUST have real API credentials
        const transformerConfigs = configs.filter((c) => {
          const hasTransformerEnabled = 'transformerEnabled' in c && c.transformerEnabled === true
          const hasApiCredentials = c.baseUrl && c.apiKey

          if (hasTransformerEnabled && !hasApiCredentials) {
            throw new Error(`Configuration "${c.name}" has transformerEnabled=true but is missing baseUrl or apiKey. Transformer configurations must include the real external API credentials (e.g., https://openrouter.ai + real API key).`)
          }

          return hasTransformerEnabled
        })

        if (transformerConfigs.length > 0) {
          // Use transformer-enabled configs
          this.endpoints = transformerConfigs.map(config => ({
            config,
            isHealthy: true,
            lastCheck: 0,
            failureCount: 0,
          }))
        }
        else {
          throw new Error('No transformer-enabled configurations found. Transformer mode requires at least one configuration with transformerEnabled: true.')
        }
      }
      else {
        throw new Error('No processing mode enabled. Please enable either load balancing (enableLoadBalance: true) or transformers (enableTransform: true).')
      }
    }

    displayVerbose(`Initialized with ${this.endpoints.length} endpoint(s)`, this.verbose)
  }

  private formatUniversalResponse(
    responseBody: string,
    statusCode: number,
    headers: any,
    res: http.ServerResponse,
  ): string {
    try {
      // Check if it's a streaming response by looking at headers first
      const contentType = headers['content-type'] || headers['Content-Type'] || ''
      const isStream = contentType.includes('text/event-stream') || responseBody.startsWith('data: ')

      if (isStream) {
        // For streaming responses, set the appropriate headers only if not already sent
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')
        }
        return responseBody
      }

      // Set HTTP status code if response is not ok (non-2xx status codes) and headers not sent
      if (statusCode >= 400 && !res.headersSent) {
        res.statusCode = statusCode
      }

      // For non-streaming responses, check if empty first
      if (!responseBody.trim()) {
        return JSON.stringify({
          error: {
            message: 'Empty response from upstream',
            type: 'empty_response',
          },
        })
      }

      // Try to parse as JSON to validate
      const parsedBody = JSON.parse(responseBody)

      // Return the parsed and re-stringified JSON to ensure consistency
      return JSON.stringify(parsedBody)
    }
    catch (parseError) {
      // If response is not valid JSON, wrap it in a standard format
      if (this.debug) {
        fileLogger.error('RESPONSE_FORMAT_ERROR', 'Failed to parse response as JSON', {
          originalBody: responseBody,
          statusCode,
          parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
        })
      }

      // For streaming responses that failed to parse, return as-is
      const contentType = headers['content-type'] || headers['Content-Type'] || ''
      const isStream = contentType.includes('text/event-stream') || responseBody.startsWith('data: ')

      if (isStream) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')
        }
        return responseBody
      }

      // Return a standardized error response for non-streaming content
      return JSON.stringify({
        error: {
          message: 'Invalid response format from upstream',
          type: 'format_error',
          originalResponse: responseBody,
        },
      })
    }
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
    try {
      // Log incoming request if debug is enabled
      if (this.debug) {
        fileLogger.info('INCOMING_REQUEST', 'Received HTTP request', {
          method: req.method || 'UNKNOWN',
          url: req.url || '/',
          userAgent: req.headers['user-agent'] || 'unknown',
          contentType: req.headers['content-type'] || 'unknown',
          origin: req.headers.origin || 'unknown',
          headers: req.headers,
        })
      }

      // Handle CORS preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
          'Access-Control-Max-Age': '86400',
        })
        res.end()

        if (this.debug) {
          fileLogger.info('CORS_PREFLIGHT', 'Handled CORS preflight request', {
            method: req.method || 'OPTIONS',
            origin: req.headers.origin || 'unknown',
            requestHeaders: req.headers['access-control-request-headers'] || 'none',
            response: 'CORS preflight response sent',
          })
        }
        return
      }

      displayVerbose(`Handling ${req.method} ${req.url}`, this.verbose)

      // Handle requests - either through load balancer or transformer-only mode
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
      else if (this.enableTransform) {
        // Transformer-only mode - use the first transformer-enabled endpoint
        const transformerEndpoint = this.endpoints.find(e =>
          'transformerEnabled' in e.config && e.config.transformerEnabled === true,
        )

        if (!transformerEndpoint) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            error: {
              message: 'No transformer-enabled endpoints available',
              type: 'service_unavailable',
            },
          }))
          return
        }

        await this.proxyRequest(req, res, transformerEndpoint)
      }
      else {
        // No load balancing or transformers enabled
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

      // Log detailed request handling error
      if (this.debug) {
        fileLogger.error('REQUEST_HANDLING_ERROR', 'Exception caught in main request handler', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined,
          method: req.method || 'UNKNOWN',
          url: req.url || '/',
          userAgent: req.headers['user-agent'] || 'unknown',
          contentType: req.headers['content-type'] || 'unknown',
          origin: req.headers.origin || 'unknown',
        })
      }

      const errorResponse = {
        error: {
          message: 'Internal server error',
          type: 'internal_error',
        },
      }

      // Log detailed error response
      if (this.debug) {
        fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 500 error response due to request handling error', {
          statusCode: 500,
          errorType: 'internal_error',
          originalError: error instanceof Error ? error.message : 'Unknown error',
          responseBody: errorResponse,
        })
      }

      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(errorResponse))
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
    // Collect request body
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))

    req.on('end', () => {
      void (async () => {
        try {
          const body = Buffer.concat(chunks)
          let requestData: any = {}
          let bodyText: string | undefined

          // Parse request body once and cache the string representation
          if (body.length > 0) {
            try {
              bodyText = body.toString()
              requestData = JSON.parse(bodyText)

              // Log request body if debug is enabled
              if (this.debug) {
                fileLogger.info('INCOMING_REQUEST', 'Received request body for transformation', {
                  bodySize: body.length,
                  model: requestData.model,
                  messageCount: requestData.messages?.length || 0,
                  hasTools: requestData.tools ? requestData.tools.length : 0,
                  body: requestData,
                })
              }
            }
            catch {
              // If we can't parse JSON, just continue with regular proxy
              displayVerbose('Could not parse request JSON for transformer check', this.verbose)
              if (this.debug) {
                fileLogger.info('REQUEST_PARSE_ERROR', 'Received non-JSON request body', {
                  bodySize: body.length,
                  contentType: req.headers['content-type'] || 'unknown',
                  body: bodyText || body.toString(),
                })
              }
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

              // Create provider for transformer using the real external API credentials
              // The endpoint.config should contain the actual API credentials for the external service
              const provider: LLMProvider = {
                name: endpoint.config.name || 'unknown',
                baseUrl: endpoint.config.baseUrl || `https://${transformer.domain}`,
                apiKey: endpoint.config.apiKey || '',
                model: endpoint.config.model || '',
              }

              // Validate that we have proper credentials for the transformer
              if (!provider.baseUrl || !provider.apiKey) {
                throw new Error(`Transformer-enabled endpoint "${endpoint.config.name}" requires both baseUrl and apiKey for the external API`)
              }

              // Step 1: Normalize request (Claude → Intermediate format with config)
              if (!transformer.normalizeRequest) {
                throw new Error(`Transformer ${transformerName} is missing normalizeRequest method`)
              }
              const normalizeResult = await transformer.normalizeRequest(requestData, provider)

              // Step 2: Format request (Intermediate → Provider-specific format)
              let finalRequest = normalizeResult.body
              if (transformer.formatRequest) {
                finalRequest = await transformer.formatRequest(normalizeResult.body)
                displayVerbose(`Request formatted by ${transformer.domain || 'transformer'}`, this.verbose)

                if (this.debug) {
                  fileLogger.logTransform('FORMAT_REQUEST', transformerName, normalizeResult.body, finalRequest)
                }
              }
              else {
                displayVerbose(`Request normalized by ${transformer.domain || 'transformer'}`, this.verbose)

                if (this.debug) {
                  fileLogger.logTransform('NORMALIZE_REQUEST', transformerName, requestData, finalRequest)
                }
              }

              // Cache the stringified request
              const requestBody = JSON.stringify(finalRequest)

              // Log the final transformed request body to file logger
              if (this.debug) {
                fileLogger.info('TRANSFORM_COMPLETE', 'Request transformation completed', {
                  transformerName,
                  originalModel: requestData.model,
                  targetProvider: provider.name,
                  bodySize: requestBody.length,
                  body: finalRequest,
                })
              }

              const targetUrl = normalizeResult.config.url
              const headers = {
                ...normalizeResult.config.headers,
                'Content-Length': Buffer.byteLength(requestBody).toString(),
                'User-Agent': req.headers['user-agent'] || 'start-claude-proxy',
              }

              if (this.debug) {
                fileLogger.info('OUTBOUND_REQUEST', 'Sending transformed request to external API', {
                  transformerName,
                  targetProvider: provider.name,
                  originalUrl: req.url,
                  transformerUrl: targetUrl.toString(),
                  method: req.method || 'POST',
                  headers,
                  body: finalRequest,
                })
              }

              const isHttps = targetUrl.protocol === 'https:'
              const httpModule = isHttps ? https : http

              const options = {
                method: req.method || 'POST',
                headers,
                timeout: 30000,
                agent: this.getAgent(isHttps),
              }

              const proxyReq = httpModule.request(targetUrl, options, (proxyRes) => {
                // Log proxy response if debug is enabled
                if (this.debug) {
                  fileLogger.info('TRANSFORM_RESPONSE', 'Received response from external API via transformer', {
                    statusCode: proxyRes.statusCode || 0,
                    statusMessage: proxyRes.statusMessage || 'Unknown',
                    transformerName,
                    targetProvider: provider.name,
                    targetUrl: targetUrl.toString(),
                    headers: proxyRes.headers,
                  })
                }

                // Forward status and headers
                const responseHeaders = { ...proxyRes.headers }
                delete responseHeaders.connection
                delete responseHeaders['transfer-encoding']

                // Add CORS headers
                responseHeaders['Access-Control-Allow-Origin'] = '*'
                responseHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
                responseHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-api-key'

                res.writeHead(proxyRes.statusCode || 200, responseHeaders)

                // Intercept response body for transformation and logging
                let rawResponseBody = ''
                const passThrough = new PassThrough()

                // Collect response data
                passThrough.on('data', (chunk) => {
                  rawResponseBody += chunk.toString()
                })

                passThrough.on('end', () => {
                  void (async () => {
                    try {
                      // Log raw response if debug is enabled
                      if (this.debug) {
                        fileLogger.info('EXTERNAL_API_RESPONSE', 'Raw response from external API', {
                          transformerName,
                          targetProvider: provider.name,
                          statusCode: proxyRes.statusCode || 0,
                          body: rawResponseBody,
                        })
                      }

                      let finalResponseBody = rawResponseBody
                      const finalResponseHeaders = { ...proxyRes.headers }

                      // Apply formatResponse transformation if available
                      if (transformer.formatResponse) {
                        try {
                          // Create a Response object from the raw response for transformation
                          const responseForTransformation = new Response(rawResponseBody, {
                            status: proxyRes.statusCode || 200,
                            statusText: proxyRes.statusMessage || 'OK',
                            headers: proxyRes.headers as HeadersInit,
                          })

                          // Apply the transformer's formatResponse method
                          const transformedResponse = await transformer.formatResponse(responseForTransformation)

                          // Extract the transformed body and headers
                          finalResponseBody = await transformedResponse.text()

                          // Update headers from transformed response
                          transformedResponse.headers.forEach((value, key) => {
                            finalResponseHeaders[key] = value
                          })

                          // Log transformation if debug is enabled
                          if (this.debug) {
                            fileLogger.info('TRANSFORM_RESPONSE_OUTPUT', 'Response transformed by formatResponse', {
                              transformerName,
                              statusCode: proxyRes.statusCode || 0,
                              originalBodySize: rawResponseBody.length,
                              transformedBodySize: finalResponseBody.length,
                              originalBody: rawResponseBody,
                              transformedBody: finalResponseBody,
                            })
                          }
                        }
                        catch (transformError) {
                          // Log transformation error if debug is enabled
                          if (this.debug) {
                            fileLogger.error('TRANSFORM_RESPONSE_ERROR', 'Failed to transform response with formatResponse', {
                              transformerName,
                              statusCode: proxyRes.statusCode || 0,
                              error: transformError instanceof Error ? transformError.message : 'Unknown error',
                              originalBody: rawResponseBody,
                            })
                          }
                          // Continue with original response on transformation error
                        }
                      }
                      else if (this.debug) {
                        // Log that no formatResponse transformation is available (debug only)
                        fileLogger.info('TRANSFORM_RESPONSE_SKIPPED', 'No formatResponse method available', {
                          transformerName,
                          hasFormatResponse: false,
                          originalBodySize: rawResponseBody.length,
                        })
                      }

                      // Apply universal response formatting after transformer formatResponse
                      finalResponseBody = this.formatUniversalResponse(
                        finalResponseBody,
                        proxyRes.statusCode || 200,
                        finalResponseHeaders,
                        res,
                      )

                      // Send the final response (transformed or original) to client
                      res.end(finalResponseBody)
                    }
                    catch (error) {
                      // If anything goes wrong, send the original response with universal formatting
                      if (this.debug) {
                        fileLogger.error('RESPONSE_PROCESSING_ERROR', 'Error processing response', {
                          transformerName,
                          error: error instanceof Error ? error.message : 'Unknown error',
                        })
                      }

                      // Apply universal response formatting to the fallback response too
                      const formattedFallbackResponse = this.formatUniversalResponse(
                        rawResponseBody,
                        proxyRes.statusCode || 200,
                        proxyRes.headers,
                        res,
                      )
                      res.end(formattedFallbackResponse)
                    }
                  })()
                })

                // Pipe the response through our processing stream (but don't pipe to res yet)
                proxyRes.pipe(passThrough)

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

                // Log proxy error if debug is enabled
                if (this.debug) {
                  fileLogger.error('TRANSFORM_REQUEST_FAILED', `External API request failed via transformer`, {
                    transformerName,
                    targetProvider: provider.name,
                    targetUrl: targetUrl.toString(),
                    errorMessage: error.message,
                    endpointName: endpoint.config.name,
                  })
                }

                if (!res.headersSent) {
                  const errorResponse = {
                    error: {
                      message: `Transformer proxy request failed: ${error.message}`,
                      type: 'proxy_error',
                    },
                  }

                  // Log detailed proxy error response
                  if (this.debug) {
                    fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 502 error response due to transformer request failure', {
                      statusCode: 502,
                      errorType: 'proxy_error',
                      transformerName,
                      targetProvider: provider.name,
                      targetUrl: targetUrl.toString(),
                      originalError: error.message,
                      endpointName: endpoint.config.name,
                      responseBody: errorResponse,
                    })
                  }

                  res.writeHead(502, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify(errorResponse))
                }
              })

              proxyReq.on('timeout', () => {
                this.markEndpointUnhealthy(endpoint, 'Request timeout')

                // Log timeout error
                if (this.debug) {
                  fileLogger.error('TRANSFORM_REQUEST_TIMEOUT', 'Transformer request timed out', {
                    transformerName,
                    targetProvider: provider.name,
                    targetUrl: targetUrl.toString(),
                    endpointName: endpoint.config.name,
                    timeoutMs: 30000,
                  })
                }

                proxyReq.destroy()

                // Send timeout error response if headers haven't been sent
                if (!res.headersSent) {
                  const errorResponse = {
                    error: {
                      message: 'Request timeout',
                      type: 'timeout_error',
                    },
                  }

                  if (this.debug) {
                    fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 504 error response due to timeout', {
                      statusCode: 504,
                      errorType: 'timeout_error',
                      transformerName,
                      targetProvider: provider.name,
                      responseBody: errorResponse,
                    })
                  }

                  res.writeHead(504, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify(errorResponse))
                }
              })

              // Send the transformed request body
              proxyReq.write(requestBody)
              proxyReq.end()
              return
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

          // Construct target URL for non-transformer endpoints
          const targetUrl = new URL(req.url || '/', endpoint.config.baseUrl)

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
            // Log proxy response if debug is enabled
            if (this.debug) {
              fileLogger.info('REGULAR_RESPONSE', 'Received response from external API (direct proxy)', {
                statusCode: proxyRes.statusCode || 0,
                statusMessage: proxyRes.statusMessage || 'Unknown',
                endpointName: endpoint.config.name,
                targetUrl: targetUrl.toString(),
                headers: proxyRes.headers,
              })
            }

            // Forward status and headers
            const responseHeaders = { ...proxyRes.headers }
            delete responseHeaders.connection
            delete responseHeaders['transfer-encoding']

            res.writeHead(proxyRes.statusCode || 200, responseHeaders)

            // Intercept response body for universal formatting and optional logging
            let rawResponseBody = ''
            const passThrough = new PassThrough()

            // Intercept data chunks
            passThrough.on('data', (chunk) => {
              rawResponseBody += chunk.toString()
            })

            passThrough.on('end', () => {
              // Apply universal response formatting
              const formattedResponseBody = this.formatUniversalResponse(
                rawResponseBody,
                proxyRes.statusCode || 200,
                proxyRes.headers,
                res,
              )

              // Log the raw response body from external API if debug enabled
              if (this.debug) {
                fileLogger.info('REGULAR_API_RESPONSE', 'Raw response from external API (direct proxy)', {
                  endpointName: endpoint.config.name,
                  targetUrl: targetUrl.toString(),
                  statusCode: proxyRes.statusCode || 0,
                  body: rawResponseBody,
                  formattedBody: formattedResponseBody,
                })
              }

              // Send formatted response
              res.end(formattedResponseBody)
            })

            // Pipe the response through our processing stream
            proxyRes.pipe(passThrough)

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

            // Log proxy error if debug is enabled
            if (this.debug) {
              fileLogger.error('REGULAR_REQUEST_FAILED', `Direct proxy request failed`, {
                targetUrl: targetUrl.toString(),
                endpointName: endpoint.config.name,
                errorMessage: error.message,
                method: req.method || 'GET',
              })
            }

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

            // Log timeout error
            if (this.debug) {
              fileLogger.error('REGULAR_REQUEST_TIMEOUT', 'Regular proxy request timed out', {
                targetUrl: targetUrl.toString(),
                endpointName: endpoint.config.name,
                timeoutMs: 30000,
                method: req.method || 'GET',
              })
            }

            proxyReq.destroy()

            // Send timeout error response if headers haven't been sent
            if (!res.headersSent) {
              const errorResponse = {
                error: {
                  message: 'Request timeout',
                  type: 'timeout_error',
                },
              }

              if (this.debug) {
                fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 504 error response due to timeout', {
                  statusCode: 504,
                  errorType: 'timeout_error',
                  endpointName: endpoint.config.name,
                  targetUrl: targetUrl.toString(),
                  responseBody: errorResponse,
                })
              }

              res.writeHead(504, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(errorResponse))
            }
          })

          // Send the request body
          if (body.length > 0) {
            proxyReq.write(body)
          }

          proxyReq.end()
        }
        catch (error) {
          this.markEndpointUnhealthy(endpoint, error instanceof Error ? error.message : 'Unknown error')

          // Log detailed error information
          if (this.debug) {
            fileLogger.error('PROXY_REQUEST_EXCEPTION', 'Exception caught during proxy request processing', {
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              errorStack: error instanceof Error ? error.stack : undefined,
              endpointName: endpoint.config.name,
              endpointUrl: endpoint.config.baseUrl,
              method: req.method || 'UNKNOWN',
              url: req.url || '/',
              hasTransformer: this.enableTransform && 'transformerEnabled' in endpoint.config && endpoint.config.transformerEnabled,
            })
          }

          if (!res.headersSent) {
            const errorResponse = {
              error: {
                message: 'Proxy request failed',
                type: 'proxy_error',
              },
            }

            // Log detailed proxy error response
            if (this.debug) {
              fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 500 error response due to proxy request exception', {
                statusCode: 500,
                errorType: 'proxy_error',
                endpointName: endpoint.config.name,
                originalError: error instanceof Error ? error.message : 'Unknown error',
                responseBody: errorResponse,
              })
            }

            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(errorResponse))
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
      // Log retry proxy response if debug is enabled
      if (this.debug) {
        fileLogger.info('RETRY_RESPONSE', 'Received response from retry attempt', {
          statusCode: proxyRes.statusCode || 0,
          statusMessage: proxyRes.statusMessage || 'Unknown',
          endpointName: endpoint.config.name,
          targetUrl: targetUrl.toString(),
          headers: proxyRes.headers,
        })
      }

      // Forward status and headers
      const responseHeaders = { ...proxyRes.headers }
      delete responseHeaders.connection
      delete responseHeaders['transfer-encoding']

      res.writeHead(proxyRes.statusCode || 200, responseHeaders)

      // Intercept response body for universal formatting and optional logging
      let rawResponseBody = ''
      const passThrough = new PassThrough()

      // Intercept data chunks
      passThrough.on('data', (chunk) => {
        rawResponseBody += chunk.toString()
      })

      passThrough.on('end', () => {
        // Apply universal response formatting
        const formattedResponseBody = this.formatUniversalResponse(
          rawResponseBody,
          proxyRes.statusCode || 200,
          proxyRes.headers,
          res,
        )

        // Log the raw response body from external API if debug enabled
        if (this.debug) {
          fileLogger.info('RETRY_API_RESPONSE', 'Raw response from retry attempt', {
            endpointName: endpoint.config.name,
            targetUrl: targetUrl.toString(),
            statusCode: proxyRes.statusCode || 0,
            body: rawResponseBody,
            formattedBody: formattedResponseBody,
          })
        }

        // Send formatted response
        res.end(formattedResponseBody)
      })

      // Pipe the response through our processing stream
      proxyRes.pipe(passThrough)

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

      // Log retry proxy error if debug is enabled
      if (this.debug) {
        fileLogger.error('RETRY_REQUEST_FAILED', `Retry attempt failed`, {
          targetUrl: targetUrl.toString(),
          endpointName: endpoint.config.name,
          errorMessage: error.message,
          method,
        })
      }

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

      // Log timeout error
      if (this.debug) {
        fileLogger.error('RETRY_REQUEST_TIMEOUT', 'Retry request timed out', {
          targetUrl: targetUrl.toString(),
          endpointName: endpoint.config.name,
          timeoutMs: 30000,
          method,
        })
      }

      proxyReq.destroy()

      // Send timeout error response if headers haven't been sent
      if (!res.headersSent) {
        const errorResponse = {
          error: {
            message: 'Request timeout',
            type: 'timeout_error',
          },
        }

        if (this.debug) {
          fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 504 error response due to retry timeout', {
            statusCode: 504,
            errorType: 'timeout_error',
            endpointName: endpoint.config.name,
            targetUrl: targetUrl.toString(),
            responseBody: errorResponse,
          })
        }

        res.writeHead(504, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(errorResponse))
      }
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
          displayWarning('First endpoint failed, trying alternatives...')
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
