import type { ChildProcess } from 'node:child_process'
import type { ClaudeConfig } from '../config/types'
import type { CliOverrides } from './common'
import { spawn } from 'node:child_process'
import process from 'node:process'
import inquirer from 'inquirer'
import { UILogger } from '../utils/cli/ui'
import { findExecutable } from '../utils/system/path-utils'

export async function startClaude(config: ClaudeConfig | undefined, args: string[] = [], cliOverrides?: CliOverrides): Promise<number> {
  const env: NodeJS.ProcessEnv = { ...process.env }

  // Set environment variables from config (if config exists)
  if (config) {
    setEnvFromConfig(env, config)
  }

  // Apply CLI overrides
  if (cliOverrides) {
    applyCliOverrides(env, cliOverrides)
  }

  // Check if claude command is available
  const claudePath = findExecutableWithSkipDirs('claude', env)

  if (!claudePath) {
    // Claude is not installed, ask user if they want to install it
    const shouldInstall = await promptForInstallation()

    if (shouldInstall) {
      const installSuccess = await installClaudeCode()
      if (!installSuccess) {
        return 1
      }

      // Try to find claude again after installation
      const newClaudePath = findExecutableWithSkipDirs('claude', env)
      if (!newClaudePath) {
        const ui = new UILogger()
        ui.error('Failed to find Claude Code after installation. Please restart your terminal.')
        return 1
      }

      // Start claude with the newly installed version
      return startClaudeProcess(newClaudePath, args, env)
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
    return startClaudeProcess(claudePath, args, env)
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
  return new Promise((resolve) => {
    ui.info('Installing Claude Code CLI...')

    // Find npm executable in PATH
    const npmPath = findExecutableWithSkipDirs('npm', process.env)
    if (!npmPath) {
      ui.error('npm is not found in PATH. Please install Node.js and npm first.')
      resolve(false)
      return
    }

    const npm: ChildProcess = spawn(npmPath, ['install', '-g', '@anthropic-ai/claude-code'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    npm.on('close', (code: number | null) => {
      if (code === 0) {
        ui.success('Claude Code CLI installed successfully!')
        resolve(true)
      }
      else {
        ui.error('Failed to install Claude Code CLI')
        resolve(false)
      }
    })

    npm.on('error', (error: Error) => {
      ui.error(`Installation failed: ${error.message}`)
      resolve(false)
    })
  })
}

async function startClaudeProcess(
  executablePath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve) => {
    const claude: ChildProcess = spawn(executablePath, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    })

    claude.on('close', (code: number | null) => {
      resolve(code ?? 0)
    })

    claude.on('error', (error: Error) => {
      const ui = new UILogger()
      ui.error(`Failed to start Claude: ${error.message}`)
      resolve(1)
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

// Function to find executable in PATH (using shared utility)
function findExecutableWithSkipDirs(command: string, env: NodeJS.ProcessEnv): string | null {
  return findExecutable(command, { env, skipDirs: ['.start-claude'] })
}
