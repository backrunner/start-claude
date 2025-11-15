import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as http from 'node:http'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import open from 'open'
import { UILogger } from '../utils/cli/ui'
import { checkExistingInstance, createLock, removeLock, startHeartbeat } from '../utils/manager/lock'
import { findAvailablePort } from '../utils/network/port-finder'

export class ManagerServer {
  private childProcess: ChildProcess | null = null
  private port = 2334
  private stopHeartbeat: (() => void) | null = null
  private debug = false
  private defaultMode: 'claude' | 'codex' = 'claude'

  constructor(port?: number, debug?: boolean, defaultMode?: 'claude' | 'codex') {
    if (port) {
      this.port = port
    }
    this.debug = debug || false
    this.defaultMode = defaultMode || 'claude'
  }

  async start(): Promise<void> {
    const ui = new UILogger()

    // Check for existing manager instance
    const existingInstance = await checkExistingInstance()
    if (existingInstance) {
      ui.displayWarning(`Manager is already running on port ${existingInstance.port} (PID: ${existingInstance.pid})`)
      ui.displayInfo(`Opening existing manager at http://localhost:${existingInstance.port}`)
      await open(`http://localhost:${existingInstance.port}`)
      return
    }

    // Find an available port if the requested port is not available
    const availablePort = await findAvailablePort(this.port, 10)
    if (availablePort === null) {
      throw new Error(`Unable to find an available port starting from ${this.port}. Please try a different port range.`)
    }

    if (availablePort !== this.port) {
      ui.displayWarning(`Port ${this.port} is not available, using port ${availablePort} instead`)
      this.port = availablePort
    }

    // When bundled as ./bin/cli.mjs, manager is in ./bin/manager
    const currentDir = dirname(fileURLToPath(import.meta.url))
    const managerPath = join(currentDir, './manager')

    // Check if manager build exists (look for server.js from standalone build)
    if (!existsSync(join(managerPath, './server.js'))) {
      throw new Error('Manager build not found. Please build the manager first with: cd src/manager && pnpm run build')
    }

    ui.displayInfo('Starting Claude Configuration Manager...')

    // Create lock file
    createLock(this.port)

    // Start heartbeat to keep lock alive
    this.stopHeartbeat = startHeartbeat()

    try {
      // For standalone build, we spawn the server.js file directly
      // In debug mode, pipe all output to CLI stdout
      const stdio: ['ignore', 'ignore' | 'pipe', 'pipe'] = this.debug
        ? ['ignore', 'pipe', 'pipe'] // Debug: show stdout and stderr
        : ['ignore', 'ignore', 'pipe'] // Normal: only capture stderr for errors

      this.childProcess = spawn('node', ['./server.js'], {
        cwd: managerPath,
        env: {
          ...process.env,
          PORT: this.port.toString(),
          HOSTNAME: 'localhost',
          DEFAULT_MODE: this.defaultMode,
        },
        stdio,
      })

      // In debug mode, pipe stdout to CLI stdout
      if (this.debug && this.childProcess.stdout) {
        ui.displayVerbose('Debug mode: Manager server output will be shown below')
        this.childProcess.stdout.on('data', (data) => {
          process.stdout.write(data)
        })
      }

      // Handle stderr
      if (this.childProcess.stderr) {
        this.childProcess.stderr.on('data', (data) => {
          const output = data.toString().trim()
          if (this.debug) {
            // In debug mode, show all stderr output
            process.stderr.write(data)
          }
          else {
            // Only show actual errors, not Next.js info/warnings
            if (output.includes('Error') || output.includes('EADDRINUSE') || output.includes('Cannot')) {
              console.error('Manager error:', output)
            }
          }
        })
      }

      // Handle process events
      this.childProcess.on('error', (error) => {
        ui.displayError(`Failed to start manager: ${error.message}`)
      })

      this.childProcess.on('exit', (code, signal) => {
        // Stop heartbeat and remove lock file when process exits
        if (this.stopHeartbeat) {
          this.stopHeartbeat()
          this.stopHeartbeat = null
        }
        removeLock()

        // Check if this was an intentional shutdown (from ESC key or API call)
        const wasIntentionalShutdown = code === 0 || signal === 'SIGTERM'

        if (wasIntentionalShutdown) {
          ui.displaySuccess('Configuration Manager stopped')
          // Exit the CLI process as well when manager shuts down intentionally
          setTimeout(() => {
            ui.displayInfo('Exiting CLI...')
            process.exit(0)
          }, 100)
        }
        else if (code !== null) {
          // Only show error for unexpected exits
          ui.displayError(`Manager process exited unexpectedly with code ${code}`)
        }

        this.childProcess = null
      })

      // Wait for server to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server startup timeout'))
        }, 15000)

