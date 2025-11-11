'use client'

import type { ProxyStatus } from '@/hooks/use-proxy-status'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ProxyStatusCardProps {
  isRunning: boolean
  status: ProxyStatus | null
  loading: boolean
  error: string | null
  onSwitchClick?: () => void
}

export function ProxyStatusCard({ isRunning, status, loading, error, onSwitchClick }: ProxyStatusCardProps): JSX.Element | null {
  const t = useTranslations('proxyStatus')

  // Only show the card when we're sure the proxy server is running
  if (!isRunning || error || loading) {
    return null
  }

  // Server is running, show compact status
  return (
    <Card className="mb-4 border">
      <div className="p-3">
        {/* Header row with status indicator and switch button */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold">{t('title')}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onSwitchClick} className="h-7 px-2 text-xs">
            {t('switch')}
          </Button>
        </div>

        {/* Compact status metrics */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="text-green-600 dark:text-green-400 font-medium">{status?.healthy || 0}</span>
            <span>{t('healthy')}</span>
          </div>
          {(status?.unhealthy || 0) > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-red-600 dark:text-red-400 font-medium">{status?.unhealthy}</span>
              <span>{t('unhealthy')}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="font-medium">{status?.total || 0}</span>
            <span>{t('total')}</span>
          </div>
          {status?.strategy && (
            <div className="flex items-center gap-1">
              <span className="font-medium">{status.strategy}</span>
            </div>
          )}
        </div>

        {/* Compact endpoints list - only show if there are endpoints */}
        {status && status.endpoints && status.endpoints.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <div className="space-y-1">
              {status.endpoints.slice(0, 3).map((endpoint, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-1 px-1 rounded text-xs"
                >
                  <div className="flex items-center gap-1.5 truncate min-w-0">
                    <span
                      className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                        endpoint.isHealthy ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="truncate font-medium">
                      {endpoint.config.name || endpoint.config.baseUrl || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0">
                    {endpoint.averageResponseTime > 0 && (
                      <span>
                        {endpoint.averageResponseTime.toFixed(0)}
                        ms
                      </span>
                    )}
                    {endpoint.totalRequests > 0 && (
                      <span>
                        (
                        {endpoint.totalRequests}
                        )
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Show "+X more" if there are more endpoints */}
              {status.endpoints.length > 3 && (
                <div className="text-xs text-muted-foreground text-center py-1">
                  {t('moreCount', { count: status.endpoints.length - 3 })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
