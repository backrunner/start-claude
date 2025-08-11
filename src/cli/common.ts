import type { ConfigManager } from '../config/manager'
import type { ClaudeConfig } from '../config/types'
import type { S3SyncManager } from '../storage/s3-sync'
import process from 'node:process'
import inquirer from 'inquirer'
import { displayError, displayInfo, displaySuccess, displayWarning, displayWelcome } from '../utils/ui'

export interface ProgramOptions {
  config?: string
  list?: boolean
  balance?: boolean
  addDir?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  print?: boolean
  outputFormat?: string
  inputFormat?: string
  verbose?: boolean
  debug?: boolean
  maxTurns?: number
  model?: string
  permissionMode?: string
  permissionPromptTool?: boolean
  resume?: boolean
  continue?: boolean
  checkUpdates?: boolean
  dangerouslySkipPermissions?: boolean
  env?: string[]
  proxy?: string
  apiKey?: string
  baseUrl?: string
}

export interface CliOverrides {
  env?: string[]
  proxy?: string
  apiKey?: string
  baseUrl?: string
  model?: string
}

/**
 * Build Claude command arguments from program options and config
 */
export function buildClaudeArgs(options: ProgramOptions, config?: ClaudeConfig): string[] {
  const claudeArgs: string[] = []

  // Add new flags
  if (options.addDir) {
    options.addDir.forEach((dir) => {
      claudeArgs.push('--add-dir', dir)
    })
  }

  if (options.allowedTools) {
    claudeArgs.push('--allowedTools', options.allowedTools.join(','))
  }

  if (options.disallowedTools) {
    claudeArgs.push('--disallowedTools', options.disallowedTools.join(','))
  }

  if (options.print) {
    claudeArgs.push('--print')
  }

  if (options.outputFormat) {
    claudeArgs.push('--output-format', options.outputFormat)
  }

  if (options.inputFormat) {
    claudeArgs.push('--input-format', options.inputFormat)
  }

  if (options.verbose) {
    claudeArgs.push('--verbose')
  }

  if (options.debug) {
    claudeArgs.push('-d')
  }

  if (options.maxTurns) {
    claudeArgs.push('--max-turns', options.maxTurns.toString())
  }

  if (options.model) {
    claudeArgs.push('--model', options.model)
  }

  if (config?.permissionMode && !options.permissionMode) {
    claudeArgs.push('--permission-mode', config.permissionMode)
  }
  if (options.permissionMode) {
    claudeArgs.push('--permission-mode', options.permissionMode)
  }

  if (options.permissionPromptTool) {
    claudeArgs.push('--permission-prompt-tool')
  }

  if (options.resume) {
    claudeArgs.push('--resume')
  }

  if (options.continue) {
    claudeArgs.push('-c')
  }

  if (options.dangerouslySkipPermissions) {
    claudeArgs.push('--dangerously-skip-permissions')
  }

  return claudeArgs
}

/**
 * Filter out start-claude specific arguments from process.argv
 */
export function filterProcessArgs(configArg?: string): string[] {
  return process.argv.slice(2).filter((arg) => {
    // Skip flags we handle internally
    const skipFlags = [
      '--config',
      '--list',
      '--balance',
      '--add-dir',
      '--allowedTools',
      '--disallowedTools',
      '-p',
      '--print',
      '--output-format',
      '--input-format',
      '--verbose',
      '--debug',
      '--max-turns',
      '--model',
      '--permission-mode',
      '--permission-prompt-tool',
      '--resume',
      '--continue',
      '--dangerously-skip-permissions',
      '-e',
      '--env',
      '--proxy',
      '--api-key',
      '--base-url',
    ]

    // Skip the config argument if it was provided
    if (configArg && arg === configArg)
      return false

    // Skip if this is a flag we handle
    if (skipFlags.some(flag => arg.startsWith(flag)))
      return false

    // Skip values that follow flags we handle
    const prevArg = process.argv[process.argv.indexOf(arg) - 1]
    const flagsWithValues = [
      '--config',
      '--add-dir',
      '--allowedTools',
      '--disallowedTools',
      '--output-format',
      '--input-format',
      '--max-turns',
      '--model',
      '--permission-mode',
      '--env',
      '-e',
      '--proxy',
      '--api-key',
      '--base-url',
    ]
    if (prevArg && flagsWithValues.includes(prevArg))
      return false

    return true
  })
}

/**
 * Build CLI overrides object
 */
export function buildCliOverrides(options: ProgramOptions): CliOverrides {
  return {
    env: options.env || [],
    proxy: options.proxy,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
  }
}

/**
 * Resolve configuration based on options and config argument
 */
