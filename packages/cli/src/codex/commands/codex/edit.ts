import type { CodexConfig } from '../../config/types'
import inquirer from 'inquirer'
import { UILogger } from '../../../utils/cli/ui'
import { CodexConfigManager } from '../../config/manager'

export async function handleCodexEditCommand(name: string): Promise<void> {
  const ui = new UILogger()
  const configManager = CodexConfigManager.getInstance()

  // Check if config exists
  const config = configManager.getConfig(name)
  if (!config) {
    ui.displayError(`Configuration "${name}" not found`)
    return
  }

  ui.displayInfo(`Editing configuration "${name}"\n`)
  ui.displayInfo('Leave fields blank to keep current values\n')

  // Prompt for new values
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Configuration name:',
      default: config.name,
      validate: (input: string) => {
        const newName = input.trim()
        if (!newName) {
          return 'Name is required'
        }
        // Check if new name conflicts with another config
        if (newName.toLowerCase() !== config.name.toLowerCase()) {
          const existing = configManager.getConfig(newName)
          if (existing) {
            return `Configuration "${newName}" already exists`
          }
        }
        return true
      },
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'OpenAI API Key:',
      mask: '*',
      default: config.apiKey,
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL (optional):',
      default: config.baseUrl || '',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model (optional):',
      default: config.model || '',
    },
    {
      type: 'confirm',
      name: 'isDefault',
      message: 'Set as default configuration?',
      default: config.isDefault,
    },
    {
      type: 'confirm',
      name: 'enabled',
      message: 'Enable this configuration?',
      default: config.enabled,
    },
  ])

  // Update config
  const updatedConfig: CodexConfig = {
    ...config,
    name: answers.name.trim(),
    apiKey: answers.apiKey.trim(),
    baseUrl: answers.baseUrl?.trim() || undefined,
    model: answers.model?.trim() || undefined,
    isDefault: answers.isDefault,
    enabled: answers.enabled,
  }

  // If setting as default, clear other defaults
  if (updatedConfig.isDefault && !config.isDefault) {
    const configs = configManager.listConfigs()
    configs.forEach((c: CodexConfig) => {
      if (c.id !== config.id) {
        c.isDefault = false
      }
    })
  }

  // Save the updated config
  configManager.addConfig(updatedConfig)

  ui.displaySuccess(`Configuration "${updatedConfig.name}" updated successfully!`)

  if (updatedConfig.isDefault) {
    ui.displayInfo('This configuration has been set as default')
  }
}
