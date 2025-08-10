import type { ClaudeConfig } from '../config/types'
import type { ProgramOptions } from './common'
import process from 'node:process'
import { ProxyServer } from '../core/proxy'
import { displayError, displayInfo, displaySuccess } from '../utils/ui'
import { startClaude } from './claude'
import { buildClaudeArgs, buildCliOverrides, filterProcessArgs } from './common'

/**
 * Handle transform mode - start proxy server with transform only (no load balancing)
 */
export async function handleTransformMode(
  config: ClaudeConfig,
  options: ProgramOptions,
  configArg?: string,
): Promise<void> {
  displayInfo('🔧 Starting transformer proxy for endpoint transformation...')
  displayInfo(`Transformer configuration: ${config.name}`)

  try {
    const proxyServer = new ProxyServer([config], {
      enableLoadBalance: false,
      enableTransform: true,
    })

    await proxyServer.startServer(2333)

    displayInfo('')
    displaySuccess('🔧 Transformer proxy is running!')
    displayInfo('Starting Claude Code with transformer proxy...')
    displayInfo('')

    // Build arguments to pass to claude command
    const claudeArgs = buildClaudeArgs(options, config)
    const filteredArgs = filterProcessArgs(configArg)
    const allArgs = [...claudeArgs, ...filteredArgs]

    // Create CLI overrides with transformer proxy settings
    const cliOverrides = {
      ...buildCliOverrides(options),
      apiKey: proxyServer.getProxyApiKey(), // Use proxy server's stub API key
      baseUrl: 'http://localhost:2333', // Use proxy server's URL
    }

    // Handle graceful shutdown
    const handleShutdown = (): void => {
      void (async () => {
        displayInfo('\nShutting down transformer proxy server...')
        await proxyServer.stop()
        process.exit(0)
      })()
    }

    process.on('SIGINT', handleShutdown)
    process.on('SIGTERM', handleShutdown)

    // Start Claude Code with the transformer proxy configuration
    const exitCode = await startClaude(config, allArgs, cliOverrides)

    // When Claude Code exits, stop the proxy server
    await proxyServer.stop()
    process.exit(exitCode)
  }
  catch (error) {
    displayError(`Failed to start transformer proxy server: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
