import type { ConfigManager } from '../config/manager'
import type { ClaudeConfig, LoadBalancerStrategy } from '../config/types'
import type { ProgramOptions } from './common'
import process from 'node:process'
import { filterProxyArgs } from '../commands/proxy'
import { ProxyServer } from '../core/proxy'
import { TransformerService } from '../services/transformer'
import { UILogger } from '../utils/cli/ui'
import { fileLogger } from '../utils/logging/file-logger'
import { checkAndHandleExistingProxy, removeLockFile, setupProxyCleanup } from '../utils/network/proxy-lock'
import { startClaude } from './claude'
import { buildClaudeArgs, buildCliOverrides, filterProcessArgs, resolveBaseConfig } from './common'

/**
 * Handle proxy mode (includes load balancer and transformer functionality)
 */
export async function handleProxyMode(
  configManager: ConfigManager,
  options: ProgramOptions,
  configArg?: string,
  systemSettings?: any,
  forcedConfigs?: any[], // Allow forced configs for transformer mode
  cliStrategy?: LoadBalancerStrategy, // CLI-specified strategy override
): Promise<void> {
  // Determine if we're called from proxy command or transformer auto-enable
  // If forcedConfigs is provided, we're from proxy command
  const isFromProxyCommand = forcedConfigs !== undefined

  // Check if proxy server is already running
  const shouldStartNewProxy = await checkAndHandleExistingProxy()
  if (!shouldStartNewProxy) {
    // Proxy server is already running, just start Claude Code with existing proxy
    const baseConfig = await resolveBaseConfig(configManager, options, configArg, forcedConfigs || await configManager.listConfigs())
    const claudeArgs = buildClaudeArgs(options, baseConfig)
    // Use appropriate filter based on context
    const filteredArgs = isFromProxyCommand ? filterProxyArgs() : filterProcessArgs(configArg)
    const allArgs = [...claudeArgs, ...filteredArgs]

    const cliOverrides = {
      ...buildCliOverrides(options),
      apiKey: 'sk-claude-proxy-server', // Use default proxy API key
      baseUrl: 'http://localhost:2333', // Use proxy server's URL
    }

    const ui = new UILogger()
    ui.success('🔄 Using existing proxy server')

    // Start Claude Code with the existing proxy server configuration
    const exitCode = await startClaude(baseConfig, allArgs, cliOverrides)
    process.exit(exitCode)
  }

  // Setup cleanup handlers for lock file
  setupProxyCleanup()

  // If a specific config was requested, use only that config
  let configs: ClaudeConfig[] = forcedConfigs || await configManager.listConfigs()

  const requestedConfigName = options.config || configArg
  if (requestedConfigName && !forcedConfigs) {
    // User specified a particular config, so only use that one for the proxy
    const specificConfig = await configManager.getConfig(requestedConfigName)
    if (specificConfig) {
      configs = [specificConfig]
    }
  }

  // Include configs that have complete API credentials (baseUrl, apiKey, and model) OR have transformer enabled
  const proxyableConfigs = configs.filter((c) => {
    const hasCompleteApiCredentials = c.baseUrl && c.apiKey && (TransformerService.isTransformerEnabled(c.transformerEnabled) ? c.model : true)
    const hasTransformerEnabled = TransformerService.isTransformerEnabled(c.transformerEnabled)

    if (hasTransformerEnabled && !hasCompleteApiCredentials) {
      const ui = new UILogger()
      ui.info(`Configuration "${c.name}" is transformer-enabled but missing complete API credentials (baseUrl/apiKey/model) - including for transformer fallback`)
    }

    return hasCompleteApiCredentials || hasTransformerEnabled
  })

  if (proxyableConfigs.length === 0) {
    const ui = new UILogger()
    ui.error('No configurations found for proxy mode')
    ui.info('Proxy mode requires configurations with either:')
    ui.info('  - baseUrl, apiKey, and model (for direct API calls)')
    ui.info('  - transformerEnabled: true (for transformer processing)')
    process.exit(1)
  }

  // Show which configs are included and why
  const ui = new UILogger()
  ui.info(`Starting proxy with ${proxyableConfigs.length} endpoint${proxyableConfigs.length > 1 ? 's' : ''}:`)
  proxyableConfigs.forEach((c) => {
    const hasTransformer = TransformerService.isTransformerEnabled(c.transformerEnabled)

    let status = ''
    if (hasTransformer) {
      status = ' (transformer)'
    }

    ui.info(`  - ${c.name}: ${c.baseUrl || 'no baseUrl'}${status}`)
  })

  try {
    // Check if any config has transformer enabled
    const hasTransformerEnabled = proxyableConfigs.some(c => TransformerService.isTransformerEnabled(c.transformerEnabled))

    // Set up a proxy configuration that preserves other settings - resolve early for transformer matching
    const baseConfig = await resolveBaseConfig(configManager, options, configArg, proxyableConfigs)

    // Override system settings with CLI strategy if provided
    let effectiveSystemSettings = systemSettings
    if (cliStrategy) {
      effectiveSystemSettings = {
        ...systemSettings,
        balanceMode: {
          ...systemSettings?.balanceMode,
          strategy: cliStrategy,
        },
      }
    }

    const proxyServer = new ProxyServer(proxyableConfigs, {
      enableLoadBalance: isFromProxyCommand || proxyableConfigs.length > 1, // Always enable for proxy command, or when multiple configs
      enableTransform: hasTransformerEnabled,
      debug: options.debug || false,
      verbose: options.verbose || options.debug || false, // Enable verbose by default in debug mode
    }, effectiveSystemSettings, options.proxy)

    // Perform initial health checks
    await proxyServer.performInitialHealthChecks()

    await proxyServer.startServer(2333)

    // Show debug logging information if enabled
    if (options.debug) {
      const ui = new UILogger()
      ui.info('')
      ui.info(`📝 Debug logging enabled - logs will be written to: ${fileLogger.getLogFilePath()}`)
    }

    // Show transformer information if transformers are enabled
    if (hasTransformerEnabled) {
      const ui = new UILogger()
      const transformers = proxyServer.listTransformers()
      if (transformers.length > 0) {
        ui.info('')
        // Show all transformers when in proxy mode
        ui.info('🔧 Available transformers:')
        transformers.forEach((transformer) => {
          if (transformer.hasDomain) {
            ui.info(`  - ${transformer.name} (${transformer.domain})`)
          }
          else {
            ui.info(`  - ${transformer.name}`)
          }
        })
      }
    }

    const ui = new UILogger()
    ui.info('')

    // Determine proxy mode and show appropriate message
    const apiConfigs = proxyableConfigs.filter(c => c.baseUrl && c.apiKey && c.model)
    const transformerConfigs = proxyableConfigs.filter(c => TransformerService.isTransformerEnabled(c.transformerEnabled))

    if (apiConfigs.length > 0 && transformerConfigs.length > 0) {
      ui.success('🔧 Proxy server is running!')
      ui.info('Starting Claude Code with hybrid proxy...')
    }
    else if (apiConfigs.length > 1) {
      ui.success('🚀 Load balancer is running!')
      ui.info('Starting Claude Code with load balancer...')
    }
    else if (transformerConfigs.length > 0) {
      ui.success('🔧 Transformer proxy is running!')
      ui.info('Starting Claude Code with transformer proxy...')
    }
    else {
      ui.success('🚀 Proxy server is running!')
      ui.info('Starting Claude Code with proxy server...')
    }

    // Build arguments to pass to claude command (same as normal mode)
    const claudeArgs = buildClaudeArgs(options, baseConfig)
    // Use appropriate filter based on context
    const filteredArgs = isFromProxyCommand ? filterProxyArgs() : filterProcessArgs(configArg)
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
        const ui = new UILogger()
        ui.info('\nShutting down proxy server...')
        await proxyServer.stop()
        removeLockFile() // Clean up lock file
        process.exit(0)
      })()
    }

    process.on('SIGINT', handleShutdown)
    process.on('SIGTERM', handleShutdown)

    // Start Claude Code with the proxy server configuration
    const exitCode = await startClaude(baseConfig, allArgs, cliOverrides)

    // When Claude Code exits, stop the proxy server
    await proxyServer.stop()
    removeLockFile() // Clean up lock file
    process.exit(exitCode)
  }
  catch (error) {
    const ui = new UILogger()
    ui.error(`Failed to start proxy server: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
