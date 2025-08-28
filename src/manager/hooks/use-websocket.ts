'use client'

import { useEffect, useRef } from 'react'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const useHealthCheckRef = useRef(false)

  // Health check fallback when WebSocket is not available
  const healthCheck = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-cache',
      })
      return response.ok
    }
    catch {
      return false
    }
  }

  const startHealthCheck = (): void => {
    if (healthCheckIntervalRef.current)
      return // Already running

    console.log('Starting health check polling (WebSocket fallback)')
    healthCheckIntervalRef.current = setInterval(() => {
      void (async () => {
        if (!useHealthCheckRef.current) {
          // WebSocket has reconnected, stop health check
          if (healthCheckIntervalRef.current) {
            clearInterval(healthCheckIntervalRef.current)
            healthCheckIntervalRef.current = null
          }
          return
        }

        const isHealthy = await healthCheck()
        if (!isHealthy) {
          console.log('Manager server is no longer responding, closing page...')
          window.close()
        }
      })()
    }, 2000) // Check every 2 seconds
  }

  const connectWebSocket = async (): Promise<void> => {
    try {
      // First check if WebSocket server is available
      const wsInfoResponse = await fetch('/api/ws', { cache: 'no-cache' })
      const wsInfo = await wsInfoResponse.json()

      if (!wsInfo.serverRunning || !wsInfo.websocketUrl) {
        console.log('WebSocket server not available, using health check fallback')
        useHealthCheckRef.current = true
        startHealthCheck()
        return
      }

      console.log('Connecting to WebSocket:', wsInfo.websocketUrl)
      wsRef.current = new WebSocket(wsInfo.websocketUrl)

      wsRef.current.onopen = () => {
        console.log('WebSocket connected successfully')
        useHealthCheckRef.current = false
        // Stop health check if it was running
        if (healthCheckIntervalRef.current) {
          clearInterval(healthCheckIntervalRef.current)
          healthCheckIntervalRef.current = null
        }
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          console.log('WebSocket message received:', message)

          if (message.type === 'shutdown') {
            console.log('Shutdown message received via WebSocket, closing page...')
            window.close()
          }
        }
        catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      wsRef.current.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason)
        wsRef.current = null

        // If close wasn't intentional, try to reconnect or fallback to health check
        if (event.code !== 1000 && !useHealthCheckRef.current) {
          console.log('WebSocket connection lost, starting health check fallback')
          useHealthCheckRef.current = true
          startHealthCheck()
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        wsRef.current = null
        if (!useHealthCheckRef.current) {
          console.log('WebSocket error, switching to health check fallback')
          useHealthCheckRef.current = true
          startHealthCheck()
        }
      }
    }
    catch (error) {
      console.error('Failed to connect WebSocket:', error)
      useHealthCheckRef.current = true
      startHealthCheck()
    }
  }

  const cleanup = (): void => {
    // Cleanup WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'Page unloading')
      wsRef.current = null
    }

    // Cleanup intervals
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current)
      healthCheckIntervalRef.current = null
    }
  }

  useEffect(() => {
    // Try to connect WebSocket first, fallback to health check if needed
    void connectWebSocket()

    return cleanup
  }, [])

  return { cleanup }
}