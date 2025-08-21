import process from 'node:process'
import inquirer from 'inquirer'
import { ConfigManager } from '../config/manager'
import { UILogger } from '../utils/cli/ui'

export async function handleRemoveCommand(name: string): Promise<void> {
  const ui = new UILogger()
  const configManager = ConfigManager.getInstance()
  const config = await configManager.getConfig(name)
  if (!config) {
    ui.displayError(`Configuration "${name}" not found`)
    process.exit(1)
  }

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to remove configuration "${name}"?`,
      default: false,
    },
  ])

  if (answers.confirm) {
    await configManager.removeConfig(name)
    ui.displaySuccess(`Configuration "${name}" removed successfully!`)
  }
  else {
    ui.displayInfo('Operation cancelled')
  }
}

export async function handleListCommand(): Promise<void> {
  const ui = new UILogger()
  const configManager = ConfigManager.getInstance()
  const configs = configManager.listConfigs()
  ui.displayWelcome()
  ui.displayConfigList(configs)
}

export async function handleDefaultCommand(name: string): Promise<void> {
  const ui = new UILogger()
  const configManager = ConfigManager.getInstance()
  const success = await configManager.setDefaultConfig(name)
  if (success) {
    ui.displaySuccess(`Configuration "${name}" set as default`)
  }
  else {
    ui.displayError(`Configuration "${name}" not found`)
    process.exit(1)
  }
}
