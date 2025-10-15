import { getAvailableCloudServices, getCloudStorageStatus } from '@start-claude/cli/src/utils/cloud-storage/detector'
import { NextResponse } from 'next/server'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/sync/providers - Get available cloud storage providers
 */
export async function GET(): Promise<NextResponse> {
  try {
    const cloudStatus = getCloudStorageStatus()
    const availableServices = getAvailableCloudServices()

    // Check each provider for existing configs
    const servicesWithConfigInfo = availableServices.map((service) => {
      let hasConfigs = false
      let configModifiedDate: string | undefined

      if (service.isEnabled && service.path) {
        const configFile = join(service.path, '.start-claude', 'config.json')
        if (existsSync(configFile)) {
          hasConfigs = true
          try {
            const stats = statSync(configFile)
            configModifiedDate = stats.mtime.toISOString()
          }
          catch (error) {
            console.error(`Error reading config stats for ${service.name}:`, error)
          }
        }
      }

      return {
        ...service,
        hasConfigs,
        configModifiedDate,
      }
    })

    return NextResponse.json({
      status: cloudStatus,
      available: servicesWithConfigInfo,
    })
  }
  catch (error) {
    console.error('GET /api/sync/providers error:', error)
    return NextResponse.json(
      { error: 'Failed to get cloud storage providers' },
      { status: 500 },
    )
  }
}
