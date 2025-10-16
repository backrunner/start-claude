'use client'

import { useEffect, useRef, useState } from 'react'

export interface ProxyEndpoint {
  config: {
    name?: string
    baseUrl?: string
    id?: string
    [key: string]: any
  }
  isHealthy: boolean
  lastCheck: number
  failureCount: number
  lastError?: string
  bannedUntil?: number
  responseTimes: number[]
  averageResponseTime: number
  lastResponseTime?: number
  totalRequests: number
}

export interface ProxyStatus {
  total: number
  healthy: number
  unhealthy: number
  endpoints: ProxyEndpoint[]
  loadBalance: boolean
  transform: boolean
  strategy?: string
  transformers?: string[]
}

interface UseProxyStatusOptions {
  /**
   * Proxy server port
   * @default 2333
   */
  port?: number

  /**
   * Interval in milliseconds between status checks
   * @default 5000 (5 seconds)
   */
  intervalMs?: number

  /**
   * Timeout in milliseconds for each status check request
   * @default 2000 (2 seconds)
   */
  timeoutMs?: number

  /**
   * Delay in milliseconds before starting status checks
   * @default 1000 (1 second)
   */
  startupDelayMs?: number

  /**
   * Whether to enable proxy status monitoring
   * @default true
   */
  enabled?: boolean

  /**
   * Callback when proxy server is detected
   */
  onProxyDetected?: (status: ProxyStatus) => void

  /**
   * Callback when proxy server goes offline
   */
  onProxyOffline?: () => void
}

interface UseProxyStatusReturn {
  isRunning: boolean
  status: ProxyStatus | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useProxyStatus(options: UseProxyStatusOptions = {}): UseProxyStatusReturn {
  const {
    port = 2333,
    intervalMs = 5000,
    timeoutMs = 2000,
    startupDelayMs = 1000,
    enabled = true,
    onProxyDetected,
    onProxyOffline,
  } = options

  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState<ProxyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const wasRunningRef = useRef(false)
  const checkProxyStatusRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const handleProxyOffline = (): void => {
      setIsRunning(false)
      setStatus(null)
      setError('Proxy server is not running')
      setLoading(false)

      // Trigger callback if proxy was just disconnected
      if (wasRunningRef.current && onProxyOffline) {
        onProxyOffline()
      }

      wasRunningRef.current = false
    }

    const checkProxyStatus = async (): Promise<void> => {
      // Create new AbortController for this request
      abortControllerRef.current = new AbortController()

      // Set up timeout
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort()
      }, timeoutMs)

      try {
        // Try to fetch status from proxy server via our API route
        const response = await fetch(`/api/proxy-status?port=${port}`, {
          method: 'GET',
          signal: abortControllerRef.current.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const proxyStatus: ProxyStatus = await response.json()

          // Proxy is running
          setIsRunning(true)
          setStatus(proxyStatus)
          setError(null)
          setLoading(false)

          // Trigger callback if proxy was just detected
          if (!wasRunningRef.current && onProxyDetected) {
            onProxyDetected(proxyStatus)
          }

          wasRunningRef.current = true
          console.log('[ProxyStatus] Proxy server is running', { port, status: proxyStatus })
        }
        else {
          // Proxy is not running or returned error
          handleProxyOffline()
        }
      }
      catch (err) {
        clearTimeout(timeoutId)

        // Ignore abort errors (from timeout)
        if (err instanceof Error && err.name === 'AbortError') {
          console.warn('[ProxyStatus] Status check timed out')
        }
        else {
          console.warn('[ProxyStatus] Status check failed:', err)
        }

        handleProxyOffline()
      }
    }

    // Store reference for manual refetch
    checkProxyStatusRef.current = checkProxyStatus

    // Start status check interval
    console.log(`[ProxyStatus] Starting proxy status checks in ${startupDelayMs}ms, then every ${intervalMs}ms`)

    // Delay before starting status checks
    const startupTimeoutId = setTimeout(() => {
      // Perform initial status check
      void checkProxyStatus()

      // Start regular interval
      intervalRef.current = setInterval(() => {
        void checkProxyStatus()
      }, intervalMs)
    }, startupDelayMs)

    // Cleanup
    return () => {
      clearTimeout(startupTimeoutId)

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }

      console.log('[ProxyStatus] Stopped proxy status checks')
    }
  }, [enabled, port, intervalMs, timeoutMs, startupDelayMs, onProxyDetected, onProxyOffline])

  return {
    isRunning,
    status,
    loading,
    error,
    refetch: async () => {
      if (checkProxyStatusRef.current) {
        await checkProxyStatusRef.current()
      }
    },
  }
}
