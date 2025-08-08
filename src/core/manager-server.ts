import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as http from 'node:http'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import open from 'open'
import { displayError, displayInfo, displaySuccess } from '../utils/ui'

export class ManagerServer {
  private childProcess: ChildProcess | null = null
  private port = 2334

  constructor(port?: number) {
    if (port) {
      this.port = port
    }
  }

  async start(): Promise<void> {
    // When bundled as ./bin/cli.mjs, manager is in ./bin/manager
    const currentDir = dirname(fileURLToPath(import.meta.url))
    const managerPath = join(currentDir, './manager')

    // Check if manager build exists (look for server.js from standalone build)
    if (!existsSync(join(managerPath, './server.js'))) {
      throw new Error('Manager build not found. Please build the manager first with: cd src/manager && pnpm run build')
    }

    displayInfo('Starting Claude Configuration Manager...')

    try {
      // For standalone build, we spawn the server.js file directly
      this.childProcess = spawn('node', ['./server.js'], {
        cwd: managerPath,
        env: {
          ...process.env,
          PORT: this.port.toString(),
          HOSTNAME: 'localhost',
        },
        stdio: ['ignore', 'ignore', 'pipe'], // Suppress stdout, capture stderr for errors
      })

      // Handle stderr for actual errors (but suppress normal Next.js output)
      if (this.childProcess.stderr) {
        this.childProcess.stderr.on('data', (data) => {
          const output = data.toString().trim()
          // Only show actual errors, not Next.js info/warnings
          if (output.includes('Error') || output.includes('EADDRINUSE') || output.includes('Cannot')) {
            console.error('Manager error:', output)
          }
        })
      }

      // Handle process events
      this.childProcess.on('error', (error) => {
        displayError(`Failed to start manager: ${error.message}`)
      })

      this.childProcess.on('exit', (code, signal) => {
        // Only show error for unexpected exits (not SIGTERM which is normal shutdown)
        if (code !== 0 && code !== null && signal !== 'SIGTERM') {
          displayError(`Manager process exited unexpectedly with code ${code}`)
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
            displaySuccess(`✨ Claude Configuration Manager is running on port ${this.port}!`)
            displayInfo(`Opening manager at http://localhost:${this.port}`)
            displayInfo('Press Ctrl+C to stop the manager')
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

      // Open browser
      await open(`http://localhost:${this.port}`)
    }
    catch (error) {
      if (this.childProcess) {
        this.childProcess.kill()
        this.childProcess = null
      }
      displayError(`Failed to start manager: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.childProcess) {
      displayInfo('Stopping Configuration Manager...')

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
          displaySuccess('Configuration Manager stopped')
          resolve()
        })
      })
    }
  }

  isRunning(): boolean {
    return this.childProcess !== null && !this.childProcess.killed
  }
}
