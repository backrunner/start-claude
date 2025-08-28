'use client'

import { useEffect, useState } from 'react'
import { ShutdownCoordinator } from '@/lib/shutdown-coordinator'

export function useShutdownCoordinator() {
  const [shutdownCoordinator, setShutdownCoordinator] = useState<ShutdownCoordinator | null>(null)

  useEffect(() => {
    // Initialize shutdown coordinator
    const coordinator = new ShutdownCoordinator()
    setShutdownCoordinator(coordinator)

    // Custom shutdown callback (optional - will use default if not set)
    coordinator.setShutdownCallback(async () => {
      try {
        const response = await fetch('/api/shutdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({}),
        })

        if (response.ok) {
          console.log('Shutdown API called successfully')
        }
        else {
          console.warn('Shutdown API returned non-ok response')
        }
      }
      catch (error) {
        console.error('Error calling shutdown API:', error)
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/shutdown', JSON.stringify({}))
        }
      }
    })

    // Add ESC key listener
    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      if (event.key === 'Escape') {
        console.log('ESC key pressed, initiating shutdown...')
        await coordinator.callShutdownIfLastTab()

        // Give a moment for the shutdown to process
        setTimeout(() => {
          window.close()
        }, 300)
      }
    }

    // Add beforeunload listener to catch all page close scenarios
    const handleBeforeUnload = (_event: BeforeUnloadEvent): void => {
      coordinator.handleBeforeUnload()
    }

    // Add unload listener as backup for when beforeunload might not work
    const handleUnload = (): void => {
      coordinator.handleUnload()
    }

    // Add ESC key listener with wrapper to handle void return requirement
    const handleKeyDownWrapper = (event: KeyboardEvent): void => {
      void handleKeyDown(event)
    }

    window.addEventListener('keydown', handleKeyDownWrapper)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('unload', handleUnload)

    return () => {
      // Cleanup shutdown coordinator
      coordinator.cleanup()

      // Cleanup event listeners
      window.removeEventListener('keydown', handleKeyDownWrapper)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
    }
  }, [])

  return shutdownCoordinator
}