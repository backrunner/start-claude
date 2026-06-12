import type { ConfigManager } from '../config/manager'
import type { ClaudeConfig } from '../config/types'
import type { S3SyncManager } from '../storage/s3-sync'
import process from 'node:process'
import inquirer from 'inquirer'
import { LoadBalancerStrategy } from '../config/types'
import { TransformerService } from '../services/transformer'
import { findClosestMatch, isSimilarEnough } from '../utils/cli/fuzzy-match'
import { UILogger } from '../utils/cli/ui'
import { hasConfigApiCredentials } from '../utils/config/credentials'

export interface ProgramOptions {
  config?: string
  list?: boolean
  healthCheck?: boolean
  addDir?: string[]
  agent?: string
  agents?: string
  allowDangerouslySkipPermissions?: boolean
  allowedTools?: string[]
  appendSystemPrompt?: string
  bare?: boolean
  betas?: string[]
  brief?: boolean
  chrome?: boolean
  continue?: boolean
  dangerouslySkipPermissions?: boolean
  debug?: boolean | string
  debugFile?: string
  disableSlashCommands?: boolean
  disallowedTools?: string[]
  effort?: string
  excludeDynamicSystemPromptSections?: boolean
  fallbackModel?: string
  file?: string[]
  forkSession?: boolean
  fromPr?: boolean | string
  ide?: boolean
  includeHookEvents?: boolean
  includePartialMessages?: boolean
  inputFormat?: string
  jsonSchema?: string
  maxBudgetUsd?: string
  maxTurns?: number
  mcpConfig?: string[]
  mcpDebug?: boolean
  model?: string
  name?: string
  outputFormat?: string
  permissionMode?: string
  permissionPromptTool?: boolean
  pluginDir?: string[]
  pluginUrl?: string[]
  print?: boolean | string
  promptSuggestions?: boolean | string
  remoteControl?: boolean | string
  remoteControlSessionNamePrefix?: string
  replayUserMessages?: boolean
  resume?: boolean | string
  safeMode?: boolean
  sessionPersistence?: boolean
  sessionId?: string
  settingSources?: string
  settings?: string
  strictMcpConfig?: boolean
  systemPrompt?: string
  tmux?: boolean | string
  tools?: string[]
  verbose?: boolean
  worktree?: boolean | string
  checkUpdates?: boolean
  forceConfigCheck?: boolean
  env?: string[]
  proxy?: string
  apiKey?: string
  baseUrl?: string
  skipHealthCheck?: boolean
}

export interface ConfigSelector {
  value?: string
  source: 'option' | 'positional' | 'none'
}

type OptionValueMode = 'none' | 'required' | 'optional' | 'variadic'

