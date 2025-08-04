import type { ClaudeConfig } from '../core/types'
import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import inquirer from 'inquirer'
import { displayError, displayInfo, displaySuccess } from '../utils/ui'

export async function startClaude(config: ClaudeConfig, args: string[] = []): Promise<number> {
  const env = { ...process.env }

  // Set environment variables from config
  setEnvFromConfig(env, config)

  // Check if claude command is available
  const claudePath = findExecutable('claude', env)

  if (!claudePath) {
    // Claude is not installed, ask user if they want to install it
    const shouldInstall = await promptForInstallation()

    if (shouldInstall) {
      const installSuccess = await installClaudeCode()
      if (!installSuccess) {
        return 1
      }

      // Try to find claude again after installation
      const newClaudePath = findExecutable('claude', env)
      if (!newClaudePath) {
        displayError('Failed to find Claude Code after installation. Please restart your terminal.')
        return 1
      }

      // Start claude with the newly installed version
      return startClaudeProcess(newClaudePath, args, env)
    }
    else {
      displayError('Claude Code is required to run start-claude.')
      displayInfo('You can install it manually with: npm install -g @anthropic-ai/claude-code')
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

  return answer.install
}

async function installClaudeCode(): Promise<boolean> {
  return new Promise((resolve) => {
    displayInfo('Installing Claude Code CLI...')

    // Find npm executable in PATH
    const npmPath = findExecutable('npm', process.env as Record<string, string | undefined>)
    if (!npmPath) {
      displayError('npm is not found in PATH. Please install Node.js and npm first.')
      resolve(false)
      return
    }

    const npm = spawn(npmPath, ['install', '-g', '@anthropic-ai/claude-code'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    npm.on('close', (code) => {
      if (code === 0) {
        displaySuccess('Claude Code CLI installed successfully!')
        resolve(true)
      }
      else {
        displayError('Failed to install Claude Code CLI')
        resolve(false)
      }
    })

    npm.on('error', (error) => {
      displayError(`Installation failed: ${error.message}`)
      resolve(false)
    })
  })
}

async function startClaudeProcess(
  executablePath: string,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  return new Promise((resolve) => {
    const claude = spawn(executablePath, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    })

    claude.on('close', (code) => {
      resolve(code ?? 0)
    })

    claude.on('error', (error) => {
      displayError(`Failed to start Claude: ${error.message}`)
      resolve(1)
    })
  })
}

function setEnvFromConfig(env: Record<string, string | undefined>, config: ClaudeConfig): void {
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

  // Set basic string environment variables
  basicEnvMap.forEach(([configKey, envKey]) => {
    const value = config[configKey]
    if (typeof value === 'string' && value.length > 0) {
      env[envKey] = value
    }
  })

  // Set numeric environment variables
  numericEnvMap.forEach(([configKey, envKey]) => {
    const value = config[configKey] as number | undefined
    if (typeof value === 'number') {
      env[envKey] = value.toString()
    }
  })

  // Set boolean environment variables
  booleanEnvMap.forEach(([configKey, envKey]) => {
    const value = config[configKey] as boolean | undefined
    if (typeof value === 'boolean') {
      env[envKey] = value ? '1' : '0'
    }
  })
}

// Function to find executable in PATH
function findExecutable(command: string, env: Record<string, string | undefined>): string | null {
  const pathEnv = env.PATH || env.Path || ''
  let pathDirs = pathEnv.split(path.delimiter)

  // On Windows, prioritize common Node.js global installation paths
  if (process.platform === 'win32') {
    const nodeGlobalPaths = [
      path.join(process.env.APPDATA || '', 'npm'),
      path.join(process.env.ProgramFiles || '', 'nodejs'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'nodejs'),
    ].filter(p => p !== 'npm' && p !== 'nodejs') // Filter out empty paths

    // Add Node.js paths to the beginning of search paths
    pathDirs = [...nodeGlobalPaths, ...pathDirs]
  }

  const extensions = process.platform === 'win32' ? ['.cmd', '.ps1'] : ['']

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext)
      try {
        // Check if file exists and is executable
        accessSync(fullPath, constants.F_OK)
        return fullPath
      }
      catch {
        // Continue searching
      }
    }
  }
  return null
}
