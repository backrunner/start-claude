'use client'

import type { ReactNode } from 'react'
import { Terminal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/use-toast'

interface VSCodeStartButtonProps {
  configName: string
  className?: string
}

export function VSCodeStartButton({ configName, className }: VSCodeStartButtonProps): ReactNode {
  const { toast } = useToast()
  const [isStarting, setIsStarting] = useState(false)

  // Check if running in VSCode plugin context
  const isVSCode = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost'
      && (window.location.port !== '' || window.parent !== window))

  const handleStartClaude = async (): Promise<void> => {
    if (isStarting)
      return

    setIsStarting(true)
    try {
      const response = await fetch('/api/vscode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-claude',
          configName,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Send message to VSCode webview parent
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'start-claude-terminal',
            configName,
            command: data.command,
          }, '*')
        }

        toast({
          title: 'Starting Claude Code',
          description: `Opening terminal for configuration "${configName}"`,
          variant: 'success',
        })
      }
      else {
        throw new Error(data.error || 'Failed to start Claude')
      }
    }
    catch (error) {
      console.error('Error starting Claude:', error)
      toast({
        title: 'Failed to start Claude',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      })
    }
    finally {
      setIsStarting(false)
    }
  }

  // Only show this button in VSCode plugin context
  if (!isVSCode || typeof window === 'undefined') {
    return null
  }

  return (
    <Button
      onClick={() => void handleStartClaude()}
      disabled={isStarting}
      size="sm"
      variant="outline"
      className={`bg-green-50 hover:bg-green-100 border-green-200 text-green-700 hover:text-green-800 dark:bg-green-950 dark:hover:bg-green-900 dark:border-green-800 dark:text-green-300 dark:hover:text-green-200 ${className}`}
    >
      <Terminal className="w-3 h-3 mr-1.5" />
      {isStarting ? 'Starting...' : 'Start Claude'}
    </Button>
  )
}
