import type { ClaudeConfig, LoadBalancerStrategy } from '../../config/types'
import { Buffer } from 'node:buffer'
import * as http from 'node:http'

const PROXY_STATUS_TIMEOUT_MS = 1000
const PROXY_SWITCH_TIMEOUT_MS = 30000

export interface ProxySwitchResult {
  success: boolean
  message: string
  healthyEndpoints?: number
  totalEndpoints?: number
  endpointDetails?: Array<{ name: string, healthy: boolean, error?: string }>
  speedTestResults?: Array<{ name: string, responseTime: number }>
}

export interface ProxyRuntimeStatus {
  total: number
  healthy: number
  unhealthy: number
  loadBalance: boolean
  transform: boolean
  strategy?: LoadBalancerStrategy
  transformers?: string[]
}

interface ProxySwitchErrorResponse {
  success?: false
  error?: {
    message?: string
  }
  endpointDetails?: Array<{ name: string, healthy: boolean, error?: string }>
}

export async function sendProxySwitchRequest(
  port: number,
  configs: ClaudeConfig[],
): Promise<ProxySwitchResult> {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({ configs })

    const options = {
      hostname: 'localhost',
      port,
      path: '/__switch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const response: unknown = JSON.parse(data)

          if (isProxySwitchResult(response)) {
            resolve(response)
          }
          else if (isProxySwitchErrorResponse(response)) {
            resolve({
              success: false,
              message: response.error?.message || 'Unknown error',
              endpointDetails: response.endpointDetails,
            })
          }
          else {
            reject(new Error('Invalid response format from server'))
          }
        }
        catch {
          reject(new Error(`Invalid response from server: ${data}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.setTimeout(PROXY_SWITCH_TIMEOUT_MS, () => {
      req.destroy(new Error(`Proxy switch request timed out after ${PROXY_SWITCH_TIMEOUT_MS}ms`))
    })

    req.write(requestBody)
    req.end()
  })
}

export async function getProxyStatus(port = 2333): Promise<ProxyRuntimeStatus> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port,
      path: '/__status',
      method: 'GET',
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const response: unknown = JSON.parse(data)
          if (!isProxyRuntimeStatus(response)) {
            reject(new Error('Invalid status response from proxy server'))
            return
          }
          resolve(response)
        }
        catch {
          reject(new Error(`Invalid response from server: ${data}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.setTimeout(PROXY_STATUS_TIMEOUT_MS, () => {
      req.destroy(new Error(`Proxy status request timed out after ${PROXY_STATUS_TIMEOUT_MS}ms`))
    })

    req.end()
  })
}

function isProxyRuntimeStatus(value: unknown): value is ProxyRuntimeStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const status = value as Record<string, unknown>
  return typeof status.total === 'number'
    && typeof status.healthy === 'number'
    && typeof status.unhealthy === 'number'
    && typeof status.loadBalance === 'boolean'
    && typeof status.transform === 'boolean'
}

function isProxySwitchResult(value: unknown): value is ProxySwitchResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const result = value as Record<string, unknown>
  return result.success === true && typeof result.message === 'string'
}

function isProxySwitchErrorResponse(value: unknown): value is ProxySwitchErrorResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const response = value as Record<string, unknown>
  if (typeof response.error !== 'object' || response.error === null || Array.isArray(response.error)) {
    return false
  }

  const error = response.error as Record<string, unknown>
  return typeof error.message === 'string' || error.message === undefined
}
