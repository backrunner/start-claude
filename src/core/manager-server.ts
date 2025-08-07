import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import open from 'open'
import { displayError, displayInfo, displaySuccess } from '../utils/ui'

export class ManagerServer {
  private process: ChildProcess | null = null
  private port = 3001

  constructor(port?: number) {
    if (port) {
      this.port = port
    }
  }

  async start(): Promise<void> {
    const managerPath = join(__dirname, '../../manager')

    if (!existsSync(join(managerPath, 'package.json'))) {
      throw new Error('Manager UI not found. Please ensure the manager is properly installed.')
    }

    displayInfo('Starting Claude Configuration Manager...')

    try {
      // Install dependencies if node_modules doesn't exist
      if (!existsSync(join(managerPath, 'node_modules'))) {
        displayInfo('Installing manager dependencies...')
        await this.installDependencies(managerPath)
      }

      // Build the Next.js app if .next doesn't exist
      if (!existsSync(join(managerPath, '.next'))) {
        displayInfo('Building manager interface...')
        await this.buildApp(managerPath)
      }

      // Start the Next.js server
      await this.startNextServer(managerPath)

      // Open browser
      displayInfo(`Opening manager at http://localhost:${this.port}`)
      await open(`http://localhost:${this.port}`)

      displaySuccess('✨ Claude Configuration Manager is running!')
      displayInfo('Press ESC in the browser to close the manager')
    }
    catch (error) {
      displayError(`Failed to start manager: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  private async installDependencies(managerPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: managerPath,
        stdio: 'pipe',
        shell: true,
      })

      npm.on('close', (code) => {
        if (code === 0) {
          resolve()
        }
        else {
          reject(new Error(`npm install failed with code ${code}`))
        }
      })

      npm.on('error', (error) => {
        reject(error)
      })
    })
  }

  private async buildApp(managerPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], {
        cwd: managerPath,
        stdio: 'pipe',
        shell: true,
      })

      build.on('close', (code) => {
        if (code === 0) {
          resolve()
        }
        else {
          reject(new Error(`build failed with code ${code}`))
        }
      })

      build.on('error', (error) => {
        reject(error)
      })
    })
  }

  private async startNextServer(managerPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn('npm', ['start'], {
        cwd: managerPath,
        stdio: 'pipe',
        shell: true,
        env: { ...process.env, PORT: this.port.toString() },
      })

      let startupTimeout: NodeJS.Timeout

      if (this.process.stdout) {
        this.process.stdout.on('data', (data) => {
          const output = data.toString()
          if (output.includes('ready') || output.includes('started server')) {
            if (startupTimeout) {
              clearTimeout(startupTimeout)
            }
            resolve()
          }
        })
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          const error = data.toString()
          if (error.includes('EADDRINUSE')) {
            reject(new Error(`Port ${this.port} is already in use`))
          }
        })
      }

      this.process.on('error', (error) => {
        reject(error)
      })

      this.process.on('close', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Manager process exited with code ${code}`))
        }
      })

      // Set a timeout for startup
      startupTimeout = setTimeout(() => {
        resolve() // Assume it started successfully after timeout
      }, 5000)
    })
  }

  async stop(): Promise<void> {
    if (this.process) {
      displayInfo('Stopping Configuration Manager...')
      this.process.kill('SIGTERM')

      // Force kill if it doesn't stop gracefully
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL')
        }
      }, 5000)

      this.process = null
      displaySuccess('Configuration Manager stopped')
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }
}
