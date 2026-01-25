'use client'

import type { ReactNode } from 'react'
import { Terminal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useVSCode } from '@/context/vscode-context'
import { useToast } from '@/lib/use-toast'

interface VSCodeStartButtonProps {
  configName: string
  className?: string
}

export function VSCodeStartButton({ configName, className }: VSCodeStartButtonProps): ReactNode {
  const { toast } = useToast()
  const t = useTranslations('toast')
  const [isStarting, setIsStarting] = useState(false)
  const { isVSCode } = useVSCode()

  const handleStartClaude = async (): Promise<void> => {
    if (isStarting)
      return

    setIsStarting(true)
    try {
      const command = `claude --config "${configName}"`

      // Send message to VSCode webview parent
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'start-claude-terminal',
          configName,
          command,
        }, '*')
      }

      toast({
        title: t('vscodeStarting'),
        description: t('vscodeOpeningTerminal', { name: configName }),
        variant: 'success',
      })
    }
    catch (error) {
      console.error('Error starting Claude:', error)
      toast({
        title: t('vscodeStartFailed'),
        description: error instanceof Error ? error.message : t('unknownError'),
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
      {isStarting ? t('starting') : t('startClaude')}
    </Button>
  )
}
