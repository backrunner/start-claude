import type { NextRequest } from 'next/server'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { detectConfigConflicts, resolveConfigConflicts } from '@start-claude/cli/src/utils/config/conflict-resolver'
import type { ConfigFile } from '@start-claude/cli/src/config/types'
import { SyncManager } from '@start-claude/cli/src/sync/manager'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const syncManager = new SyncManager()

/**
 * GET /api/sync/conflicts - Check if there are conflicts between local and remote configs
 */
export async function GET(): Promise<NextResponse> {
  try {
    const syncConfig = syncManager.getSyncConfig()

    if (!syncConfig?.enabled) {
      return NextResponse.json({
        hasConflicts: false,
        conflicts: [],
        message: 'Sync is not enabled',
      })
    }

    // Get cloud config path based on provider
    let cloudConfigPath: string | undefined

    if (syncConfig.provider === 'icloud' || syncConfig.provider === 'onedrive') {
      cloudConfigPath = syncConfig.cloudPath
    } else if (syncConfig.provider === 'custom') {
      cloudConfigPath = syncConfig.customPath
    }

    if (!cloudConfigPath) {
      return NextResponse.json({
        hasConflicts: false,
        conflicts: [],
        message: 'Cloud path not configured',
      })
    }

    const localConfigFile = join(homedir(), '.start-claude', 'config.json')
    const cloudConfigFile = join(cloudConfigPath, '.start-claude', 'config.json')

    // Check if both files exist
    if (!existsSync(localConfigFile) || !existsSync(cloudConfigFile)) {
      return NextResponse.json({
        hasConflicts: false,
        conflicts: [],
        message: 'One or both config files do not exist',
      })
    }

    // Read both configs
    const localConfig: ConfigFile = JSON.parse(readFileSync(localConfigFile, 'utf-8'))
    const cloudConfig: ConfigFile = JSON.parse(readFileSync(cloudConfigFile, 'utf-8'))

    // Get modification dates
    const localStats = statSync(localConfigFile)
    const cloudStats = statSync(cloudConfigFile)

    // Detect conflicts
    const conflicts = detectConfigConflicts(localConfig, cloudConfig)

    return NextResponse.json({
      hasConflicts: conflicts.length > 0,
      conflicts,
      localConfigCount: localConfig.configs.length,
      cloudConfigCount: cloudConfig.configs.length,
      localModifiedDate: localStats.mtime.toISOString(),
      cloudModifiedDate: cloudStats.mtime.toISOString(),
    })
  }
  catch (error) {
    console.error('GET /api/sync/conflicts error:', error)
    return NextResponse.json(
      { error: 'Failed to check for conflicts' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/sync/conflicts - Resolve conflicts with a specific strategy
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { strategy } = body as { strategy: 'local' | 'remote' | 'merge' }

    if (!strategy || !['local', 'remote', 'merge'].includes(strategy)) {
      return NextResponse.json(
        { error: 'Invalid strategy. Must be "local", "remote", or "merge"' },
        { status: 400 },
      )
    }

    const syncConfig = syncManager.getSyncConfig()

    if (!syncConfig?.enabled) {
      return NextResponse.json(
        { error: 'Sync is not enabled' },
        { status: 400 },
      )
    }

    // Get cloud config path based on provider
    let cloudConfigPath: string | undefined

    if (syncConfig.provider === 'icloud' || syncConfig.provider === 'onedrive') {
      cloudConfigPath = syncConfig.cloudPath
    } else if (syncConfig.provider === 'custom') {
      cloudConfigPath = syncConfig.customPath
    }

    if (!cloudConfigPath) {
      return NextResponse.json(
        { error: 'Cloud path not configured' },
        { status: 400 },
      )
    }

    const localConfigFile = join(homedir(), '.start-claude', 'config.json')
    const cloudConfigFile = join(cloudConfigPath, '.start-claude', 'config.json')

    // Check if both files exist
    if (!existsSync(localConfigFile) || !existsSync(cloudConfigFile)) {
      return NextResponse.json(
        { error: 'One or both config files do not exist' },
        { status: 400 },
      )
    }

    // Read both configs
    const localConfig: ConfigFile = JSON.parse(readFileSync(localConfigFile, 'utf-8'))
    const cloudConfig: ConfigFile = JSON.parse(readFileSync(cloudConfigFile, 'utf-8'))

    let resolvedConfig: ConfigFile

    if (strategy === 'local') {
      // Use local config, overwrite cloud
      resolvedConfig = localConfig
      writeFileSync(cloudConfigFile, JSON.stringify(localConfig, null, 2))
    } else if (strategy === 'remote') {
      // Use remote config (cloud is already the source of truth, no changes needed)
      resolvedConfig = cloudConfig
    } else {
      // Smart merge using the conflict resolver
      const resolution = resolveConfigConflicts(localConfig, cloudConfig, {
        autoResolve: true,
        preferLocal: false,
      })

      resolvedConfig = resolution.resolvedConfig

      // Write merged config to cloud
      writeFileSync(cloudConfigFile, JSON.stringify(resolvedConfig, null, 2))
    }

    return NextResponse.json({
      success: true,
      strategy,
      resolvedConfigCount: resolvedConfig.configs.length,
      message: `Conflicts resolved using ${strategy} strategy`,
    })
  }
  catch (error) {
    console.error('POST /api/sync/conflicts error:', error)
    return NextResponse.json(
      { error: 'Failed to resolve conflicts' },
      { status: 500 },
    )
  }
}
