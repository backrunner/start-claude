'use client'

import { useEffect, useRef } from 'react'

interface BroadcastChannelHookOptions {
  onConfigChange?: () => void
  onShutdown?: () => void
}

interface UseBroadcastChannelReturn {
  notifyConfigChange: () => void
  notifyShutdown: () => void
  cleanup: () => void
}

export function useBroadcastChannel(options: BroadcastChannelHookOptions = {}): UseBroadcastChannelReturn {
  const channelRef = useRef<BroadcastChannel | null>(null)
  const { onConfigChange, onShutdown } = options

  useEffect(() => {
    // Create a broadcast channel for cross-tab communication
    channelRef.current = new BroadcastChannel('start-claude-manager')

    channelRef.current.onmessage = (event) => {
      console.log('Broadcast message received:', event.data)

      if (event.data.type === 'configChange' && onConfigChange) {
        console.log('Config change notification received, refetching configs...')
        onConfigChange()
      }
      else if (event.data.type === 'shutdown' && onShutdown) {
        console.log('Shutdown notification received, closing page...')
        onShutdown()
      }
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.close()
        channelRef.current = null
      }
    }
  }, [onConfigChange, onShutdown])

  const notifyConfigChange = (): void => {
    if (channelRef.current) {
      console.log('Broadcasting config change notification')
      channelRef.current.postMessage({
        type: 'configChange',
        timestamp: Date.now(),
      })
    }
  }

  const notifyShutdown = (): void => {
    if (channelRef.current) {
      console.log('Broadcasting shutdown notification')
      channelRef.current.postMessage({
        type: 'shutdown',
        timestamp: Date.now(),
      })
    }
  }

  const cleanup = (): void => {
    if (channelRef.current) {
      channelRef.current.close()
      channelRef.current = null
    }
  }

  return {
    notifyConfigChange,
    notifyShutdown,
    cleanup,
  }
}
