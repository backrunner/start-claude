import { UILogger } from '../../../utils/cli/ui'
import { CodexConfigManager } from '../../config/manager'

export async function handleCodexSetCommand(name: string): Promise<void> {
  const ui = new UILogger()
  const configManager = CodexConfigManager.getInstance()

  // Check if config exists
  const config = configManager.getConfig(name)
  if (!config) {
    ui.displayError(`Configuration "${name}" not found`)
    ui.displayInfo('\nAvailable configurations:')
    const configs = configManager.listConfigs()
    configs.forEach((c) => {
      console.log(`  - ${c.name}`)
    })
    return
  }

  // Set as default
  const success = configManager.setDefaultConfig(name)

  if (success) {
    ui.displaySuccess(`Configuration "${name}" set as default`)
    ui.displayInfo(`\nYou can now start Codex with: start-codex`)
  }
  else {
    ui.displayError(`Failed to set "${name}" as default`)
  }
}