const handledOptionSpecs: Record<string, { value: OptionValueMode, filterInline?: boolean }> = {
  '--config': { value: 'required' },
  '--list': { value: 'none' },
  '--health-check': { value: 'none' },
  '--add-dir': { value: 'variadic' },
  '--agent': { value: 'required' },
  '--agents': { value: 'required' },
  '--allow-dangerously-skip-permissions': { value: 'none' },
  '--allowedTools': { value: 'variadic' },
  '--allowed-tools': { value: 'variadic' },
  '--append-system-prompt': { value: 'required' },
  '--bare': { value: 'none' },
  '--betas': { value: 'variadic' },
  '--brief': { value: 'none' },
  '--chrome': { value: 'none' },
  '--no-chrome': { value: 'none' },
  '-c': { value: 'none' },
  '--continue': { value: 'none' },
  '--dangerously-skip-permissions': { value: 'none' },
  '-d': { value: 'optional' },
  '--debug': { value: 'optional' },
  '--debug-file': { value: 'required' },
  '--disable-slash-commands': { value: 'none' },
  '--disallowedTools': { value: 'variadic' },
  '--disallowed-tools': { value: 'variadic' },
  '--effort': { value: 'required' },
  '--exclude-dynamic-system-prompt-sections': { value: 'none' },
  '--fallback-model': { value: 'required' },
  '--file': { value: 'variadic' },
  '--fork-session': { value: 'none' },
  '--from-pr': { value: 'optional' },
  '--ide': { value: 'none' },
  '--include-hook-events': { value: 'none' },
  '--include-partial-messages': { value: 'none' },
  '--input-format': { value: 'required' },
  '--json-schema': { value: 'required' },
  '--max-budget-usd': { value: 'required' },
  '--max-turns': { value: 'required' },
  '--mcp-config': { value: 'variadic' },
  '--mcp-debug': { value: 'none' },
  '--model': { value: 'required' },
  '-n': { value: 'required' },
  '--name': { value: 'required' },
  '--no-session-persistence': { value: 'none' },
  '--output-format': { value: 'required' },
  '--permission-mode': { value: 'required' },
  '--permission-prompt-tool': { value: 'none' },
  '--plugin-dir': { value: 'required' },
  '--plugin-url': { value: 'required' },
  '-p': { value: 'optional' },
  '--print': { value: 'optional' },
  '--prompt-suggestions': { value: 'optional' },
  '--remote-control': { value: 'optional' },
  '--remote-control-session-name-prefix': { value: 'required' },
  '--replay-user-messages': { value: 'none' },
  '-r': { value: 'optional' },
  '--resume': { value: 'optional' },
  '--safe-mode': { value: 'none' },
  '--session-id': { value: 'required' },
  '--setting-sources': { value: 'required' },
  '--settings': { value: 'required' },
  '--strict-mcp-config': { value: 'none' },
  '--system-prompt': { value: 'required' },
  '--tmux': { value: 'none', filterInline: false },
  '--tools': { value: 'variadic' },
  '--verbose': { value: 'none' },
  '-w': { value: 'optional' },
  '--worktree': { value: 'optional' },
  '--check-updates': { value: 'none' },
  '--force-config-check': { value: 'none' },
  '-e': { value: 'required' },
  '--env': { value: 'required' },
  '--proxy': { value: 'required' },
  '--api-key': { value: 'required' },
  '--base-url': { value: 'required' },
  '--strategy': { value: 'required' },
  '--all': { value: 'none' },
  '--skip-health-check': { value: 'none' },
}

/**
 * Parse and validate the load balancer strategy from CLI options
 */
export function parseBalanceStrategy(
  balanceOption: boolean | string | undefined,
): { enabled: boolean, strategy?: LoadBalancerStrategy } {
  if (balanceOption === false || balanceOption === undefined) {
    return { enabled: false }
  }

  if (balanceOption === true) {
    return { enabled: true } // Use system default strategy
  }

  // Handle string values
  const strategy = String(balanceOption).toLowerCase()
  const ui = new UILogger()

  switch (strategy) {
    case 'fallback':
      return { enabled: true, strategy: LoadBalancerStrategy.Fallback }
    case 'polling':
      return { enabled: true, strategy: LoadBalancerStrategy.Polling }
    case 'speedfirst':
    case 'speed-first':
      return { enabled: true, strategy: LoadBalancerStrategy.SpeedFirst }
    default:
      ui.warning(`❌ Unknown balance strategy '${strategy}'.`)
      ui.info('💡 Available strategies:')
      ui.info('   • fallback    - Priority-based with failover (default)')
      ui.info('   • polling     - Round-robin across all endpoints')
      ui.info('   • speedfirst  - Route to fastest responding endpoint')
      ui.error('Using fallback strategy instead.')
      return { enabled: true, strategy: LoadBalancerStrategy.Fallback } // Fallback to a safe default
  }
}

export interface CliOverrides {
  env?: string[]
  proxy?: string
  apiKey?: string
  authToken?: string // Primary API key (ANTHROPIC_AUTH_TOKEN)
  baseUrl?: string
  model?: string
}

export function isDebugEnabled(options: Pick<ProgramOptions, 'debug'>): boolean {
  return options.debug !== undefined && options.debug !== false
}

/**
 * Build Claude command arguments from program options and config
 */
