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

  if (options.all) {
    // Use all configs
    configs = await configManager.listConfigs()
    if (configs.length === 0) {
      ui.error('No configurations found')
      process.exit(1)
    }
    ui.info(`Starting proxy with all ${configs.length} configuration${configs.length > 1 ? 's' : ''}`)
  }
  else if (configNames.length > 0) {
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
  else {
    // No config specified, use default
    const defaultConfig = await configManager.getDefaultConfig()
    if (!defaultConfig) {
      ui.error('No default configuration found')
      ui.info('Please specify a config name or use --all to include all configs')
      process.exit(1)
    }
    configs.push(defaultConfig)
    ui.info(`Starting proxy with default configuration: ${defaultConfig.name}`)
  }

  // Convert options to ProgramOptions format for handleProxyMode
  const programOptions = {
    balance: true, // Always enable balance mode for proxy command
    verbose: options.verbose,
    debug: options.debug,
    proxy: options.proxy,
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
