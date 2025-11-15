import inquirer from 'inquirer'
import { UILogger } from '../../../utils/cli/ui'
import { CodexConfigManager } from '../../config/manager'

export async function handleCodexRemoveCommand(name: string): Promise<void> {
  const ui = new UILogger()
  const configManager = CodexConfigManager.getInstance()

  // Check if config exists
  const config = configManager.getConfig(name)
  if (!config) {
    ui.displayError(`Configuration "${name}" not found`)
    return
  }

  // Confirm deletion
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to remove configuration "${name}"?`,
      default: false,
    },
  ])

  if (!answer.confirm) {
    ui.displayInfo('Deletion cancelled')
    return
  }

  // Remove the config (soft delete)
  const success = configManager.removeConfig(name)

  if (success) {
    ui.displaySuccess(`Configuration "${name}" removed successfully`)

    // If this was the default config, suggest setting a new one
    const remainingConfigs = configManager.listConfigs()
    if (remainingConfigs.length > 0 && !configManager.getDefaultConfig()) {
      ui.displayInfo(`\nNo default configuration set. Set one with: start-codex set <name>`)
    }
  }
  else {
    ui.displayError(`Failed to remove configuration "${name}"`)
  }
}