        let resolved = false

        const checkServer = (): void => {
          if (resolved)
            return

          const req = http.request({
            hostname: 'localhost',
            port: this.port,
            method: 'GET',
            path: '/',
            timeout: 1000,
          }, (_res) => {
            if (resolved)
              return
            resolved = true
            clearTimeout(timeout)
            ui.displaySuccess(`✨ Claude Configuration Manager is running on port ${this.port}!`)
            ui.displayInfo(`Opening manager at http://localhost:${this.port}`)
            ui.displayInfo('Press Ctrl+C to stop the manager')
            resolve()
          })

          req.on('error', () => {
            if (!resolved) {
              // Server not ready yet, try again
              setTimeout(checkServer, 1000)
            }
          })

          req.on('timeout', () => {
            req.destroy()
            if (!resolved) {
              setTimeout(checkServer, 1000)
            }
          })

          req.end()
        }

        // Start checking after a brief delay
        setTimeout(checkServer, 2000)
      })

      // Open browser with appropriate path based on default mode
      const targetPath = this.defaultMode === 'codex' ? '/codex' : '/'
      await open(`http://localhost:${this.port}${targetPath}`)
    }
    catch (error) {
      // Stop heartbeat and remove lock file if startup failed
      if (this.stopHeartbeat) {
        this.stopHeartbeat()
        this.stopHeartbeat = null
      }
      removeLock()

      if (this.childProcess) {
        this.childProcess.kill()
        this.childProcess = null
      }
      ui.displayError(`Failed to start manager: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  async stop(): Promise<void> {
    const ui = new UILogger()
    if (this.childProcess) {
      ui.displayInfo('Stopping Configuration Manager...')

      // Stop heartbeat and remove lock file
      if (this.stopHeartbeat) {
        this.stopHeartbeat()
        this.stopHeartbeat = null
      }
      removeLock()

      // Send shutdown request to manager server
      try {
        const req = http.request({
          hostname: 'localhost',
          port: this.port,
          method: 'POST',
          path: '/api/shutdown',
          headers: { 'Content-Type': 'application/json' },
          timeout: 2000,
        }, () => {
          // Response received, shutdown message sent
          ui.displayInfo('Shutdown signal sent to manager')
        })

        req.on('error', () => {
          // Ignore errors - server might already be shutting down
        })

        req.on('timeout', () => {
          req.destroy()
        })

        req.write('{}')
        req.end()

        // Give a brief moment for the shutdown request to be processed
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      catch {
        // Ignore errors during shutdown API call
      }

      // Send SIGTERM for graceful shutdown
      this.childProcess.kill('SIGTERM')

      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if graceful shutdown takes too long
          if (this.childProcess && !this.childProcess.killed) {
            this.childProcess.kill('SIGKILL')
          }
          resolve()
        }, 5000)

        this.childProcess!.on('exit', () => {
          clearTimeout(timeout)
          this.childProcess = null
          // Don't show success message here - it's handled by the main exit handler
          resolve()
        })
      })
    }
  }

  isRunning(): boolean {
    return this.childProcess !== null && !this.childProcess.killed
  }
}
