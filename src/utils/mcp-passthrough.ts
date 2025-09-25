import { spawn } from 'node:child_process'
import process from 'node:process'
import { UILogger } from './cli/ui'
import { findExecutable } from './path-utils'

/**
 * Check if the current command is an MCP command
 */
export function isMcpCommand(args: string[]): boolean {
  return args.length > 0 && args[0] === 'mcp'
}

/**
 * Handle MCP command passthrough to the real Claude CLI
 * This function finds the real Claude CLI and passes all arguments directly to it
 */
export async function handleMcpPassthrough(args: string[]): Promise<void> {
  const claudePath = findExecutable('claude', { env: process.env, skipDirs: ['.start-claude'] })

  if (claudePath) {
    const claude = spawn(claudePath, args, {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    })

    claude.on('close', (code: number | null) => {
      process.exit(code ?? 0)
    })

    claude.on('error', (error: Error) => {
      const ui = new UILogger()
      ui.error(`Failed to start Claude: ${error.message}`)
      process.exit(1)
    })
  }
  else {
    const ui = new UILogger()
    ui.error('❌ Claude CLI not found. Please install Claude Code first.')
    process.exit(1)
  }
}

/**
 * Initialize MCP passthrough handling
 * This function should be called at the very beginning of the CLI to intercept MCP commands
 * before Commander.js processes the arguments
 * @returns true if MCP command was handled, false if normal CLI operation should continue
 */
export function initializeMcpPassthrough(): boolean {
  const args = process.argv.slice(2)

  if (isMcpCommand(args)) {
    // Replace process.argv to hide MCP command from Commander.js
    process.argv = [process.argv[0], process.argv[1]] // Just keep node and script path

    // Start MCP passthrough
    handleMcpPassthrough(args).catch((error) => {
      const ui = new UILogger()
      ui.error(`MCP passthrough failed: ${error.message}`)
      process.exit(1)
    })

    return true // Indicates MCP command was handled
  }

  return false // Indicates normal CLI operation should continue
}
