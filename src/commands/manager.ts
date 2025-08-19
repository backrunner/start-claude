import process from 'node:process'
import { ManagerServer } from '../core/manager-server'
import { S3SyncManager } from '../storage/s3-sync'
import { displayError, displayWelcome } from '../utils/cli/ui'

export async function handleManagerCommand(options: { port?: string }): Promise<void> {
  displayWelcome()

  // Initialize S3 sync for config manager
  const { ConfigManager } = await import('../config/manager')
  const configManager = ConfigManager.getInstance()
  await configManager.initializeS3Sync()

  // Check for remote config updates before starting manager
  const s3SyncManager = S3SyncManager.getInstance()
  if (await s3SyncManager.isS3Configured()) {
    await s3SyncManager.checkAutoSync()
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
    displayError(`Failed to start manager: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
