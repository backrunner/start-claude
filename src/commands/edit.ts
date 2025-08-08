import type { ClaudeConfig } from '../core/types'
import process from 'node:process'
import inquirer from 'inquirer'
import { ConfigManager } from '../core/config'
import { editConfigInEditor } from '../utils/editor'
import { displayError, displaySuccess, displayWelcome } from '../utils/ui'

export async function handleEditCommand(name: string, options: { useEditor?: boolean }): Promise<void> {
  displayWelcome()

  const configManager = new ConfigManager()
  const config = configManager.getConfig(name)
  if (!config) {
    displayError(`Configuration "${name}" not found`)
    process.exit(1)
  }

  if (options.useEditor) {
    const updatedConfig = await editConfigInEditor(config)
    if (updatedConfig) {
      if (updatedConfig.isDefault && !config.isDefault) {
        const configs = configManager.listConfigs()
        configs.forEach(c => c.isDefault = false)
      }

      configManager.addConfig(updatedConfig)
      displaySuccess(`Configuration "${name}" updated successfully!`)
    }
    return
  }

  // Ask for profile type (with current value as default)
  const profileTypeAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'profileType',
      message: 'Profile type:',
      choices: [
        { name: 'Default (custom API settings)', value: 'default' },
        { name: 'Official (use official Claude login with proxy support)', value: 'official' },
      ],
      default: config.profileType || 'default',
    },
  ])

  const questions: any[] = []

  // Add profile-specific questions
  if (profileTypeAnswer.profileType === 'default') {
    questions.push(
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Base URL:',
        default: config.baseUrl ?? '',
      },
      {
        type: 'password',
        name: 'apiKey',
        message: 'API Key:',
        default: config.apiKey ?? '',
        mask: '*',
      },
    )
  }
  else if (profileTypeAnswer.profileType === 'official') {
    questions.push(
      {
        type: 'input',
        name: 'httpProxy',
        message: 'HTTP Proxy:',
        default: config.httpProxy ?? '',
      },
      {
        type: 'input',
        name: 'httpsProxy',
        message: 'HTTPS Proxy:',
        default: config.httpsProxy ?? '',
      },
    )
  }

  // Add common questions
  questions.push(
    {
      type: 'input',
      name: 'model',
      message: 'Model:',
      default: config.model || '',
    },
    {
      type: 'list',
      name: 'permissionMode',
      message: 'Permission mode:',
      choices: [
        { name: 'Default (ask for permissions)', value: 'default' },
        { name: 'Accept Edits (auto-accept file edits)', value: 'acceptEdits' },
        { name: 'Plan (planning mode)', value: 'plan' },
        { name: 'Bypass Permissions (dangerous)', value: 'bypassPermissions' },
        { name: 'None (use Claude default)', value: null },
      ],
      default: config.permissionMode || null,
    },
    {
      type: 'confirm',
      name: 'isDefault',
      message: 'Set as default configuration?',
      default: config.isDefault ?? false,
    },
  )

  const answers = await inquirer.prompt(questions)

  const updatedConfig: ClaudeConfig = {
    ...config,
    profileType: profileTypeAnswer.profileType,
    baseUrl: profileTypeAnswer.profileType === 'default' ? (answers.baseUrl?.trim() || undefined) : undefined,
    apiKey: profileTypeAnswer.profileType === 'default' ? (answers.apiKey?.trim() || undefined) : undefined,
    httpProxy: profileTypeAnswer.profileType === 'official' ? (answers.httpProxy?.trim() || undefined) : undefined,
    httpsProxy: profileTypeAnswer.profileType === 'official' ? (answers.httpsProxy?.trim() || undefined) : undefined,
    model: answers.model?.trim() || undefined,
    permissionMode: answers.permissionMode || undefined,
    isDefault: answers.isDefault,
  }

  configManager.addConfig(updatedConfig)

  if (updatedConfig.isDefault && !config.isDefault) {
    configManager.setDefaultConfig(updatedConfig.name)
  }

  displaySuccess(`Configuration "${name}" updated successfully!`)
}