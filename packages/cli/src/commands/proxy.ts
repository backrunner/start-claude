import type { ClaudeConfig, LoadBalancerStrategy } from '../config/types'
import process from 'node:process'

import { parseBalanceStrategy } from '../cli/common'
import { handleProxyMode } from '../cli/proxy'
import { ConfigManager } from '../config/manager'
import { S3SyncManager } from '../storage/s3-sync'
import { UILogger } from '../utils/cli/ui'
import { sendProxySwitchRequest } from '../utils/network/proxy-control'

export interface ProxyCommandOptions {
  strategy?: string
  all?: boolean
  verbose?: boolean
  debug?: boolean
  proxy?: string
  skipHealthCheck?: boolean
}

/**
 * Handle the proxy switch subcommand
 */
export async function handleProxySwitchCommand(
  configNames: string[],
  options: Omit<ProxyCommandOptions, 'all'>,
  port = 2333,
): Promise<void> {
  const ui = new UILogger(options.verbose)
  const configManager = ConfigManager.getInstance()

  if (configNames.length === 0) {
    ui.error('No configurations specified for switch')
    ui.info('Usage: start-claude proxy switch <config1> [config2] ...')
    process.exit(1)
  }

  ui.displayWelcome()

  // Get the specified configs
  const configs: ClaudeConfig[] = []
  for (const configName of configNames) {
    const config = await configManager.getConfig(configName)
    if (!config) {
      ui.error(`Configuration "${configName}" not found`)
      process.exit(1)
    }
    configs.push(config)
  }

  ui.info(`🔄 Switching proxy to ${configs.length} configuration${configs.length > 1 ? 's' : ''}: ${configs.map(c => c.name).join(', ')}`)

  // Send switch request to the running proxy server
  try {
    ui.info('🔍 Testing new endpoints...')
    const result = await sendProxySwitchRequest(port, configs)

    if (result.success) {
      // Display endpoint health check results
      if (result.endpointDetails && result.endpointDetails.length > 0) {
        for (const detail of result.endpointDetails) {
          if (detail.healthy) {
            ui.success(`✅ ${detail.name} - healthy`)
          }
          else {
            ui.error(`❌ ${detail.name} - ${detail.error || 'failed'}`)
          }
        }
      }

      // Display speed test results if available
      if (result.speedTestResults && result.speedTestResults.length > 0) {
        ui.info('')
        ui.success('📊 Speed test results:')
        result.speedTestResults.forEach((test, index) => {
          const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  '
          ui.info(`   ${emoji} ${test.name}: ${test.responseTime.toFixed(1)}ms`)
        })
        ui.info('')
      }

      ui.success(`✅ ${result.message}`)
      ui.info(`   Healthy endpoints: ${result.healthyEndpoints}/${result.totalEndpoints}`)
    }
    else {
      // Display endpoint details for failed switch
      if (result.endpointDetails && result.endpointDetails.length > 0) {
        for (const detail of result.endpointDetails) {
          if (detail.healthy) {
            ui.success(`✅ ${detail.name} - healthy`)
          }
          else {
            ui.error(`❌ ${detail.name} - ${detail.error || 'failed'}`)
          }
        }
      }

      ui.error(`❌ Switch failed: ${result.message}`)
      process.exit(1)
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ui.error(`❌ Failed to connect to proxy server: ${errorMessage}`)
    ui.info(`   Make sure the proxy server is running on port ${port}`)
    process.exit(1)
  }
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
