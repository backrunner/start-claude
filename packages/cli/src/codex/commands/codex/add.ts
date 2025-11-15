import type { CodexConfig } from '../../config/types'
import inquirer from 'inquirer'
import { UILogger } from '../../../utils/cli/ui'
import { CodexConfigManager } from '../../config/manager'

export async function handleCodexAddCommand(): Promise<void> {
  const ui = new UILogger()
  ui.displayWelcome()

  const configManager = CodexConfigManager.getInstance()

  // Prompt for configuration details
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Configuration name:',
      validate: (input: string) => {
        const name = input.trim()
        if (!name) {
          return 'Name is required'
        }
        return true
      },
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'OpenAI API Key:',
      mask: '*',
      validate: (input: string) => {
        const key = input.trim()
        if (!key) {
          return 'API Key is required'
        }
        return true
      },
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL (optional, for custom endpoints):',
      default: '',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model (optional):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'isDefault',
      message: 'Set as default configuration?',
      default: false,
    },
  ])

  // Check if config name already exists
  const existing = configManager.getConfig(answers.name)
  if (existing) {
    ui.displayError(`Configuration "${answers.name}" already exists`)
    return
  }

  // Create new config
  const newConfig: CodexConfig = {
    name: answers.name.trim(),
    apiKey: answers.apiKey.trim(),
    baseUrl: answers.baseUrl?.trim() || undefined,
    model: answers.model?.trim() || undefined,
    isDefault: answers.isDefault,
    enabled: true,
    order: 0,
  }

  // If setting as default, clear other defaults
  if (newConfig.isDefault) {
    const configs = configManager.listConfigs()
    configs.forEach((c: CodexConfig) => c.isDefault = false)
  }

  // Add the config
  configManager.addConfig(newConfig)

  ui.displaySuccess(`Codex configuration "${newConfig.name}" added successfully!`)

  if (newConfig.isDefault) {
    ui.displayInfo('This configuration has been set as default')
  }

  ui.displayInfo(`\nYou can now start Codex with: start-codex`)
  ui.displayInfo(`Or use a specific config: start-codex ${newConfig.name}`)
}
