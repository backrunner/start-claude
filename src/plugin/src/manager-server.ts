import type { ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { exec, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as http from 'node:http'
import * as net from 'node:net'
import * as path from 'node:path'
import * as process from 'node:process'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

const execAsync = promisify(exec)

interface PackageInstallation {
  name: string
  command: string
  installCmd: string
  checkPath: string
}

export class ManagerServer {
  private static instance: ManagerServer | undefined
  private serverProcess: ChildProcess | undefined
  private port: number = 3000
  private isStarting: boolean = false
  private isRunning: boolean = false
  private claudeCodePath: string | undefined
  private startClaudePath: string | undefined

  constructor() {
    // Singleton pattern - only allow one instance
    if (ManagerServer.instance) {
      return ManagerServer.instance
    }
    ManagerServer.instance = this

    // Find available port
    void this.findAvailablePort()
  }

  private async findAvailablePort(): Promise<void> {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.listen(0, () => {
        const address = server.address() as AddressInfo
        this.port = address?.port || 3000
        server.close(() => resolve())
      })
    })
  }

  public async start(): Promise<void> {
    if (this.isRunning || this.isStarting) {
      return
    }

    this.isStarting = true

    try {
      await this.findAvailablePort()

      // Check if both CLI tools are globally installed, install if not
      const installationStatus = await this.checkGlobalInstallations()
      const missingPackages = this.getMissingPackages(installationStatus)

      if (missingPackages.length > 0) {
        await this.installMissingPackages(missingPackages)
      }

      // Use the standalone manager server from start-claude
      const managerPath = this.getManagerPath()
      if (!existsSync(path.join(managerPath, 'server.js'))) {
        throw new Error('Manager build not found in global installation. Please reinstall start-claude globally.')
      }

      // Start the standalone Next.js server
      this.serverProcess = spawn('node', ['server.js'], {
        cwd: managerPath,
        env: {
          ...process.env,
          PORT: this.port.toString(),
          HOSTNAME: 'localhost',
          VSCODE_PLUGIN: 'true', // Flag to indicate running in VSCode plugin
        },
        stdio: ['ignore', 'ignore', 'pipe'], // Suppress stdout, capture stderr for errors
      })

      // Handle stderr for actual errors (but suppress normal Next.js output)
      if (this.serverProcess.stderr) {
        this.serverProcess.stderr.on('data', (data) => {
          const output = data.toString().trim()
          // Only show actual errors, not Next.js info/warnings
          if (output.includes('Error') || output.includes('EADDRINUSE') || output.includes('Cannot')) {
            console.error('Manager error:', output)
          }
        })
      }

      this.serverProcess.on('close', (code) => {
        console.log(`Manager server process exited with code ${code}`)
        this.isRunning = false
        this.isStarting = false
        this.serverProcess = undefined
      })

      this.serverProcess.on('error', (error) => {
        console.error('Manager server error:', error)
        this.isRunning = false
        this.isStarting = false
        this.serverProcess = undefined
        vscode.window.showErrorMessage(`Failed to start manager server: ${error.message}`)
      })

      // Wait for the server to start
      await this.waitForServer()
    }
    catch (error) {
      this.isStarting = false
      console.error('Failed to start manager server:', error)
      vscode.window.showErrorMessage(`Failed to start manager server: ${String(error)}`)
      throw error
    }
  }

  private async checkGlobalInstallations(): Promise<Record<string, boolean>> {
    const packages = this.getRequiredPackages()
    const status: Record<string, boolean> = {}

    for (const pkg of packages) {
      try {
        // Check if command is available
        await execAsync(`${pkg.command} --version`)
        console.log(`Found ${pkg.name} installed globally`)

        // Find the global installation path
        const installPath = await this.findGlobalInstallPath(pkg.checkPath)
        if (installPath) {
          if (pkg.name === '@anthropic-ai/claude-code') {
            this.claudeCodePath = installPath
          }
          else if (pkg.name === 'start-claude') {
            this.startClaudePath = installPath
          }
          status[pkg.name] = true
        }
        else {
          status[pkg.name] = false
        }
      }
      catch (error) {
        console.log(`${pkg.name} not globally installed:`, error)
        status[pkg.name] = false
      }
    }

    return status
  }

  private getRequiredPackages(): PackageInstallation[] {
    return [
      {
        name: '@anthropic-ai/claude-code',
        command: 'claude',
        installCmd: '@anthropic-ai/claude-code',
        checkPath: '@anthropic-ai/claude-code',
      },
      {
        name: 'start-claude',
        command: 'start-claude',
        installCmd: 'start-claude',
        checkPath: 'start-claude',
      },
    ]
  }

  private getMissingPackages(status: Record<string, boolean>): PackageInstallation[] {
    const allPackages = this.getRequiredPackages()
    return allPackages.filter(pkg => !status[pkg.name])
  }

  private async findGlobalInstallPath(packageName: string): Promise<string | undefined> {
    try {
      // Get global node_modules path
      const { stdout } = await execAsync('npm root -g')
      const globalRoot = stdout.trim()
      const packagePath = path.join(globalRoot, packageName)

      if (existsSync(packagePath)) {
        return packagePath
      }

      return undefined
    }
    catch (error) {
      console.error(`Error finding global install path for ${packageName}:`, error)
      return undefined
    }
  }

  private async installMissingPackages(missingPackages: PackageInstallation[]): Promise<void> {
    const packageNames = missingPackages.map(p => p.name).join(', ')
    const answer = await vscode.window.showInformationMessage(
      `The following packages are not globally installed: ${packageNames}. Install them now?`,
      'Install',
      'Cancel',
    )

    if (answer !== 'Install') {
      throw new Error('Package installation cancelled')
    }

    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Installing required packages globally...',
      cancellable: false,
    }, async (progress) => {
      try {
        const packageManagers = [
          { name: 'pnpm', cmd: (pkg: string) => `pnpm add -g ${pkg}` },
          { name: 'npm', cmd: (pkg: string) => `npm install -g ${pkg}` },
          { name: 'yarn', cmd: (pkg: string) => `yarn global add ${pkg}` },
        ]

        // Find available package manager
        let selectedPM: typeof packageManagers[0] | undefined
        for (const pm of packageManagers) {
          try {
            await execAsync(`${pm.name} --version`)
            selectedPM = pm
            break
          }
          catch {
            // Try next package manager
          }
        }

        if (!selectedPM) {
          throw new Error('No supported package manager found (npm, pnpm, yarn)')
        }

        // Install each missing package
        for (let i = 0; i < missingPackages.length; i++) {
          const pkg = missingPackages[i]
          const progressPercent = (i / missingPackages.length) * 100

          progress.report({
            increment: progressPercent,
            message: `Installing ${pkg.name}...`,
          })

          console.log(`Installing ${pkg.name} using ${selectedPM.name}...`)
          await execAsync(selectedPM.cmd(pkg.installCmd))

          // Verify installation
          const installPath = await this.findGlobalInstallPath(pkg.checkPath)
          if (!installPath) {
            throw new Error(`Installation verification failed for ${pkg.name}`)
          }

          // Update paths
          if (pkg.name === '@anthropic-ai/claude-code') {
            this.claudeCodePath = installPath
          }
          else if (pkg.name === 'start-claude') {
            this.startClaudePath = installPath
          }
        }

        progress.report({ increment: 100, message: 'Installation complete!' })
        vscode.window.showInformationMessage('All required packages installed successfully!')
      }
      catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        vscode.window.showErrorMessage(`Failed to install packages: ${errorMsg}`)
        throw error
      }
    })
  }

  private getManagerPath(): string {
    if (!this.startClaudePath) {
      throw new Error('start-claude installation path not found')
    }
    return path.join(this.startClaudePath, 'bin', 'manager')
  }

  public getStartClaudePath(): string | undefined {
    return this.startClaudePath
  }

  private async waitForServer(maxWaitTime: number = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error('Server startup timeout'))
        }
      }, maxWaitTime)

      const checkServer = (): void => {
        if (resolved) {
          return
        }

        const req = http.request({
          hostname: 'localhost',
          port: this.port,
          method: 'GET',
          path: '/',
          timeout: 1000,
        }, (res) => {
          if (resolved) {
            return
          }
          if (res.statusCode === 200 || res.statusCode === 404) {
            resolved = true
            clearTimeout(timeout)
            this.isRunning = true
            this.isStarting = false
            resolve()
          }
          else {
            setTimeout(checkServer, 1000)
          }
          res.destroy()
        })

        req.on('error', () => {
          if (!resolved) {
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
  }

  public getPort(): number {
    return this.port
  }

  public isServerRunning(): boolean {
    return this.isRunning
  }

  public dispose(): void {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM')
      this.serverProcess = undefined
    }
    this.isRunning = false
    this.isStarting = false
    ManagerServer.instance = undefined
  }
}
