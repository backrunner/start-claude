import type { ClaudeConfig } from '../config/types'
import inquirer from 'inquirer'
import { ConfigManager } from '../config/manager'
import { createConfigInEditor } from '../utils/cli/editor'
import { UILogger } from '../utils/cli/ui'

export async function handleAddCommand(options: { useEditor?: boolean }): Promise<void> {
  const ui = new UILogger()
  ui.displayWelcome()

  const configManager = ConfigManager.getInstance()

  if (options.useEditor) {
    const newConfig = await createConfigInEditor()
    if (newConfig) {
      // Check if config name already exists
      const existing = await configManager.getConfig(newConfig.name)
      if (existing) {
        ui.displayError('Configuration with this name already exists')
        return
      }

      if (newConfig.isDefault) {
        const configs = await configManager.listConfigs()
        configs.forEach((c: ClaudeConfig) => c.isDefault = false)
      }

      await configManager.addConfig(newConfig)
      ui.displaySuccess(`Configuration "${newConfig.name}" added successfully!`)
    }
    return
  }

  // First ask for profile type
  const profileTypeAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'profileType',
      message: 'Profile type:',
      choices: [
        { name: 'Default (custom API settings)', value: 'default' },
        { name: 'Official (use official Claude login with proxy support)', value: 'official' },
      ],
      default: 'default',
    },
  ])

  const questions: any[] = [
    {
      type: 'input',
      name: 'name',
      message: 'Configuration name:',
      validate: (input: string) => {
        const name = input.trim()
        if (!name) {
          return 'Name is required'
        }
        // Note: We'll check for duplicates after the input is provided
        return true
      },
    },
  ]

  // Add profile-specific questions
  if (profileTypeAnswer.profileType === 'default') {
    questions.push(
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Base URL (optional):',
      },
      {
        type: 'password',
        name: 'apiKey',
        message: 'API Key (optional):',
        mask: '*',
      },
    )
  }
  else if (profileTypeAnswer.profileType === 'official') {
    questions.push(
      {
        type: 'input',
        name: 'httpProxy',
        message: 'HTTP Proxy (optional):',
      },
      {
        type: 'input',
        name: 'httpsProxy',
        message: 'HTTPS Proxy (optional):',
      },
    )
  }

  // Add common questions
  questions.push(
    {
      type: 'input',
      name: 'model',
      message: 'Model (optional):',
      default: '',
    },
    {
      type: 'list',
      name: 'permissionMode',
      message: 'Permission mode (optional):',
      choices: [
        { name: 'Default (ask for permissions)', value: 'default' },
        { name: 'Accept Edits (auto-accept file edits)', value: 'acceptEdits' },
        { name: 'Plan (planning mode)', value: 'plan' },
        { name: 'Bypass Permissions (dangerous)', value: 'bypassPermissions' },
        { name: 'None (use Claude default)', value: null },
      ],
      default: null,
    },
    {
      type: 'confirm',
      name: 'isDefault',
      message: 'Set as default configuration?',
      default: false,
    },
  )

  const answers = await inquirer.prompt(questions)

  // Check if config name already exists after getting the input
  const existing = await configManager.getConfig(answers.name.trim())
  if (existing) {
    displayError('Configuration with this name already exists')
    return
  }

  const config: ClaudeConfig = {
    name: answers.name.trim(),
    profileType: profileTypeAnswer.profileType,
    baseUrl: profileTypeAnswer.profileType === 'default' ? (answers.baseUrl?.trim() || undefined) : undefined,
    apiKey: profileTypeAnswer.profileType === 'default' ? (answers.apiKey?.trim() || undefined) : undefined,
    httpProxy: profileTypeAnswer.profileType === 'official' ? (answers.httpProxy?.trim() || undefined) : undefined,
    httpsProxy: profileTypeAnswer.profileType === 'official' ? (answers.httpsProxy?.trim() || undefined) : undefined,
    model: answers.model?.trim() || undefined,
    permissionMode: answers.permissionMode || undefined,
    isDefault: answers.isDefault,
  }

  await configManager.addConfig(config)

  if (config.isDefault) {
    await configManager.setDefaultConfig(config.name)
  }

  ui.displaySuccess(`Configuration "${config.name}" added successfully!`)
}
