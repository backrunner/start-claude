import type { ConfigManager } from '../config/manager'
import type { ClaudeConfig, LoadBalancerStrategy } from '../config/types'
import type { S3SyncManager } from '../storage/s3-sync'
import process from 'node:process'
import inquirer from 'inquirer'
import { displayError, displayInfo, displaySuccess, displayWarning } from '../utils/ui'

export interface ProgramOptions {
  config?: string
  list?: boolean
  balance?: boolean | string
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

/**
 * Parse and validate the load balancer strategy from CLI options
 */
export function parseBalanceStrategy(balanceOption: boolean | string | undefined): { enabled: boolean, strategy?: LoadBalancerStrategy } {
  if (balanceOption === false || balanceOption === undefined) {
    return { enabled: false }
  }

  if (balanceOption === true) {
    return { enabled: true } // Use system default strategy
  }

  // Handle string values
  const strategy = String(balanceOption).toLowerCase()

  switch (strategy) {
    case 'fallback':
      return { enabled: true, strategy: 'Fallback' }
    case 'polling':
      return { enabled: true, strategy: 'Polling' }
    case 'speedfirst':
    case 'speed-first':
      return { enabled: true, strategy: 'Speed First' }
    default:
      displayWarning(`❌ Unknown balance strategy '${strategy}'.`)
      displayInfo('💡 Available strategies:')
      displayInfo('   • fallback    - Priority-based with failover (default)')
      displayInfo('   • polling     - Round-robin across all endpoints')
      displayInfo('   • speedfirst  - Route to fastest responding endpoint')
      displayError('Using fallback strategy instead.')
      return { enabled: true, strategy: 'Fallback' } // Fallback to a safe default
  }
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
 * Handle S3 config checks for named config lookup
 */
async function handleS3ConfigLookup(
  configManager: ConfigManager,
  s3SyncManager: S3SyncManager,
  configName: string,
): Promise<ClaudeConfig | undefined> {
  if (!s3SyncManager.isS3Configured()) {
    return undefined
  }

  displayInfo(`Configuration "${configName}" not found locally. Checking S3 for updates...`)
  const downloadSuccess = await s3SyncManager.checkRemoteUpdates()
  if (downloadSuccess) {
    return configManager.getConfig(configName)
  }
  return undefined
}

/**
 * Handle S3 download for empty local configs
 */
async function handleS3EmptyConfigDownload(
  configManager: ConfigManager,
  s3SyncManager: S3SyncManager,
): Promise<ClaudeConfig | undefined> {
  if (!s3SyncManager.isS3Configured()) {
    return undefined
  }

  displayInfo('No local configurations found, but S3 sync is configured.')
  displayInfo('Checking S3 for existing configurations...')

  const downloadSuccess = await s3SyncManager.downloadConfigs(true)
  if (!downloadSuccess) {
    return undefined
  }

  // Try to get default config again after download
  const config = configManager.getDefaultConfig()
  if (config) {
    displayInfo(`Using downloaded configuration: ${config.name}`)
    return config
  }

  // Downloaded configs exist but no default, let user choose
  const downloadedConfigs = configManager.listConfigs()
  if (downloadedConfigs.length === 0) {
    return undefined
  }

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

/**
 * Handle S3 update check for existing configs
 */
async function handleS3UpdateCheck(
  configManager: ConfigManager,
  s3SyncManager: S3SyncManager,
): Promise<ClaudeConfig | undefined> {
  if (!s3SyncManager.isS3Configured()) {
    return undefined
  }

  const downloadSuccess = await s3SyncManager.checkRemoteUpdates()
  if (downloadSuccess) {
    return configManager.getDefaultConfig()
  }
  return undefined
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
      // If config not found and S3 is configured, check for newer remote config
      config = await handleS3ConfigLookup(configManager, s3SyncManager, configName)
      if (!config) {
        displayError(`Configuration "${configName}" not found`)
        process.exit(1)
      }
    }
    return config
  }

  config = configManager.getDefaultConfig()

  if (!config) {
    const configs = configManager.listConfigs()

    if (configs.length === 0) {
      // Check if S3 sync is configured and try to download first
      config = await handleS3EmptyConfigDownload(configManager, s3SyncManager)
      if (config) {
        return config
      }

      // If still no config after S3 check, create a new one
      return createNewConfig(configManager, s3SyncManager)
    }
    else {
      // Check for newer remote configs even when we have local configs
      const updatedConfig = await handleS3UpdateCheck(configManager, s3SyncManager)
      if (updatedConfig) {
        config = updatedConfig
      }

      if (!config) {
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
  }
  else {
    // Even when we have a default config, check if there's a newer version on S3
    const updatedConfig = await handleS3UpdateCheck(configManager, s3SyncManager)
    if (updatedConfig) {
      config = updatedConfig
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
    if (!balanceableConfigs.find(c => c.name.toLowerCase() === baseConfig?.name.toLowerCase())) {
      const hasTransformer = 'transformerEnabled' in baseConfig && baseConfig.transformerEnabled === true
      const missingCompleteApiCredentials = !baseConfig.baseUrl || !baseConfig.apiKey || !baseConfig.model

      if (hasTransformer && missingCompleteApiCredentials) {
        displayWarning(`Configuration "${baseConfig.name}" is transformer-enabled but missing complete API credentials (baseUrl/apiKey/model) for API calls`)
        displayInfo('Using it for settings and transformer processing only')
      }
      else if (missingCompleteApiCredentials) {
        displayWarning(`Configuration "${baseConfig.name}" is not included in load balancing (missing baseUrl, apiKey, or model)`)
        displayInfo('Using it for other settings only, load balancing will use available endpoints')
      }
      else {
        displayWarning(`Configuration "${baseConfig.name}" is not included in load balancing`)
        displayInfo('Using it for other settings only, load balancing will use available endpoints')
      }
    }
  }
  else {
    baseConfig = configManager.getDefaultConfig()
    if (!baseConfig || !balanceableConfigs.find(c => c.name.toLowerCase() === baseConfig?.name.toLowerCase())) {
      baseConfig = balanceableConfigs[0]
    }
  }

  return baseConfig
}