export async function resolveConfig(
  configManager: ConfigManager,
  s3SyncManager: S3SyncManager,
  options: ProgramOptions,
  configArg?: string,
): Promise<ClaudeConfig | undefined> {
  let config: ClaudeConfig | undefined
  const configName = options.config || configArg

  if (configName !== undefined) {
    config = configManager.getConfig(configName)
    if (!config) {
      displayError(`Configuration "${configName}" not found`)
      process.exit(1)
    }
    return config
  }

  config = configManager.getDefaultConfig()

  if (!config) {
    const configs = configManager.listConfigs()

    if (configs.length === 0) {
      displayWelcome()

      // Check if S3 sync is configured and try to download first
      if (s3SyncManager.isS3Configured()) {
        displayInfo('No local configurations found, but S3 sync is configured.')
        displayInfo('Checking S3 for existing configurations...')

        const downloadSuccess = await s3SyncManager.downloadConfigs(true)
        if (downloadSuccess) {
          // Try to get default config again after download
          config = configManager.getDefaultConfig()
          if (config) {
            displayInfo(`Using downloaded configuration: ${config.name}`)
            return config
          }

          // Downloaded configs exist but no default, let user choose
          const downloadedConfigs = configManager.listConfigs()
          if (downloadedConfigs.length > 0) {
            displayInfo('Choose a configuration to use:')

            const answers = await inquirer.prompt([
              {
                type: 'list',
                name: 'selectedConfig',
                message: 'Select configuration:',
                choices: downloadedConfigs.map(c => ({
                  name: `${c.name}${c.isDefault ? ' (default)' : ''}`,
                  value: c.name,
                })),
              },
            ])

            return configManager.getConfig(answers.selectedConfig as string)
          }
        }
      }

      // If still no config after S3 check, create a new one
      return createNewConfig(configManager, s3SyncManager)
    }
    else {
      displayWelcome()
      displayInfo('Choose a configuration to use:')

      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedConfig',
          message: 'Select configuration:',
          choices: configs.map(c => ({
            name: `${c.name}${c.isDefault ? ' (default)' : ''}`,
            value: c.name,
          })),
        },
      ])

      return configManager.getConfig(answers.selectedConfig as string)
    }
  }

  return config
}

/**
 * Create a new configuration interactively
 */
async function createNewConfig(configManager: ConfigManager, s3SyncManager: S3SyncManager): Promise<ClaudeConfig> {
  displayWarning('No configurations found. Let\'s create your first one!')

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
      validate: (input: string) => input.trim() ? true : 'Name is required',
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
      default: true,
    },
  )

  const answers = await inquirer.prompt(questions)

  const newConfig: ClaudeConfig = {
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

  configManager.addConfig(newConfig)

  if (newConfig.isDefault) {
    configManager.setDefaultConfig(newConfig.name)
  }

  displaySuccess(`Configuration "${newConfig.name}" created successfully!`)

  // If S3 is configured, ask if user wants to sync the new config
  if (s3SyncManager.isS3Configured()) {
    const syncAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'sync',
        message: 'Would you like to sync this configuration to S3?',
        default: true,
      },
    ])

    if (syncAnswer.sync) {
      await s3SyncManager.uploadConfigs()
    }
  }

  return newConfig
}

/**
 * Resolve base configuration for load balancer mode
 */
export function resolveBaseConfig(
  configManager: ConfigManager,
  options: ProgramOptions,
  configArg: string | undefined,
  balanceableConfigs: ClaudeConfig[],
): ClaudeConfig | undefined {
  let baseConfig: ClaudeConfig | undefined
  const configName = options.config || configArg

  if (configName !== undefined) {
    baseConfig = configManager.getConfig(configName)
    if (!baseConfig) {
      displayError(`Configuration "${configName}" not found`)
      process.exit(1)
    }
    if (!balanceableConfigs.includes(baseConfig)) {
      const hasTransformer = 'transformerEnabled' in baseConfig && baseConfig.transformerEnabled === true
      const missingApiCredentials = !baseConfig.baseUrl || !baseConfig.apiKey

      if (hasTransformer && missingApiCredentials) {
        displayWarning(`Configuration "${configName}" is transformer-enabled but missing baseUrl/apiKey for API calls`)
        displayInfo('Using it for settings and transformer processing only')
      }
      else if (missingApiCredentials) {
        displayWarning(`Configuration "${configName}" is not included in load balancing (missing baseUrl or apiKey)`)
        displayInfo('Using it for other settings only, load balancing will use available endpoints')
      }
      else {
        displayWarning(`Configuration "${configName}" is not included in load balancing`)
        displayInfo('Using it for other settings only, load balancing will use available endpoints')
      }
    }
  }
  else {
    baseConfig = configManager.getDefaultConfig()
    if (!baseConfig || !balanceableConfigs.includes(baseConfig)) {
      baseConfig = balanceableConfigs[0]
    }
  }

  return baseConfig
}
