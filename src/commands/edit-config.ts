import { editConfigFileInEditor } from '../utils/editor'
import { displayError, displayInfo, displayWelcome } from '../utils/ui'

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
  displayInfo('Any changes you save will be automatically reloaded.')

  const onConfigReload = (_config: any): void => {
    // Just notify that the config was reloaded - the actual config management is handled by ConfigManager
    displayInfo('Configuration changes detected and available for next session.')
  }

  await editConfigFileInEditor(configFilePath, onConfigReload)
}
