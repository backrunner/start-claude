import type { ChildProcess } from 'node:child_process'
import type { CodexConfig } from '../config/types'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { UILogger } from '../../utils/cli/ui'
import { findExecutable } from '../../utils/system/path-utils'
import { writeCodexConfig } from '../utils/toml-writer'

/**
 * Start OpenAI Codex CLI with the specified configuration
 */
export async function startCodex(
  config: CodexConfig | undefined,
  args: string[] = [],
): Promise<number> {
  const env: NodeJS.ProcessEnv = { ...process.env }

  // Write TOML configuration to ~/.codex/ (if config exists)
  if (config) {
    try {
      writeCodexConfig(config)
    }
    catch (error) {
      const ui = new UILogger()
      ui.error(`Failed to write Codex configuration: ${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
  }

  // Check if codex command is available
  const codexPath = findExecutableWithSkipDirs('codex', env)

  if (!codexPath) {
    // Codex is not installed, inform user
    const ui = new UILogger()
    ui.error('OpenAI Codex CLI is not installed.')
    ui.info('Please install it first: npm install -g @openai/codex-cli')
    ui.info('Or visit: https://developers.openai.com/codex/')
    return 1
  }

  // Start codex
  return startCodexProcess(codexPath, args, env)
}

/**
 * Start the Codex process
 */
async function startCodexProcess(
  executablePath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve) => {
    const codex: ChildProcess = spawn(executablePath, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    })

    codex.on('close', (code: number | null) => {
      resolve(code ?? 0)
    })

    codex.on('error', (error: Error) => {
      const ui = new UILogger()
      ui.error(`Failed to start Codex: ${error.message}`)
      resolve(1)
    })

    // Handle process termination signals
    process.on('SIGINT', () => {
      codex.kill('SIGINT')
    })

    process.on('SIGTERM', () => {
      codex.kill('SIGTERM')
    })
  })
}

/**
 * Find executable in PATH (using shared utility)
 */
function findExecutableWithSkipDirs(command: string, env: NodeJS.ProcessEnv): string | null {
  return findExecutable(command, { env, skipDirs: ['.start-codex'] })
}