export function buildClaudeArgs(
  options: ProgramOptions,
  config?: ClaudeConfig,
): string[] {
  const claudeArgs: string[] = []

  pushVariadicOption(claudeArgs, '--add-dir', options.addDir)
  pushStringOption(claudeArgs, '--agent', options.agent)
  pushStringOption(claudeArgs, '--agents', options.agents)
  pushBooleanOption(claudeArgs, '--allow-dangerously-skip-permissions', options.allowDangerouslySkipPermissions)
  pushVariadicOption(claudeArgs, '--allowedTools', options.allowedTools)
  pushStringOption(claudeArgs, '--append-system-prompt', options.appendSystemPrompt)
  pushBooleanOption(claudeArgs, '--bare', options.bare)
  pushVariadicOption(claudeArgs, '--betas', options.betas)
  pushBooleanOption(claudeArgs, '--brief', options.brief)
  pushTriStateOption(claudeArgs, '--chrome', '--no-chrome', options.chrome)
  pushBooleanOption(claudeArgs, '-c', options.continue)
  pushBooleanOption(claudeArgs, '--dangerously-skip-permissions', options.dangerouslySkipPermissions)
  pushOptionalValueOption(claudeArgs, '-d', options.debug)
  pushStringOption(claudeArgs, '--debug-file', options.debugFile)
  pushBooleanOption(claudeArgs, '--disable-slash-commands', options.disableSlashCommands)
  pushVariadicOption(claudeArgs, '--disallowedTools', options.disallowedTools)
  pushStringOption(claudeArgs, '--effort', options.effort)
  pushBooleanOption(claudeArgs, '--exclude-dynamic-system-prompt-sections', options.excludeDynamicSystemPromptSections)
  pushStringOption(claudeArgs, '--fallback-model', options.fallbackModel)
  pushVariadicOption(claudeArgs, '--file', options.file)
  pushBooleanOption(claudeArgs, '--fork-session', options.forkSession)
  pushOptionalValueOption(claudeArgs, '--from-pr', options.fromPr)
  pushBooleanOption(claudeArgs, '--ide', options.ide)
  pushBooleanOption(claudeArgs, '--include-hook-events', options.includeHookEvents)
  pushBooleanOption(claudeArgs, '--include-partial-messages', options.includePartialMessages)
  pushStringOption(claudeArgs, '--input-format', options.inputFormat)
  pushStringOption(claudeArgs, '--json-schema', options.jsonSchema)
  pushStringOption(claudeArgs, '--max-budget-usd', options.maxBudgetUsd)
  pushNumberOption(claudeArgs, '--max-turns', options.maxTurns)
  pushVariadicOption(claudeArgs, '--mcp-config', options.mcpConfig)
  pushBooleanOption(claudeArgs, '--mcp-debug', options.mcpDebug)
  pushStringOption(claudeArgs, '--model', options.model)
  pushStringOption(claudeArgs, '--name', options.name)
  pushTriStateOption(claudeArgs, undefined, '--no-session-persistence', options.sessionPersistence)
  pushStringOption(claudeArgs, '--output-format', options.outputFormat)

  if (config?.permissionMode && !options.permissionMode) {
    claudeArgs.push('--permission-mode', config.permissionMode)
  }

  pushStringOption(claudeArgs, '--permission-mode', options.permissionMode)
  pushBooleanOption(claudeArgs, '--permission-prompt-tool', options.permissionPromptTool)
  pushRepeatableStringOption(claudeArgs, '--plugin-dir', options.pluginDir)
  pushRepeatableStringOption(claudeArgs, '--plugin-url', options.pluginUrl)
  pushOptionalValueOption(claudeArgs, '--print', options.print)
  pushOptionalValueOption(claudeArgs, '--prompt-suggestions', options.promptSuggestions)
  pushOptionalValueOption(claudeArgs, '--remote-control', options.remoteControl)
  pushStringOption(claudeArgs, '--remote-control-session-name-prefix', options.remoteControlSessionNamePrefix)
  pushBooleanOption(claudeArgs, '--replay-user-messages', options.replayUserMessages)
  pushOptionalValueOption(claudeArgs, '--resume', options.resume)
  pushBooleanOption(claudeArgs, '--safe-mode', options.safeMode)
  pushStringOption(claudeArgs, '--session-id', options.sessionId)
  pushStringOption(claudeArgs, '--setting-sources', options.settingSources)
  pushStringOption(claudeArgs, '--settings', options.settings)
  pushBooleanOption(claudeArgs, '--strict-mcp-config', options.strictMcpConfig)
  pushStringOption(claudeArgs, '--system-prompt', options.systemPrompt)
  pushTmuxOption(claudeArgs, options.tmux)
  pushVariadicOption(claudeArgs, '--tools', options.tools)
  pushBooleanOption(claudeArgs, '--verbose', options.verbose)
  pushOptionalValueOption(claudeArgs, '--worktree', options.worktree)

  return claudeArgs
}

