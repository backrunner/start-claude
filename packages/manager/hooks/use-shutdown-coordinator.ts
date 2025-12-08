'use client'

import { useEffect, useState } from 'react'
import { ShutdownCoordinator } from '@/lib/shutdown-coordinator'

interface UseShutdownCoordinatorReturn {
  shutdownCoordinator: ShutdownCoordinator | null
}

export function useShutdownCoordinator(): UseShutdownCoordinatorReturn {
  const [shutdownCoordinator, setShutdownCoordinator] = useState<ShutdownCoordinator | null>(null)

  useEffect(() => {
    const coordinator = new ShutdownCoordinator()
    setShutdownCoordinator(coordinator)

    // Custom shutdown callback
    coordinator.setShutdownCallback(async () => {
      try {
        const response = await fetch('/api/shutdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({}),
        })

        if (response.ok) {
          console.log('[useShutdownCoordinator] Shutdown API called successfully')
        }
        else {
          console.warn('[useShutdownCoordinator] Shutdown API returned non-ok response')
        }
      }
      catch (error) {
        console.error('[useShutdownCoordinator] Error calling shutdown API:', error)
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/shutdown', JSON.stringify({}))
        }
      }
    })

    // ESC key handler for manual shutdown
    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      if (event.key === 'Escape') {
        console.log('[useShutdownCoordinator] ESC key pressed, initiating shutdown...')
        await coordinator.callShutdownIfLastTab()

        setTimeout(() => {
          window.close()
        }, 300)
      }
    }

    const handleKeyDownWrapper = (event: KeyboardEvent): void => {
      void handleKeyDown(event)
    }

    window.addEventListener('keydown', handleKeyDownWrapper)

    return () => {
      window.removeEventListener('keydown', handleKeyDownWrapper)
      // Cleanup only removes event listeners and closes channel
      // Does NOT trigger shutdown - that's handled by pagehide event
      coordinator.cleanup()
    }
  }, [])

  return { shutdownCoordinator }
}
