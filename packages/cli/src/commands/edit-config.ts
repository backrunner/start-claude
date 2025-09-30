import { ConfigFileManager } from '../config/file-operations'
import { S3SyncManager } from '../storage/s3-sync'
import { editConfigFileInEditor } from '../utils/cli/editor'
import { UILogger } from '../utils/cli/ui'

export async function handleEditConfigCommand(): Promise<void> {
  const ui = new UILogger()
  ui.displayWelcome()

  // Get the actual config file path (respects cloud sync settings)
  const configFileManager = ConfigFileManager.getInstance()
  const configFilePath = configFileManager.getActualConfigPath()

  // Check if config file exists
  const fs = await import('node:fs')
  if (!fs.existsSync(configFilePath)) {
    ui.displayError('Configuration file does not exist. Create a configuration first using "start-claude add".')
    return
  }

  ui.displayInfo('Opening configuration file in editor with live reload...')
  ui.displayInfo('Any changes you save will be automatically reloaded and synced.')

  // Initialize S3SyncManager for direct sync without triggering file watcher
  const s3SyncManager = S3SyncManager.getInstance()

  const onConfigReload = (config: any): void => {
    try {
      // Validate the config structure
      if (!config || typeof config !== 'object') {
        ui.displayError('Invalid configuration format')
        return
      }

      // Trigger S3 sync directly without re-saving the config file
      // This avoids the infinite loop caused by the file watcher
      s3SyncManager.autoUploadAfterChange().catch((error) => {
        // Silent fail for auto-sync, but log for debugging
        ui.displayError(`Auto-sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      })

      ui.displaySuccess('✅ Configuration changes detected, validated, and synced!')
    }
    catch (error) {
      ui.displayError(`❌ Failed to process config changes: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  await editConfigFileInEditor(configFilePath, onConfigReload)
}