function pushBooleanOption(args: string[], flag: string, value: boolean | undefined): void {
  if (value) {
    args.push(flag)
  }
}

function pushTriStateOption(
  args: string[],
  positiveFlag: string | undefined,
  negativeFlag: string,
  value: boolean | undefined,
): void {
  if (value === true && positiveFlag) {
    args.push(positiveFlag)
  }
  if (value === false) {
    args.push(negativeFlag)
  }
}

function pushStringOption(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined) {
    args.push(flag, value)
  }
}

function pushNumberOption(args: string[], flag: string, value: number | undefined): void {
  if (value !== undefined && !Number.isNaN(value)) {
    args.push(flag, value.toString())
  }
}

function pushOptionalValueOption(args: string[], flag: string, value: boolean | string | undefined): void {
  if (value === true) {
    args.push(flag)
  }
  else if (typeof value === 'string') {
    args.push(flag, value)
  }
}

function pushTmuxOption(args: string[], value: boolean | string | undefined): void {
  if (value === true) {
    args.push('--tmux')
  }
  else if (typeof value === 'string') {
    args.push(`--tmux=${value}`)
  }
}

function pushVariadicOption(args: string[], flag: string, values: string[] | undefined): void {
  if (values?.length) {
    args.push(flag, ...values)
  }
}

function pushRepeatableStringOption(args: string[], flag: string, values: string[] | undefined): void {
  values?.forEach(value => args.push(flag, value))
}

/**
 * Filter out start-claude specific arguments from process.argv
 */
export function filterProcessArgs(configArgOrSelector?: string | ConfigSelector): string[] {
  const args = process.argv.slice(2)
  const configSelector = typeof configArgOrSelector === 'object'
    ? { ...configArgOrSelector }
    : resolveStartConfigSelector(args, { positionalConfig: configArgOrSelector })
  const filtered: string[] = []

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]

    if (arg === '--') {
      filtered.push(...args.slice(index + 1))
      break
    }

    if (arg === 'proxy') {
      continue
    }

    const valueSkip = getHandledOptionValueSkip(args, index)
    if (valueSkip !== undefined) {
      index += valueSkip
      continue
    }

    if (configSelector.source === 'positional' && arg === configSelector.value) {
      configSelector.source = 'none'
      continue
    }

    filtered.push(arg)
  }

  return filtered
}

export function resolveStartConfigSelector(
  args: string[],
  options: { optionConfig?: string, positionalConfig?: string, configExists?: (name: string) => boolean },
): ConfigSelector {
  const optionConfig = findOptionConfigSelector(args)
  if (optionConfig !== undefined) {
    return { value: optionConfig, source: 'option' }
  }

  const positionalConfig = options.optionConfig === undefined ? options.positionalConfig : undefined
  if (!positionalConfig) {
    return { source: 'none' }
  }

  if (options.configExists && !options.configExists(positionalConfig)) {
    return { source: 'none' }
  }

  return { value: positionalConfig, source: 'positional' }
}

