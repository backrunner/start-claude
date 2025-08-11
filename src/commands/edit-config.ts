import { ConfigManager } from '../config/manager'
import { editConfigFileInEditor } from '../utils/editor'
import { displayError, displayInfo, displaySuccess, displayWelcome } from '../utils/ui'

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

  // Initialize ConfigManager for S3 sync
  const configManager = new ConfigManager()

  const onConfigReload = (config: any): void => {
    try {
      // Validate the config structure
      if (!config || typeof config !== 'object') {
        displayError('Invalid configuration format')
        return
      }

      // Load the config through ConfigManager to trigger S3 sync
      // We do this by reading and re-saving the config file through ConfigManager
      const configFile = configManager.load()

      // Re-save to trigger auto-sync callback if S3 is configured
      configManager.save(configFile)

      displaySuccess('✅ Configuration changes detected, validated, and synced!')
    }
    catch (error) {
      displayError(`❌ Failed to process config changes: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  await editConfigFileInEditor(configFilePath, onConfigReload)
}
