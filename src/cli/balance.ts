import type { ConfigManager } from '../core/config'
import type { ProgramOptions } from './common'
import process from 'node:process'
import { LoadBalancer } from '../core/load-balancer'
import { displayError, displayInfo, displaySuccess } from '../utils/ui'
import { startClaude } from './claude'
import { buildClaudeArgs, buildCliOverrides, filterProcessArgs, resolveBaseConfig } from './common'

/**
 * Handle load balancer mode
 */
export async function handleBalanceMode(
  configManager: ConfigManager,
  options: ProgramOptions,
  configArg?: string,
): Promise<void> {
  // Get all configurations for load balancing
  const configs = configManager.listConfigs()
  const balanceableConfigs = configs.filter(c => c.baseUrl && c.apiKey)

  if (balanceableConfigs.length === 0) {
    displayError('No configurations with baseUrl and apiKey found for load balancing')
    displayInfo('Load balancing requires configurations with both baseUrl and apiKey set')
    process.exit(1)
  }

  displayInfo(`Starting load balancer with ${balanceableConfigs.length} endpoints:`)
  balanceableConfigs.forEach((c) => {
    displayInfo(`  - ${c.name}: ${c.baseUrl}`)
  })

  try {
    const loadBalancer = new LoadBalancer(balanceableConfigs)

    // Perform initial health checks
    await loadBalancer.performInitialHealthChecks()

    await loadBalancer.startServer(2333)

    displayInfo('')
    displaySuccess('Load balancer is running!')
    displayInfo('Starting Claude Code with load balancer...')
    displayInfo('')

    // Set up a load balancer configuration that preserves other settings
    const baseConfig = resolveBaseConfig(configManager, options, configArg, balanceableConfigs)

    if (baseConfig) {
      displayInfo(`Using configuration "${baseConfig.name}" for base settings`)
    }

    // Build arguments to pass to claude command (same as normal mode)
    const claudeArgs = buildClaudeArgs(options, baseConfig)
    const filteredArgs = filterProcessArgs(configArg)
    const allArgs = [...claudeArgs, ...filteredArgs]

    // Create CLI overrides with load balancer settings
    const cliOverrides = {
      ...buildCliOverrides(options),
      apiKey: loadBalancer.getProxyApiKey(), // Use load balancer's random API key
      baseUrl: 'http://localhost:2333', // Use load balancer's URL
    }

    // Handle graceful shutdown
    const handleShutdown = (): void => {
      void (async () => {
        displayInfo('\nShutting down load balancer...')
        await loadBalancer.stop()
        process.exit(0)
      })()
    }

    process.on('SIGINT', handleShutdown)
    process.on('SIGTERM', handleShutdown)

    // Start Claude Code with the load balancer configuration
    const exitCode = await startClaude(baseConfig, allArgs, cliOverrides)

    // When Claude Code exits, stop the load balancer
    await loadBalancer.stop()
    process.exit(exitCode)
  }
  catch (error) {
    displayError(`Failed to start load balancer: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
