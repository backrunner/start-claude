import type { ChildProcess } from 'node:child_process'
import type { ClaudeConfig } from '../config/types'
import type { CliOverrides } from './common'
import { spawn } from 'node:child_process'
import process from 'node:process'
import inquirer from 'inquirer'
import { ConfigManager } from '../config/manager'
import { ClaudeConfigSyncer } from '../extensions/claude-config-syncer'
import { ClaudeConfigWatcher } from '../extensions/claude-config-watcher'
import { ExtensionsWriter } from '../extensions/writer'
import { UILogger } from '../utils/cli/ui'
import { findClaudeExecutable, detectAvailableInstallMethods } from '../utils/cli/install-methods'
import { CacheManager } from '../utils/config/cache-manager'

// Global watcher instance to clean up on exit
let configWatcher: ClaudeConfigWatcher | null = null

export async function startClaude(config: ClaudeConfig | undefined, args: string[] = [], cliOverrides?: CliOverrides): Promise<number> {
  const env: NodeJS.ProcessEnv = { ...process.env }

  // Set environment variables from config (if config exists)
  if (config) {
    setEnvFromConfig(env, config)

    // Write extensions configuration before starting Claude Code
    try {
      await writeExtensionsConfig(config)
    }
    catch (error) {
      const ui = new UILogger()
      ui.warning(`Failed to write extensions configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)
      // Don't fail the entire startup, just log warning
    }
  }

  // Apply CLI overrides
  if (cliOverrides) {
    applyCliOverrides(env, cliOverrides)
  }

  // Check if claude command is available (with cache-first strategy)
  const claudeResult = findClaudeExecutable(env)

  if (!claudeResult) {
    // Claude is not installed, ask user if they want to install it
    const shouldInstall = await promptForInstallation()

    if (shouldInstall) {
      const installSuccess = await installClaudeCode()
      if (!installSuccess) {
        return 1
      }

      // Try to find claude again after installation
      const newClaudeResult = findClaudeExecutable(env)
      if (!newClaudeResult) {
        const ui = new UILogger()
        ui.error('Failed to find Claude Code after installation. Please restart your terminal.')
        return 1
      }

      // Start claude with the newly installed version
      return startClaudeProcess(newClaudeResult.path, args, env, config)
    }
    else {
      const ui = new UILogger()
      ui.error('Claude Code is required to run start-claude.')
      ui.info('You can install it manually with: pnpm add -g @anthropic-ai/claude-code')
      return 1
    }
  }
  else {
    // Claude is available, start it
    return startClaudeProcess(claudeResult.path, args, env, config)
  }
}

async function promptForInstallation(): Promise<boolean> {
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: 'Claude Code CLI is not installed. Would you like to install it automatically?',
      default: true,
    },
  ])

  return answer.install as boolean
}

async function installClaudeCode(): Promise<boolean> {
  const ui = new UILogger()

  const allMethods = await detectAvailableInstallMethods()
  const availableMethods = allMethods.filter(m => m.available)
  const preferred = availableMethods[0]

  if (!preferred) {
    ui.error('No installation method available. Please install Node.js or use the official installer.')
    return false
  }

  return new Promise((resolve) => {
    ui.info(`Installing Claude Code CLI using ${preferred.name}...`)

    // Parse the install command
    const [command, ...args] = preferred.installCmd.split(' ')

    const installer: ChildProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    installer.on('close', (code: number | null) => {
      if (code === 0) {
        ui.success('Claude Code CLI installed successfully!')

        // Cache the installation method
        const cache = CacheManager.getInstance()
        cache.set('claude.installMethod', preferred.method)

        resolve(true)
      }
      else {
        ui.error('Failed to install Claude Code CLI')
        resolve(false)
      }
    })

    installer.on('error', (error: Error) => {
      ui.error(`Installation failed: ${error.message}`)
      resolve(false)
    })
  })
}

async function startClaudeProcess(
  executablePath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  config?: ClaudeConfig,
): Promise<number> {
  return new Promise((resolve) => {
    // Start config file watcher if config exists
    if (config) {
      void startConfigWatcher(config)
    }

    const claude: ChildProcess = spawn(executablePath, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    })

    // Handle process exit
    const cleanup = (): void => {
      if (configWatcher) {
        configWatcher.stop()
        configWatcher = null
      }
    }

    claude.on('close', (code: number | null) => {
      cleanup()
      resolve(code ?? 0)
    })

    claude.on('error', (error: Error) => {
      cleanup()
      const ui = new UILogger()
      ui.error(`Failed to start Claude: ${error.message}`)
      resolve(1)
    })

    // Handle process termination signals
    process.on('SIGINT', () => {
      cleanup()
      claude.kill('SIGINT')
    })

    process.on('SIGTERM', () => {
      cleanup()
      claude.kill('SIGTERM')
    })
  })
}

function setEnvFromConfig(env: NodeJS.ProcessEnv, config: ClaudeConfig): void {
  // First, apply environment variables from the env map (lower priority)
  if (config.env) {
    Object.entries(config.env).forEach(([key, value]) => {
      // Only set non-empty, non-whitespace values
      if (typeof value === 'string' && value.trim().length > 0) {
        env[key] = value
      }
    })
  }

  // Basic configuration
  const basicEnvMap: Array<[keyof ClaudeConfig, string]> = [
    ['baseUrl', 'ANTHROPIC_BASE_URL'],
    ['apiKey', 'ANTHROPIC_API_KEY'],
    ['model', 'ANTHROPIC_MODEL'],
    ['authToken', 'ANTHROPIC_AUTH_TOKEN'],
    ['customHeaders', 'ANTHROPIC_CUSTOM_HEADERS'],
    ['smallFastModel', 'ANTHROPIC_SMALL_FAST_MODEL'],
    ['smallFastModelAwsRegion', 'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION'],
    ['awsBearerTokenBedrock', 'AWS_BEARER_TOKEN_BEDROCK'],
    ['httpProxy', 'HTTP_PROXY'],
    ['httpsProxy', 'HTTPS_PROXY'],
    ['vertexRegionHaiku', 'VERTEX_REGION_CLAUDE_3_5_HAIKU'],
    ['vertexRegionSonnet', 'VERTEX_REGION_CLAUDE_3_5_SONNET'],
    ['vertexRegion37Sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],
    ['vertexRegion40Opus', 'VERTEX_REGION_CLAUDE_4_0_OPUS'],
    ['vertexRegion40Sonnet', 'VERTEX_REGION_CLAUDE_4_0_SONNET'],
    ['vertexRegion45Sonnet', 'VERTEX_REGION_CLAUDE_4_5_SONNET'],
  ]

  // Numeric configuration
  const numericEnvMap: Array<[keyof ClaudeConfig, string]> = [
    ['bashDefaultTimeoutMs', 'BASH_DEFAULT_TIMEOUT_MS'],
    ['bashMaxTimeoutMs', 'BASH_MAX_TIMEOUT_MS'],
    ['bashMaxOutputLength', 'BASH_MAX_OUTPUT_LENGTH'],
    ['apiKeyHelperTtlMs', 'CLAUDE_CODE_API_KEY_HELPER_TTL_MS'],
    ['maxOutputTokens', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS'],
    ['maxThinkingTokens', 'MAX_THINKING_TOKENS'],
    ['mcpTimeout', 'MCP_TIMEOUT'],
    ['mcpToolTimeout', 'MCP_TOOL_TIMEOUT'],
    ['maxMcpOutputTokens', 'MAX_MCP_OUTPUT_TOKENS'],
  ]

  // Boolean configuration (set to '1' or '0')
  const booleanEnvMap: Array<[keyof ClaudeConfig, string]> = [
    ['maintainProjectWorkingDir', 'CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR'],
    ['ideSkipAutoInstall', 'CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL'],
    ['claudeCodeDisableNonessentialTraffic', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'],
    ['useBedrock', 'CLAUDE_CODE_USE_BEDROCK'],
    ['useVertex', 'CLAUDE_CODE_USE_VERTEX'],
    ['skipBedrockAuth', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH'],
    ['skipVertexAuth', 'CLAUDE_CODE_SKIP_VERTEX_AUTH'],
    ['disableNonessentialTraffic', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'],
    ['disableTerminalTitle', 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE'],
    ['disableAutoupdater', 'DISABLE_AUTOUPDATER'],
    ['disableBugCommand', 'DISABLE_BUG_COMMAND'],
    ['disableCostWarnings', 'DISABLE_COST_WARNINGS'],
    ['disableErrorReporting', 'DISABLE_ERROR_REPORTING'],
    ['disableNonEssentialModelCalls', 'DISABLE_NON_ESSENTIAL_MODEL_CALLS'],
    ['disableTelemetry', 'DISABLE_TELEMETRY'],
  ]

  // Set basic string environment variables (higher priority - will override env map)
  basicEnvMap.forEach(([configKey, envKey]) => {
    const value = config[configKey]

    // For official profile type, skip setting API key and base URL
    if (config.profileType === 'official' && (configKey === 'baseUrl' || configKey === 'apiKey')) {
      return
    }

    // Skip customHeaders here - we'll handle it separately to merge with authorization
    if (configKey === 'customHeaders') {
      return
    }

    // Only set the env variable if value is a non-empty string (after trimming)
    if (typeof value === 'string' && value.trim().length > 0) {
      env[envKey] = value
    }
    else {
      // If the config value is not set, empty, or whitespace-only,
      // remove the env key to avoid inheriting from process.env or passing empty values
      delete env[envKey]
    }
  })

  // Handle customHeaders with authorization merging
  const customHeadersParts: string[] = []

  // Add authorization header if present
  if (config.authorization && config.authorization.trim().length > 0) {
    customHeadersParts.push(`Authorization: ${config.authorization.trim()}`)
  }

  // Add custom headers if present
  if (config.customHeaders && config.customHeaders.trim().length > 0) {
    customHeadersParts.push(config.customHeaders.trim())
  }

  // Set ANTHROPIC_CUSTOM_HEADERS if we have any headers to set
  if (customHeadersParts.length > 0) {
    env.ANTHROPIC_CUSTOM_HEADERS = customHeadersParts.join('\n')
  }
  else {
    // Remove the env key if no headers are set
    delete env.ANTHROPIC_CUSTOM_HEADERS
  }

  // Set numeric environment variables (higher priority - will override env map)
  numericEnvMap.forEach(([configKey, envKey]) => {
    const value = config[configKey] as number | undefined
    if (typeof value === 'number') {
      env[envKey] = value.toString()
    }
  })

  // Set boolean environment variables (higher priority - will override env map)
  booleanEnvMap.forEach(([configKey, envKey]) => {
    const value = config[configKey] as boolean | undefined
    if (typeof value === 'boolean') {
      env[envKey] = value ? '1' : '0'
    }
  })
}

function applyCliOverrides(env: NodeJS.ProcessEnv, overrides: CliOverrides): void {
  // Apply environment variables from -e/--env flags
  if (overrides.env) {
    overrides.env.forEach((envVar) => {
      const [key, ...valueParts] = envVar.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=') // Handle values that contain '='
        env[key] = value
      }
    })
  }

  // Apply proxy setting
  if (overrides.proxy) {
    env.HTTPS_PROXY = overrides.proxy
  }

  // Apply API overrides
  // authToken is the primary API key (ANTHROPIC_AUTH_TOKEN)
  if (overrides.authToken) {
    env.ANTHROPIC_AUTH_TOKEN = overrides.authToken
  }

  // apiKey is the legacy API key (ANTHROPIC_API_KEY)
  if (overrides.apiKey) {
    env.ANTHROPIC_API_KEY = overrides.apiKey
  }

  if (overrides.baseUrl) {
    env.ANTHROPIC_BASE_URL = overrides.baseUrl
  }

  if (overrides.model) {
    env.ANTHROPIC_MODEL = overrides.model
  }
}

/**
 * Write extensions configuration files before starting Claude Code
 * Also syncs Claude Code's native config files (.mcp.json, .claude/skills/, .claude/agents/)
 */
async function writeExtensionsConfig(config: ClaudeConfig, isProxyMode: boolean = false, ui?: UILogger): Promise<void> {
  try {
    const logger = ui || new UILogger(false)

    // Load the config file to get extensions library and settings
    const configManager = ConfigManager.getInstance()
    const configFile = await configManager.load()

    // Initialize library if it doesn't exist
    let library = configFile.settings.extensionsLibrary || {
      mcpServers: {},
      skills: {},
      subagents: {},
    }

    // Initialize defaultEnabledExtensions if it doesn't exist
    let defaultEnabled = configFile.settings.defaultEnabledExtensions || {
      mcpServers: [],
      skills: [],
      subagents: [],
    }

    // Sync Claude Code's native config files
    const syncer = new ClaudeConfigSyncer(process.cwd(), logger)
    const syncResult = await syncer.syncClaudeConfig(library)

    if (syncResult.result.totalAdded > 0) {
      logger.verbose(`Synced ${syncResult.result.totalAdded} extensions from Claude Code config:`)
      if (syncResult.result.mcpServersAdded > 0) {
        logger.verbose(`  - ${syncResult.result.mcpServersAdded} MCP servers`)
      }
      if (syncResult.result.skillsAdded > 0) {
        logger.verbose(`  - ${syncResult.result.skillsAdded} skills`)
      }
      if (syncResult.result.subagentsAdded > 0) {
        logger.verbose(`  - ${syncResult.result.subagentsAdded} subagents`)
      }

      // Update library and defaults
      library = syncResult.library

      // Merge with existing defaults (keep existing + add new)
      defaultEnabled = {
        mcpServers: [...new Set([...defaultEnabled.mcpServers, ...syncResult.defaultEnabled.mcpServers])],
        skills: [...new Set([...defaultEnabled.skills, ...syncResult.defaultEnabled.skills])],
        subagents: [...new Set([...defaultEnabled.subagents, ...syncResult.defaultEnabled.subagents])],
      }

      // Save updated library and defaults back to config
      configFile.settings.extensionsLibrary = library
      configFile.settings.defaultEnabledExtensions = defaultEnabled
      await configManager.save(configFile)
    }

    // Create writer and generate config files
    // The resolver will determine which extensions to actually enable
    const writer = new ExtensionsWriter(process.cwd(), logger)
    await writer.writeExtensions(config, library, configFile.settings, isProxyMode)
  }
  catch (error) {
    throw new Error(`Failed to write extensions: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Start watching Claude Code config files for changes
 */
async function startConfigWatcher(config: ClaudeConfig): Promise<void> {
  try {
    const ui = new UILogger(false)
    const configManager = ConfigManager.getInstance()
    const configFile = await configManager.load()

    const library = configFile.settings.extensionsLibrary || {
      mcpServers: {},
      skills: {},
      subagents: {},
    }

    // Create and start watcher
    configWatcher = new ClaudeConfigWatcher(process.cwd(), ui, { debounceMs: 1000 })

    configWatcher.start(library, async (updatedLibrary) => {
      // Save the updated library when changes are detected
      configFile.settings.extensionsLibrary = updatedLibrary
      await configManager.save(configFile)

      // Re-write extensions config files
      const writer = new ExtensionsWriter(process.cwd(), ui)
      await writer.writeExtensions(config, updatedLibrary, configFile.settings, false)
      ui.verbose('Extensions config updated from file changes')
    })
  }
  catch (error) {
    const ui = new UILogger()
    ui.warning(`Failed to start config watcher: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
