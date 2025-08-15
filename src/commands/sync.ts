import process from 'node:process'
import { SyncManager } from '../sync/manager'
import { displayError, displayInfo } from '../utils/cli/ui'

export async function setupSyncCommand(): Promise<void> {
  try {
    const syncManager = new SyncManager()

    displayInfo('🔄 Configuration Synchronization Setup')
    displayInfo('=====================================\n')

    const result = await syncManager.setupSync()

    if (result) {
      displayInfo('\n📋 Next Steps:')
      displayInfo('• Your configuration is now synced across devices')
      displayInfo('• Changes will be automatically synchronized')
      displayInfo('• Run "start-claude sync status" to check sync health')
      displayInfo('• Run "start-claude sync disable" to disable sync')
    }
  }
  catch (error) {
    displayError(`❌ Failed to setup sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}

export async function syncStatusCommand(): Promise<void> {
  try {
    const syncManager = new SyncManager()
    const status = syncManager.getSyncStatus()

    displayInfo('🔄 Sync Status')
    displayInfo('==============\n')

    if (!status.isConfigured) {
      displayInfo('❌ Sync is not configured')
      displayInfo('Run "start-claude sync setup" to configure synchronization')
      return
    }

    displayInfo(`📊 Provider: ${status.provider}`)
    if (status.cloudPath) {
      displayInfo(`📂 Cloud Path: ${status.cloudPath}`)
    }
    displayInfo(`📄 Config Path: ${status.configPath}`)

    if (status.isValid) {
      displayInfo('✅ Sync is working properly')
    }
    else {
      displayError('❌ Sync configuration has issues:')
      status.issues.forEach((issue) => {
        displayError(`  • ${issue}`)
      })
      displayInfo('\nRun "start-claude sync setup" to fix these issues')
    }
  }
  catch (error) {
    displayError(`❌ Failed to check sync status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}

export async function disableSyncCommand(): Promise<void> {
  try {
    const syncManager = new SyncManager()

    displayInfo('🔄 Disabling Configuration Synchronization')
    displayInfo('=========================================\n')

    const result = await syncManager.disableSync()

    if (result) {
      displayInfo('\n📋 Sync has been disabled:')
      displayInfo('• Configuration is now stored locally only')
      displayInfo('• Cloud sync link has been removed')
      displayInfo('• You can re-enable sync anytime with "start-claude sync setup"')
    }
  }
  catch (error) {
    displayError(`❌ Failed to disable sync: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
