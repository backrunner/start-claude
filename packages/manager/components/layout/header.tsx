'use client'

import type { ReactNode } from 'react'
import type { ShutdownCoordinator } from '@/lib/shutdown-coordinator'
import { Plus, RefreshCw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  isVSCode: boolean
  shutdownCoordinator: ShutdownCoordinator | null
  onAddConfig: () => void
  onOpenSettings: () => void
}

export function Header({ isVSCode, shutdownCoordinator, onAddConfig, onOpenSettings }: HeaderProps): ReactNode {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Start Claude</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your configurations</p>
        </div>
        {isVSCode && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (shutdownCoordinator) {
                shutdownCoordinator.markAsReload()
              }
              window.location.reload()
            }}
            className="rounded-full"
            title="Reload page"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Button
          variant="outline"
          onClick={onOpenSettings}
          className="flex-1 sm:flex-none"
        >
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
        <Button
          onClick={onAddConfig}
          className="flex-1 sm:flex-none"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Config
        </Button>
      </div>
    </div>
  )
}
