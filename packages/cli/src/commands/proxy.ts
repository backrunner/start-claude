import type { ClaudeConfig, LoadBalancerStrategy } from '../config/types'
import process from 'node:process'

import { parseBalanceStrategy } from '../cli/common'
import { handleProxyMode } from '../cli/proxy'
import { ConfigManager } from '../config/manager'
import { S3SyncManager } from '../storage/s3-sync'
import { UILogger } from '../utils/cli/ui'

export interface ProxyCommandOptions {
  strategy?: string
  all?: boolean
  verbose?: boolean
  debug?: boolean
  proxy?: string
  skipHealthCheck?: boolean
}

/**
 * Filter out proxy command and its positional arguments
 * Aligns with filterProcessArgs logic in common.ts but additionally filters:
 * - The 'proxy' command itself
 * - Positional arguments (config names) after 'proxy'
 * - Proxy-specific flags (--strategy, --all)
 */
export function filterProxyArgs(): string[] {
  const args = process.argv.slice(2)

  // Proxy-specific flags that should NOT be passed to Claude Code
  const proxySpecificFlags = [
    '--strategy',
    '--all',
    '--skip-health-check',
  ]

  // Track if we've seen the proxy command
  let seenProxyCommand = false
  let skipNext = false

  return args.filter((arg, index) => {
    // If we should skip this arg (it's a value for a previous flag)
    if (skipNext) {
      skipNext = false
      return false
    }

    // Skip the 'proxy' command itself
    if (arg === 'proxy') {
      seenProxyCommand = true
      return false
    }

    // Skip proxy-specific flags
    if (proxySpecificFlags.some(flag => arg.startsWith(flag))) {
      // Check if this flag has a value (not using = syntax)
      if (arg === '--strategy' && index + 1 < args.length && !args[index + 1].startsWith('-')) {
        skipNext = true
      }
      return false
    }

    // If it's a flag, keep it (it will be passed to Claude Code)
    if (arg.startsWith('-')) {
      return true
    }

    // If we've seen the proxy command, this is a positional config name argument - filter it out
    if (seenProxyCommand) {
      return false
    }

    // Otherwise keep it (though this shouldn't happen in normal usage)
    return true
  })
}

/**
 * Handle the proxy command
 */
export async function handleProxyCommand(
  configNames: string[],
  options: ProxyCommandOptions,
): Promise<void> {
  const ui = new UILogger(options.verbose)
  const configManager = ConfigManager.getInstance()
  const s3SyncManager = S3SyncManager.getInstance()

  ui.displayWelcome()

  // Get system settings (needed for strategy defaults)
  const systemSettings = await s3SyncManager.getSystemSettings().catch(() => null)

  // Parse the strategy from options
  let cliStrategy: LoadBalancerStrategy | undefined
  if (options.strategy) {
    const strategyResult = parseBalanceStrategy(options.strategy)
    if (strategyResult.enabled && strategyResult.strategy) {
      cliStrategy = strategyResult.strategy
      ui.info(`🎯 Using ${cliStrategy} load balancer strategy`)
    }
  }

  // Determine which configs to use
  let configs: ClaudeConfig[] = []

  if (options.all || configNames.length === 0) {
    // Use all configs when --all is specified or no config names provided
    configs = await configManager.listConfigs()
    if (configs.length === 0) {
      ui.error('No configurations found')
      process.exit(1)
    }
    ui.info(`Starting proxy with all ${configs.length} configuration${configs.length > 1 ? 's' : ''}`)
  }
  else {
    // Use specified config(s)
    for (const configName of configNames) {
      const config = await configManager.getConfig(configName)
      if (!config) {
        ui.error(`Configuration "${configName}" not found`)
        process.exit(1)
      }
      configs.push(config)
    }
    ui.info(`Starting proxy with ${configs.length} configuration${configs.length > 1 ? 's' : ''}: ${configs.map(c => c.name).join(', ')}`)
  }

  // Convert options to ProgramOptions format for handleProxyMode
  const programOptions = {
    verbose: options.verbose,
    debug: options.debug,
    proxy: options.proxy,
    skipHealthCheck: options.skipHealthCheck,
  }

  // Call handleProxyMode with the selected configs
  await handleProxyMode(
    configManager,
    programOptions as any,
    undefined, // configArg is not needed since we're passing forced configs
    systemSettings,
    configs, // Pass our selected configs as forced configs
    cliStrategy,
  )
}
