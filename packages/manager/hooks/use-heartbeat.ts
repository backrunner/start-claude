'use client'

import { useEffect, useRef, useState } from 'react'

interface UseHeartbeatOptions {
  /**
   * Interval in milliseconds between health checks
   * @default 3000 (3 seconds)
   */
  intervalMs?: number

  /**
   * Number of consecutive failures before considering connection lost
   * @default 3
   */
  maxFailures?: number

  /**
   * Timeout in milliseconds for each health check request
   * @default 2000 (2 seconds)
   */
  timeoutMs?: number

  /**
   * Delay in milliseconds before starting health checks
   * Gives the server time to fully initialize
   * @default 5000 (5 seconds)
   */
  startupDelayMs?: number

  /**
   * Callback when connection is lost
   */
  onConnectionLost?: () => void

  /**
   * Whether to enable heartbeat monitoring
   * @default true
   */
  enabled?: boolean
}

interface UseHeartbeatReturn {
  isConnected: boolean
  consecutiveFailures: number
  isPageVisible: boolean
}

export function useHeartbeat(options: UseHeartbeatOptions = {}): UseHeartbeatReturn {
  const {
    intervalMs = 3000,
    maxFailures = 3,
    timeoutMs = 2000,
    startupDelayMs = 5000,
    onConnectionLost,
    enabled = true,
  } = options

  const [isConnected, setIsConnected] = useState(true)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isPageVisible, setIsPageVisible] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const connectionLostTriggeredRef = useRef(false)
  const consecutiveFailuresRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) {
      return
    }

    // Forward declaration to avoid use-before-define
    let checkHealth: () => Promise<void>

    // Track page visibility for informational purposes
    const handleVisibilityChange = (): void => {
      const isVisible = document.visibilityState === 'visible'
      setIsPageVisible(isVisible)

      if (!isVisible) {
        console.log('[Heartbeat] Page hidden - continuing to send heartbeats (tolerance handled by CLI)')
      }
      else {
        console.log('[Heartbeat] Page visible again')

        // If we had failures while hidden, do an immediate health check
        if (consecutiveFailuresRef.current > 0) {
          console.log('[Heartbeat] Performing immediate health check after page became visible')
          void checkHealth()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    const handleFailure = (): void => {
      setConsecutiveFailures((prev) => {
        const newCount = prev + 1
        consecutiveFailuresRef.current = newCount

        console.warn(`[Heartbeat] Health check failed (${newCount}/${maxFailures})`)

        if (newCount >= maxFailures && !connectionLostTriggeredRef.current) {
          console.error('[Heartbeat] Connection lost - max failures reached')
          setIsConnected(false)
          connectionLostTriggeredRef.current = true

          // Trigger connection lost callback
          if (onConnectionLost) {
            onConnectionLost()
          }
        }

        return newCount
      })
    }

    checkHealth = async (): Promise<void> => {
      // Create new AbortController for this request
      abortControllerRef.current = new AbortController()

      // Set up timeout
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort()
      }, timeoutMs)

      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          signal: abortControllerRef.current.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          // Health check succeeded
          setIsConnected(true)
          setConsecutiveFailures(0)
          consecutiveFailuresRef.current = 0
          connectionLostTriggeredRef.current = false
          console.log('[Heartbeat] Backend is healthy')
        }
        else {
          // Non-OK response
          handleFailure()
        }
      }
      catch (error) {
        clearTimeout(timeoutId)

        // Ignore abort errors (from timeout)
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn('[Heartbeat] Health check timed out')
        }
        else {
          console.warn('[Heartbeat] Health check failed:', error)
        }

        handleFailure()
      }
    }

    // Start heartbeat interval
    console.log(`[Heartbeat] Starting health checks in ${startupDelayMs}ms, then every ${intervalMs}ms`)

    // Delay before starting health checks to allow server to initialize
    const startupTimeoutId = setTimeout(() => {
      // Perform initial health check
      void checkHealth()

      // Start regular interval
      intervalRef.current = setInterval(() => {
        void checkHealth()
      }, intervalMs)
    }, startupDelayMs)

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      clearTimeout(startupTimeoutId)

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }

      console.log('[Heartbeat] Stopped health checks')
    }
  }, [enabled, intervalMs, maxFailures, timeoutMs, startupDelayMs, onConnectionLost])

  return {
    isConnected,
    consecutiveFailures,
    isPageVisible,
  }
}