export async function resolveStartConfigSelectorAsync(
  args: string[],
  options: {
    optionConfig?: string
    positionalConfig?: string
    configExists?: (name: string) => Promise<boolean>
  },
): Promise<ConfigSelector> {
  const optionConfig = findOptionConfigSelector(args)
  if (optionConfig !== undefined) {
    return { value: optionConfig, source: 'option' }
  }

  const positionalConfig = options.optionConfig === undefined ? options.positionalConfig : undefined
  if (!positionalConfig) {
    return { source: 'none' }
  }

  if (options.configExists && !(await options.configExists(positionalConfig))) {
    return { source: 'none' }
  }

  return { value: positionalConfig, source: 'positional' }
}

function findOptionConfigSelector(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--') {
      return undefined
    }
    if (arg === '--config') {
      return args[index + 1]
    }
    if (arg.startsWith('--config=')) {
      return arg.slice('--config='.length)
    }
  }

  return undefined
}

function getHandledOptionValueSkip(args: string[], index: number): number | undefined {
  const arg = args[index]
  const [flag] = arg.split('=', 1)

  const inlineOptionSpec = handledOptionSpecs[flag]
  if (arg.includes('=') && inlineOptionSpec) {
    return inlineOptionSpec.filterInline === false ? undefined : 0
  }

  const optionSpec = handledOptionSpecs[arg]
  if (!optionSpec) {
    return undefined
  }

  if (optionSpec.value === 'none') {
    return 0
  }

  if (optionSpec.value === 'required') {
    return hasNextValue(args, index) ? 1 : 0
  }

  if (optionSpec.value === 'optional') {
    return hasNextValue(args, index) ? 1 : 0
  }

  return countVariadicValues(args, index)
}

function hasNextValue(args: string[], index: number): boolean {
  const value = args[index + 1]
  return value !== undefined && value !== '--' && !value.startsWith('-')
}

function countVariadicValues(args: string[], index: number): number {
  let count = 0
  for (let valueIndex = index + 1; valueIndex < args.length; valueIndex++) {
    const value = args[valueIndex]
    if (value === '--' || value.startsWith('-')) {
      break
    }
    count += 1
  }
  return count
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
  hasAlreadySynced = false, // New parameter to avoid double sync
): Promise<ClaudeConfig | undefined> {
  const ui = new UILogger()
  if (!(await s3SyncManager.isS3Configured())) {
    return undefined
  }

  // Skip S3 download if cloud sync is enabled (cloud sync auto-syncs via filesystem)
  if (s3SyncManager.isCloudSyncEnabled()) {
    ui.verbose('Cloud sync is enabled, skipping S3 download check')
    return undefined
  }

  // Only perform sync if it hasn't been done already
  if (!hasAlreadySynced) {
    ui.info(`Configuration "${configName}" not found locally. Checking S3 for updates...`)
    // Use silent auto-sync to avoid prompts during startup
    const syncSuccess = await s3SyncManager.checkAutoSync({ silent: true })
    if (!syncSuccess) {
      return undefined
    }
  }

  return configManager.getConfig(configName)
}

/**
 * Handle S3 download for empty local configs
 */
async function handleS3EmptyConfigDownload(
  configManager: ConfigManager,
  s3SyncManager: S3SyncManager,
): Promise<ClaudeConfig | undefined> {
  const ui = new UILogger()
  if (!(await s3SyncManager.isS3Configured())) {
    return undefined
  }

  // Skip S3 download if cloud sync is enabled (cloud sync auto-syncs via filesystem)
  if (s3SyncManager.isCloudSyncEnabled()) {
    ui.verbose('Cloud sync is enabled, skipping S3 download check')
    return undefined
  }

  ui.info('No local configurations found, but S3 sync is configured.')
  ui.info('Checking S3 for existing configurations...')

  const downloadSuccess = await s3SyncManager.downloadConfigs(true)
  if (!downloadSuccess) {
    return undefined
  }

  // Try to get default config again after download
  const config = await configManager.getDefaultConfig()
  if (config) {
    ui.info(`Using downloaded configuration: ${config.name}`)
    return config
  }

  // Downloaded configs exist but no default, let user choose
  const downloadedConfigs = await configManager.listConfigs()
  if (downloadedConfigs.length === 0) {
    return undefined
  }

  ui.info('Choose a configuration to use:')
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedConfig',
      message: 'Select configuration:',
      choices: downloadedConfigs.map((c: any) => ({
        name: `${c.name}${c.isDefault ? ' (default)' : ''}`,
        value: c.name,
      })),
    },
  ])

  return configManager.getConfig(answers.selectedConfig as string)
}

