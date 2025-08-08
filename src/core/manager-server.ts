import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as http from 'node:http'
import { join } from 'node:path'
import process from 'node:process'
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
    // In development, use the source path; in production, use the bundled path
    const isDev = process.env.NODE_ENV === 'development' || existsSync(join(process.cwd(), 'src'))

    let standalonePath: string
    let serverPath: string

    if (isDev) {
      const managerPath = join(process.cwd(), 'src/manager')
      standalonePath = join(managerPath, '.next/standalone')
      serverPath = join(standalonePath, 'server.js')
    }
    else {
      // In production, the manager is bundled alongside the CLI
      const binPath = join(__dirname, '../manager')
      standalonePath = binPath
      serverPath = join(binPath, 'server.js')
    }

    // Check if standalone build exists
    if (!existsSync(serverPath)) {
      throw new Error('Manager standalone build not found. Please build the manager first with: cd src/manager && pnpm run build')
    }

    displayInfo('Starting Claude Configuration Manager...')

    try {
      // Start the standalone server as a child process
      this.childProcess = spawn('node', [serverPath], {
        cwd: standalonePath,
        env: {
          ...process.env,
          PORT: this.port.toString(),
          HOSTNAME: 'localhost',
        },
        stdio: ['ignore', 'ignore', 'ignore'], // Suppress all output
      })

      // Handle process events
      this.childProcess.on('error', (error) => {
        displayError(`Failed to start manager: ${error.message}`)
      })

      this.childProcess.on('exit', (code, _signal) => {
        if (code !== 0 && code !== null) {
          displayError(`Manager process exited with code ${code}`)
        }
        this.childProcess = null
      })

      // Wait for server to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server startup timeout'))
        }, 15000)

        const checkServer = (): void => {
          const req = http.request({
            hostname: 'localhost',
            port: this.port,
            method: 'GET',
            path: '/',
            timeout: 1000,
          }, (_res) => {
            clearTimeout(timeout)
            displaySuccess(`✨ Claude Configuration Manager is running on port ${this.port}!`)
            displayInfo(`Opening manager at http://localhost:${this.port}`)
            displayInfo('Press Ctrl+C to stop the manager')
            resolve()
          })

          req.on('error', () => {
            // Server not ready yet, try again
            setTimeout(checkServer, 1000)
          })

          req.on('timeout', () => {
            req.destroy()
            setTimeout(checkServer, 1000)
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

      this.childProcess.kill('SIGTERM')

      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if graceful shutdown takes too long
          if (this.childProcess) {
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
