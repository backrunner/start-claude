import process from 'node:process'
import { ManagerServer } from '../core/manager-server'
import { displayError, displayWelcome } from '../utils/ui'

export async function handleManagerCommand(options: { port?: string }): Promise<void> {
  displayWelcome()

  const port = options.port ? Number.parseInt(options.port) : 2334
  const managerServer = new ManagerServer(port)

  try {
    await managerServer.start()

    // Keep the process running until user terminates
    process.stdin.resume()

    const cleanup = (): void => {
      void managerServer.stop()
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  }
  catch (error) {
    displayError(`Failed to start manager: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exit(1)
  }
}
