import type { ConfigManager } from '../config/manager'
import type { LoadBalancerStrategy } from '../config/types'
import type { ProgramOptions } from './common'
import process from 'node:process'
import { ProxyServer } from '../core/proxy'
import { S3SyncManager } from '../storage/s3-sync'
import { displayError, displayInfo, displaySuccess } from '../utils/cli/ui'
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
  // Check for S3 sync updates at startup
  const s3SyncManager = new S3SyncManager()
  if (s3SyncManager.isS3Configured()) {
    const updated = await s3SyncManager.checkRemoteUpdates()
    if (updated) {
      // Reload configs after potential update
      displayInfo('Configuration updated from S3, reloading...')
    }
  }

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

    displaySuccess('🔄 Using existing proxy server')

    // Start Claude Code with the existing proxy server configuration
    const exitCode = await startClaude(baseConfig, allArgs, cliOverrides)
    process.exit(exitCode)
  }

  // Setup cleanup handlers for lock file
  setupProxyCleanup()

  // Get configurations for proxy mode - use forced configs or all configs
  const configs = forcedConfigs || configManager.listConfigs()

  // Include configs that have complete API credentials (baseUrl, apiKey, and model) OR have transformer enabled
  const proxyableConfigs = configs.filter((c) => {
    const hasCompleteApiCredentials = c.baseUrl && c.apiKey && c.model
    const hasTransformerEnabled = c.transformerEnabled === true

    if (hasTransformerEnabled && !hasCompleteApiCredentials) {
      displayInfo(`Configuration "${c.name}" is transformer-enabled but missing complete API credentials (baseUrl/apiKey/model) - including for transformer fallback`)
    }

    return hasCompleteApiCredentials || hasTransformerEnabled
  })

  if (proxyableConfigs.length === 0) {
    displayError('No configurations found for proxy mode')
    displayInfo('Proxy mode requires configurations with either:')
    displayInfo('  - baseUrl, apiKey, and model (for direct API calls)')
    displayInfo('  - transformerEnabled: true (for transformer processing)')
    process.exit(1)
  }

  // Show which configs are included and why - only when balance mode is enabled
  if (options.balance) {
    displayInfo(`Starting proxy with ${proxyableConfigs.length} endpoint${proxyableConfigs.length > 1 ? 's' : ''}:`)
    proxyableConfigs.forEach((c) => {
      const hasCompleteApi = c.baseUrl && c.apiKey && c.model
      const hasTransformer = c.transformerEnabled === true

      let status = ''
      if (hasCompleteApi && hasTransformer) {
        status = ' (complete API + transformer)'
      }
      else if (hasCompleteApi) {
        status = ' (complete API only)'
      }
      else if (hasTransformer) {
        status = ' (transformer only - needs fallback endpoints)'
      }

      displayInfo(`  - ${c.name}: ${c.baseUrl || 'no baseUrl'}${status}`)
    })
  }

  try {
    // Check if any config has transformer enabled
    const hasTransformerEnabled = proxyableConfigs.some(c => c.transformerEnabled === true)

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
      displayInfo('')
      displayInfo(`📝 Debug logging enabled - logs will be written to: ${fileLogger.getLogFilePath()}`)
    }

    // Show transformer information if transformers are enabled
    if (hasTransformerEnabled) {
      const transformers = proxyServer.listTransformers()
      if (transformers.length > 0) {
        displayInfo('')
        if (options.balance) {
          displayInfo('🔧 Available transformers:')
          transformers.forEach((transformer) => {
            if (transformer.hasDomain) {
              displayInfo(`  - ${transformer.name} (${transformer.domain})`)
            }
            else {
              displayInfo(`  - ${transformer.name}`)
            }
          })
        }
        else {
          // Show only the current transformer matching the base config when not in balance mode
          if (baseConfig?.baseUrl) {
            const matchingTransformer = transformers.find(t =>
              t.hasDomain && t.domain && baseConfig.baseUrl!.includes(t.domain),
            )

            if (matchingTransformer) {
              displayInfo('🔧 Current transformer:')
              displayInfo(`  - ${matchingTransformer.name} (${matchingTransformer.domain})`)
            }
            else {
              displayError(`❌ No transformer found for baseUrl: ${baseConfig.baseUrl}`)
              displayInfo('Available transformers:')
              transformers.forEach((transformer) => {
                if (transformer.hasDomain) {
                  displayInfo(`  - ${transformer.name} (${transformer.domain})`)
                }
                else {
                  displayInfo(`  - ${transformer.name}`)
                }
              })
              process.exit(1)
            }
          }
          else {
            displayError('❌ No baseConfig available for transformer matching')
            process.exit(1)
          }
        }
      }
    }

    displayInfo('')

    // Determine proxy mode and show appropriate message
    const apiConfigs = proxyableConfigs.filter(c => c.baseUrl && c.apiKey && c.model)
    const transformerConfigs = proxyableConfigs.filter(c => c.transformerEnabled === true)

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
    displayError(`Failed to start proxy server: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
