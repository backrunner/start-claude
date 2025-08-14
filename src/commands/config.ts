import process from 'node:process'
import inquirer from 'inquirer'
import { ConfigManager } from '../config/manager'
import { displayError, displayInfo, displaySuccess } from '../utils/cli/ui'

export async function handleRemoveCommand(name: string): Promise<void> {
  const configManager = new ConfigManager()
  const config = configManager.getConfig(name)
  if (!config) {
    displayError(`Configuration "${name}" not found`)
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
    configManager.removeConfig(name)
    displaySuccess(`Configuration "${name}" removed successfully!`)
  }
  else {
    displayInfo('Operation cancelled')
  }
}

export async function handleListCommand(): Promise<void> {
  const configManager = new ConfigManager()
  const configs = configManager.listConfigs()
  const { displayConfigList, displayWelcome } = await import('../utils/cli/ui')
  displayWelcome()
  displayConfigList(configs)
}

export async function handleDefaultCommand(name: string): Promise<void> {
  const configManager = new ConfigManager()
  const success = configManager.setDefaultConfig(name)
  if (success) {
    displaySuccess(`Configuration "${name}" set as default`)
  }
  else {
    displayError(`Configuration "${name}" not found`)
    process.exit(1)
  }
}
