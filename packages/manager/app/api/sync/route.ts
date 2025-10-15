import type { NextRequest } from 'next/server'
import type { SyncConfig, SyncStatus } from '@start-claude/cli/src/sync/manager'
import { SyncManager } from '@start-claude/cli/src/sync/manager'
import { NextResponse } from 'next/server'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { detectConfigConflicts } from '@start-claude/cli/src/utils/config/conflict-resolver'
import type { ConfigFile } from '@start-claude/cli/src/config/types'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const syncManager = new SyncManager()

/**
 * GET /api/sync - Get current sync status
 */
export async function GET(): Promise<NextResponse> {
  try {
    const syncStatus = await syncManager.getSyncStatus()
    const syncConfig = syncManager.getSyncConfig()

    return NextResponse.json({
      status: syncStatus,
      config: syncConfig,
    })
  }
  catch (error) {
    console.error('GET /api/sync error:', error)
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/sync - Enable or configure sync
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { provider, cloudPath, customPath, s3Config } = body

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 },
      )
    }

    // Check for conflicts before enabling sync
    let hasConflicts = false
    let conflicts: any[] = []
    let localModifiedDate: string | undefined
    let cloudModifiedDate: string | undefined

    if (provider === 'icloud' || provider === 'onedrive' || provider === 'custom') {
      const targetCloudPath = provider === 'custom' ? customPath : cloudPath

      if (targetCloudPath) {
        const localConfigFile = join(homedir(), '.start-claude', 'config.json')
        const cloudConfigFile = join(targetCloudPath, '.start-claude', 'config.json')

        if (existsSync(localConfigFile) && existsSync(cloudConfigFile)) {
          try {
            const localConfig: ConfigFile = JSON.parse(readFileSync(localConfigFile, 'utf-8'))
            const cloudConfig: ConfigFile = JSON.parse(readFileSync(cloudConfigFile, 'utf-8'))

            // Get modification dates
            const localStats = statSync(localConfigFile)
            const cloudStats = statSync(cloudConfigFile)
            localModifiedDate = localStats.mtime.toISOString()
            cloudModifiedDate = cloudStats.mtime.toISOString()

            conflicts = detectConfigConflicts(localConfig, cloudConfig)
            hasConflicts = conflicts.length > 0
          }
          catch (error) {
            console.error('Error detecting conflicts:', error)
          }
        }
      }
    }

    // If conflicts detected, return them instead of enabling sync
    if (hasConflicts) {
      return NextResponse.json({
        hasConflicts: true,
        conflicts,
        localModifiedDate,
        cloudModifiedDate,
        message: 'Conflicts detected. Please resolve them before enabling sync.',
      }, { status: 409 }) // 409 Conflict status
    }

    // Create sync config based on provider
    const syncConfig: SyncConfig = {
      enabled: true,
      provider,
      linkedAt: new Date().toISOString(),
    }

    if (provider === 'icloud' || provider === 'onedrive') {
      if (!cloudPath) {
        return NextResponse.json(
          { error: 'Cloud path is required for iCloud/OneDrive' },
          { status: 400 },
        )
      }
      syncConfig.cloudPath = cloudPath
    }
    else if (provider === 'custom') {
      if (!customPath) {
        return NextResponse.json(
          { error: 'Custom path is required' },
          { status: 400 },
        )
      }
      syncConfig.customPath = customPath
    }
    else if (provider === 's3') {
      if (!s3Config) {
        return NextResponse.json(
          { error: 'S3 config is required' },
          { status: 400 },
        )
      }
      syncConfig.s3Config = s3Config
    }

    // Save sync configuration
    syncManager.saveSyncConfig(syncConfig)

    const status = await syncManager.getSyncStatus()

    return NextResponse.json({
      success: true,
      status,
      config: syncConfig,
    })
  }
  catch (error) {
    console.error('POST /api/sync error:', error)
    return NextResponse.json(
      { error: 'Failed to enable sync' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/sync - Disable sync
 */
export async function DELETE(): Promise<NextResponse> {
  try {
    const success = await syncManager.disableSync()

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to disable sync' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Sync disabled successfully',
    })
  }
  catch (error) {
    console.error('DELETE /api/sync error:', error)
    return NextResponse.json(
      { error: 'Failed to disable sync' },
      { status: 500 },
    )
  }
}

/**
 * PUT /api/sync - Update sync configuration
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { config } = body

    if (!config) {
      return NextResponse.json(
        { error: 'Config is required' },
        { status: 400 },
      )
    }

    // Validate the config
    if (!config.provider || !config.enabled) {
      return NextResponse.json(
        { error: 'Invalid sync config' },
        { status: 400 },
      )
    }

    // Save the updated config
    syncManager.saveSyncConfig(config)

    const status = await syncManager.getSyncStatus()

    return NextResponse.json({
      success: true,
      status,
      config,
    })
  }
  catch (error) {
    console.error('PUT /api/sync error:', error)
    return NextResponse.json(
      { error: 'Failed to update sync config' },
      { status: 500 },
    )
  }
}