/**
 * Handle S3 update check for existing configs (silent during startup)
 */
async function handleS3UpdateCheck(
  configManager: ConfigManager,
  s3SyncManager: S3SyncManager,
): Promise<ClaudeConfig | undefined> {
  if (!(await s3SyncManager.isS3Configured())) {
    return undefined
  }

  // Skip S3 download if cloud sync is enabled (cloud sync auto-syncs via filesystem)
  if (s3SyncManager.isCloudSyncEnabled()) {
    // Note: checkAutoSync will still upload to S3 as backup when cloud sync is enabled
    return undefined
  }

  const syncSuccess = await s3SyncManager.checkAutoSync({ silent: true })
  if (syncSuccess) {
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
  hasAlreadySynced = false, // New parameter to avoid double sync
  selector?: ConfigSelector,
): Promise<ClaudeConfig | undefined> {
  let config: ClaudeConfig | undefined

  const resolvedSelector = selector ?? {
    value: options.config || configArg,
    source: (options.config || configArg) ? 'option' as const : 'none' as const,
  }
  const configName = resolvedSelector.value

  if (configName !== undefined) {
    config = await configManager.getConfig(configName)
    if (!config) {
      // If config not found and S3 is configured, check for newer remote config
      config = await handleS3ConfigLookup(configManager, s3SyncManager, configName, hasAlreadySynced)
      if (!config) {
        // Try fuzzy matching before giving up
        const allConfigs = await configManager.listConfigs()
        const configNames = allConfigs.map((c: any) => c.name)
        const closest = findClosestMatch(configName, configNames)

        if (closest && isSimilarEnough(closest.similarity, 0.6)) {
          const ui = new UILogger()
          ui.warning(`Configuration "${configName}" not found`)
          ui.info(`💡 Did you mean "${closest.match}"?`)

          const confirmAnswer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'useClosest',
              message: `Start with "${closest.match}" instead?`,
              default: true,
            },
          ])

          if (confirmAnswer.useClosest) {
            config = await configManager.getConfig(closest.match)
            if (config) {
              ui.success(`✅ Using configuration "${closest.match}"`)
              return config
            }
          }
        }

        const ui = new UILogger()
        ui.error(`Configuration "${configName}" not found`)

        // Show available configurations for reference
        if (configNames.length > 0) {
          ui.info('📋 Available configurations:')
          configNames.forEach(name => ui.info(`  - ${name}`))
        }

        process.exit(1)
      }
    }
    return config
  }

  config = await configManager.getDefaultConfig()

  if (!config) {
    const configs = await configManager.listConfigs()

    if (configs.length === 0) {
      // Check if S3 sync is configured and try to download first
      config = await handleS3EmptyConfigDownload(configManager, s3SyncManager)
      if (config) {
        return config
      }

      // If still no config after S3 check, create a new one
      return createNewConfig(configManager)
    }
    else {
      // Check for newer remote configs only if we haven't already synced at startup
      if (!hasAlreadySynced) {
        const updatedConfig = await handleS3UpdateCheck(
          configManager,
          s3SyncManager,
        )
        if (updatedConfig) {
          config = updatedConfig
        }
      }

      if (!config) {
        const ui = new UILogger()
        ui.info('Choose a configuration to use:')

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
    // Check for newer version on S3 only if we haven't already synced at startup
    if (!hasAlreadySynced) {
      const updatedConfig = await handleS3UpdateCheck(
        configManager,
        s3SyncManager,
      )
      if (updatedConfig) {
        config = updatedConfig
      }
    }
  }

  return config
}

/**
 * Create a new configuration interactively
 */
async function createNewConfig(
  configManager: ConfigManager,
): Promise<ClaudeConfig> {
  const ui = new UILogger()
  ui.warning('No configurations found. Let\'s create your first one!')

  // First ask for profile type
  const profileTypeAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'profileType',
      message: 'Profile type:',
      choices: [
        { name: 'Default (custom API settings)', value: 'default' },
        {
          name: 'Official (use official Claude login with proxy support)',
          value: 'official',
        },
      ],
      default: 'default',
    },
  ])

  const questions: any[] = [
    {
      type: 'input',
      name: 'name',
      message: 'Configuration name:',
      validate: (input: string) => (input.trim() ? true : 'Name is required'),
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
        { name: 'Auto (automatically decide when to ask)', value: 'auto' },
        { name: 'Don\'t Ask (never ask for permissions)', value: 'dontAsk' },
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
    baseUrl:
      profileTypeAnswer.profileType === 'default'
        ? answers.baseUrl?.trim() || undefined
        : undefined,
    apiKey:
      profileTypeAnswer.profileType === 'default'
        ? answers.apiKey?.trim() || undefined
        : undefined,
    httpProxy:
      profileTypeAnswer.profileType === 'official'
        ? answers.httpProxy?.trim() || undefined
        : undefined,
    httpsProxy:
      profileTypeAnswer.profileType === 'official'
        ? answers.httpsProxy?.trim() || undefined
        : undefined,
    model: answers.model?.trim() || undefined,
    permissionMode: answers.permissionMode || undefined,
    isDefault: answers.isDefault,
  }

  await configManager.addConfig(newConfig)

  if (newConfig.isDefault) {
    await configManager.setDefaultConfig(newConfig.name)
  }

  ui.success(`Configuration "${newConfig.name}" created successfully!`)

  return newConfig
}

