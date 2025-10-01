import process from 'node:process'
import { ManagerServer } from '../core/manager-server'
import { S3SyncManager } from '../storage/s3-sync'
import { UILogger } from '../utils/cli/ui'

export async function handleManagerCommand(options: { port?: string, verbose?: boolean, debug?: boolean } = {}): Promise<void> {
  // Create UILogger with verbose mode configured
  const ui = new UILogger(options.verbose || options.debug)

  ui.displayWelcome()

  // Display verbose mode status if enabled
  ui.displayVerbose('Verbose mode enabled for manager startup')

  // Initialize config manager and ensure migrations run
  const { ConfigManager } = await import('../config/manager')
  const configManager = ConfigManager.getInstance()

  // Load config to trigger migrations before starting manager
  ui.displayVerbose('🔄 Checking for pending migrations...')
  await configManager.load()
  ui.displayVerbose('✅ Migration check completed')

  // Initialize S3 sync for config manager
  await configManager.initializeS3Sync()

  // Check for remote config updates before starting manager
  const s3SyncManager = S3SyncManager.getInstance()
  if (await s3SyncManager.isS3Configured()) {
    ui.displayVerbose('🔄 Checking for remote S3 configuration updates...')
    await s3SyncManager.checkAutoSync({ verbose: options.verbose || options.debug })
    ui.displayVerbose('✅ S3 config check completed')
  }
  else {
    ui.displayVerbose('S3 not configured, skipping config check')
  }

  const port = options.port ? Number.parseInt(options.port) : 2334
  const managerServer = new ManagerServer(port)

  try {
    await managerServer.start()

    // Keep the process running until manager server exits
    // The ManagerServer will handle exiting the CLI when the server shuts down
    process.stdin.resume()

    const cleanup = (): void => {
      void managerServer.stop()
    }

    // Handle Ctrl+C - just stop the manager, don't exit CLI immediately
    // The ManagerServer exit handler will exit the CLI
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  }
  catch (error) {
    ui.displayError(`Failed to start manager: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
