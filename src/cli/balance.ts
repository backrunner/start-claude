import type { ConfigManager } from '../config/manager'
import type { ProgramOptions } from './common'
import process from 'node:process'
import { ProxyServer } from '../core/proxy'
import { S3SyncManager } from '../storage/s3-sync'
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
  systemSettings?: any,
  forcedConfigs?: any[], // Allow forced configs for transformer mode
): Promise<void> {
  // Check for S3 sync updates at startup
  const s3SyncManager = new S3SyncManager()
  if (s3SyncManager.isS3Configured()) {
    const updated = await s3SyncManager.checkRemoteUpdates()
    if (updated) {
      // Reload configs after potential update
      displayInfo('Configuration updated from S3, reloading...')
    }
  }

  // Get configurations for load balancing - use forced configs or all configs
  const configs = forcedConfigs || configManager.listConfigs()

  // Include configs that either have API credentials OR have transformer enabled
  const balanceableConfigs = configs.filter((c) => {
    const hasApiCredentials = c.baseUrl && c.apiKey
    const hasTransformerEnabled = c.transformerEnabled === true

    if (hasTransformerEnabled && !hasApiCredentials) {
      displayInfo(`Configuration "${c.name}" is transformer-enabled but missing baseUrl/apiKey - including for transformer fallback`)
    }

    return hasApiCredentials || hasTransformerEnabled
  })

  if (balanceableConfigs.length === 0) {
    displayError('No configurations found for load balancing')
    displayInfo('Load balancing requires configurations with either:')
    displayInfo('  - baseUrl and apiKey (for direct API calls)')
    displayInfo('  - transformerEnabled: true (for transformer processing)')
    process.exit(1)
  }

  // Show which configs are included and why
  displayInfo(`Starting load balancer with ${balanceableConfigs.length} endpoint${balanceableConfigs.length > 1 ? 's' : ''}:`)
  balanceableConfigs.forEach((c) => {
    const hasApi = c.baseUrl && c.apiKey
    const hasTransformer = c.transformerEnabled === true

    let status = ''
    if (hasApi && hasTransformer) {
      status = ' (API + transformer)'
    }
    else if (hasApi) {
      status = ' (API only)'
    }
    else if (hasTransformer) {
      status = ' (transformer only - needs fallback endpoints)'
    }

    displayInfo(`  - ${c.name}: ${c.baseUrl || 'no baseUrl'}${status}`)
  })

  try {
    // Check if any config has transformer enabled
    const hasTransformerEnabled = balanceableConfigs.some(c => c.transformerEnabled === true)

    const proxyServer = new ProxyServer(balanceableConfigs, {
      enableLoadBalance: true,
      enableTransform: hasTransformerEnabled,
    }, systemSettings, options.proxy)

    // Perform initial health checks
    await proxyServer.performInitialHealthChecks()

    await proxyServer.startServer(2333)

    // Show transformer information if transformers are enabled
    if (hasTransformerEnabled) {
      const transformers = proxyServer.listTransformers()
      if (transformers.length > 0) {
        displayInfo('')
        displayInfo('🔧 Available transformers:')
        transformers.forEach(transformer => {
          if (transformer.hasDomain) {
            displayInfo(`  - ${transformer.name} (${transformer.domain})`)
          } else {
            displayInfo(`  - ${transformer.name}`)
          }
        })
      }
    }

    displayInfo('')

    // Determine proxy mode and show appropriate message
    const apiConfigs = balanceableConfigs.filter(c => c.baseUrl && c.apiKey)
    const transformerConfigs = balanceableConfigs.filter(c => c.transformerEnabled === true)

    if (apiConfigs.length > 0 && transformerConfigs.length > 0) {
      displaySuccess('🔧 Hybrid proxy server is running! (Load balancer + Transformer)')
      displayInfo('Starting Claude Code with hybrid proxy...')
    }
    else if (apiConfigs.length > 1) {
      displaySuccess('🚀 Load balancer is running!')
      displayInfo('Starting Claude Code with load balancer...')
    }
    else if (transformerConfigs.length > 0) {
      displaySuccess('🔧 Transformer proxy is running!')
      displayInfo('Starting Claude Code with transformer proxy...')
    }
    else {
      displaySuccess('🚀 Proxy server is running!')
      displayInfo('Starting Claude Code with proxy server...')
    }
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
      apiKey: proxyServer.getProxyApiKey(), // Use proxy server's random API key
      baseUrl: 'http://localhost:2333', // Use proxy server's URL
    }

    // Handle graceful shutdown
    const handleShutdown = (): void => {
      void (async () => {
        displayInfo('\nShutting down proxy server...')
        await proxyServer.stop()
        process.exit(0)
      })()
    }

    process.on('SIGINT', handleShutdown)
    process.on('SIGTERM', handleShutdown)

    // Start Claude Code with the proxy server configuration
    const exitCode = await startClaude(baseConfig, allArgs, cliOverrides)

    // When Claude Code exits, stop the proxy server
    await proxyServer.stop()
    process.exit(exitCode)
  }
  catch (error) {
    displayError(`Failed to start proxy server: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