/**
 * Resolve base configuration for load balancer mode
 */
export async function resolveBaseConfig(
  configManager: ConfigManager,
  options: ProgramOptions,
  configArg: string | undefined,
  balanceableConfigs: ClaudeConfig[],
  selector?: ConfigSelector,
): Promise<ClaudeConfig | undefined> {
  let baseConfig: ClaudeConfig | undefined
  const resolvedSelector = selector ?? {
    value: options.config || configArg,
    source: (options.config || configArg) ? 'option' as const : 'none' as const,
  }
  const configName = resolvedSelector.value

  if (configName !== undefined) {
    baseConfig = await configManager.getConfig(configName)
    if (!baseConfig) {
      const ui = new UILogger()
      ui.error(`Configuration "${configName}" not found`)
      process.exit(1)
    }
    if (
      !balanceableConfigs.find(
        c => c.name.toLowerCase() === baseConfig?.name.toLowerCase(),
      )
    ) {
      const hasTransformer
        = 'transformerEnabled' in baseConfig
          && TransformerService.isTransformerEnabled(baseConfig.transformerEnabled)
      const missingCompleteApiCredentials
        = !hasConfigApiCredentials(baseConfig) || !baseConfig.model

      if (hasTransformer && missingCompleteApiCredentials) {
        const ui = new UILogger()
        ui.warning(
          `Configuration "${baseConfig.name}" is transformer-enabled but missing complete API credentials (baseUrl/apiKey or authToken/model) for API calls`,
        )
        ui.info('Using it for settings and transformer processing only')
      }
      else if (missingCompleteApiCredentials) {
        const ui = new UILogger()
        ui.warning(
          `Configuration "${baseConfig.name}" is not included in load balancing (missing baseUrl, apiKey or authToken, or model)`,
        )
        ui.info(
          'Using it for other settings only, load balancing will use available endpoints',
        )
      }
      else {
        const ui = new UILogger()
        ui.warning(
          `Configuration "${baseConfig.name}" is not included in load balancing`,
        )
        ui.info(
          'Using it for other settings only, load balancing will use available endpoints',
        )
      }
    }
  }
  else {
    baseConfig = await configManager.getDefaultConfig()
    if (!baseConfig || !balanceableConfigs.find(c => c.name.toLowerCase() === baseConfig?.name.toLowerCase())) {
      baseConfig = balanceableConfigs[0]
    }
  }

  return baseConfig
}
