import type { ConfigManager } from '../config/manager'
import type { LoadBalancerStrategy } from '../config/types'
import type { ProgramOptions } from './common'
import process from 'node:process'
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
  // Check if proxy server is already running
  const shouldStartNewProxy = await checkAndHandleExistingProxy()
  if (!shouldStartNewProxy) {
    // Proxy server is already running, just start Claude Code with existing proxy
    const baseConfig = resolveBaseConfig(configManager, options, configArg, forcedConfigs || configManager.listConfigs())
    const claudeArgs = buildClaudeArgs(options, baseConfig)
    const filteredArgs = filterProcessArgs(configArg)
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

  // Get configurations for proxy mode - use forced configs or all configs
  // If a specific config was requested, use only that config
  let configs = forcedConfigs || configManager.listConfigs()

  const requestedConfigName = options.config || configArg
  if (requestedConfigName && !forcedConfigs) {
    // User specified a particular config, so only use that one for the proxy
    const specificConfig = configManager.getConfig(requestedConfigName)
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

  // Show which configs are included and why - only when balance mode is enabled
  if (options.balance) {
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
  }

  try {
    // Check if any config has transformer enabled
    const hasTransformerEnabled = proxyableConfigs.some(c => TransformerService.isTransformerEnabled(c.transformerEnabled))

    // Set up a proxy configuration that preserves other settings - resolve early for transformer matching
    const baseConfig = resolveBaseConfig(configManager, options, configArg, proxyableConfigs)

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
      enableLoadBalance: typeof options.balance === 'string' || options.balance === true,
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
        if (options.balance) {
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
        else {
          // Show only the current transformer matching the base config when not in balance mode
          if (baseConfig?.baseUrl) {
            let matchingTransformer: { name: string, hasDomain: boolean, domain?: string } | undefined

            // First, check if a specific transformer is configured
            if (baseConfig.transformer && baseConfig.transformer !== 'auto') {
              matchingTransformer = transformers.find(t => t.name === baseConfig.transformer)
              if (matchingTransformer) {
                ui.info('🔧 Current transformer (manually specified):')
                if (matchingTransformer.hasDomain) {
                  ui.info(`  - ${matchingTransformer.name} (${matchingTransformer.domain})`)
                }
                else {
                  ui.info(`  - ${matchingTransformer.name}`)
                }
              }
            }

            // If no manual transformer specified or found, try domain matching
            if (!matchingTransformer) {
              matchingTransformer = transformers.find(t =>
                t.hasDomain && t.domain && baseConfig.baseUrl!.includes(t.domain),
              )

              if (matchingTransformer) {
                ui.info('🔧 Current transformer (auto-detected):')
                ui.info(`  - ${matchingTransformer.name} (${matchingTransformer.domain})`)
              }
            }

            if (!matchingTransformer) {
              ui.error(`❌ No transformer found for baseUrl: ${baseConfig.baseUrl}`)
              if (baseConfig.transformer && baseConfig.transformer !== 'auto') {
                ui.error(`❌ Manually specified transformer "${baseConfig.transformer}" not found`)
              }
              ui.info('Available transformers:')
              transformers.forEach((transformer) => {
                if (transformer.hasDomain) {
                  ui.info(`  - ${transformer.name} (${transformer.domain})`)
                }
                else {
                  ui.info(`  - ${transformer.name}`)
                }
              })
              process.exit(1)
            }
          }
          else {
            ui.error('❌ No baseConfig available for transformer matching')
            process.exit(1)
          }
        }
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
