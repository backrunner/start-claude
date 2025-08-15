import { SyncManager } from '../../sync/manager'
import { displayVerbose, displayWarning } from '../cli/ui'

/**
 * Handle configuration sync verification on startup
 */
export async function handleSyncVerification(options: { verbose?: boolean } = {}): Promise<void> {
  try {
    displayVerbose('🔍 Verifying configuration sync status...', options.verbose)

    const syncManager = new SyncManager()
    const syncStatus = syncManager.getSyncStatus()

    if (syncStatus.isConfigured) {
      displayVerbose(`📊 Sync provider: ${syncStatus.provider}`, options.verbose)

      if (!syncStatus.isValid) {
        displayWarning('⚠️  Configuration sync issues detected')
        syncStatus.issues.forEach((issue) => {
          displayVerbose(`  • ${issue}`, options.verbose)
        })

        // Try to verify/fix sync in non-interactive mode
        await syncManager.verifySync()
      }
      else {
        displayVerbose('✅ Configuration sync is working properly', options.verbose)
      }
    }
    else {
      displayVerbose('ℹ️  Configuration sync is not configured', options.verbose)
    }
  }
  catch (error) {
    // Don't fail the entire startup for sync issues
    displayVerbose(`⚠️ Sync verification error: ${error instanceof Error ? error.message : 'Unknown error'}`, options.verbose)
  }
}