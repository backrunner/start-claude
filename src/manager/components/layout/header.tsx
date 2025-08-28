'use client'

import type { ReactNode } from 'react'
import type { ShutdownCoordinator } from '@/lib/shutdown-coordinator'
import { Plus, RefreshCw, Settings, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  isVSCode: boolean
  shutdownCoordinator: ShutdownCoordinator | null
  onAddConfig: () => void
  onOpenSettings: () => void
}

export function Header({ isVSCode, shutdownCoordinator, onAddConfig, onOpenSettings }: HeaderProps): ReactNode {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4">
      <div className="flex items-center gap-2 sm:gap-4">
        {!isVSCode && (
          <div className="flex h-8 w-8 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">
            Start Claude Manager
          </h1>
          {isVSCode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (shutdownCoordinator) {
                  shutdownCoordinator.markAsReload()
                }
                window.location.reload()
              }}
              className="hover:bg-muted/50 p-2 h-8 w-8"
              title="Reload page"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
        <Button
          variant="outline"
          onClick={onOpenSettings}
          className="hover:bg-muted/50 text-xs sm:text-sm flex-1 sm:flex-none"
          size="sm"
        >
          <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          Settings
        </Button>
        <Button
          onClick={onAddConfig}
          className="bg-primary hover:bg-primary/90 text-xs sm:text-sm flex-1 sm:flex-none"
          size="sm"
        >
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          Add Config
        </Button>
      </div>
    </div>
  )
}