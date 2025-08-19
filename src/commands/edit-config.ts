import { S3SyncManager } from '../storage/s3-sync'
import { editConfigFileInEditor } from '../utils/cli/editor'
import { displayError, displayInfo, displaySuccess, displayWelcome } from '../utils/cli/ui'

export async function handleEditConfigCommand(): Promise<void> {
  displayWelcome()

  // Get the config file path
  const path = await import('node:path')
  const os = await import('node:os')
  const configFilePath = path.default.join(os.default.homedir(), '.start-claude', 'config.json')

  // Check if config file exists
  const fs = await import('node:fs')
  if (!fs.existsSync(configFilePath)) {
    displayError('Configuration file does not exist. Create a configuration first using "start-claude add".')
    return
  }

  displayInfo('Opening configuration file in editor with live reload...')
  displayInfo('Any changes you save will be automatically reloaded and synced.')

  // Initialize S3SyncManager for direct sync without triggering file watcher
  const s3SyncManager = S3SyncManager.getInstance()

  const onConfigReload = (config: any): void => {
    try {
      // Validate the config structure
      if (!config || typeof config !== 'object') {
        displayError('Invalid configuration format')
        return
      }

      // Trigger S3 sync directly without re-saving the config file
      // This avoids the infinite loop caused by the file watcher
      s3SyncManager.autoUploadAfterChange().catch((error) => {
        // Silent fail for auto-sync, but log for debugging
        displayError(`Auto-sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      })

      displaySuccess('✅ Configuration changes detected, validated, and synced!')
    }
    catch (error) {
      displayError(`❌ Failed to process config changes: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  await editConfigFileInEditor(configFilePath, onConfigReload)
}
