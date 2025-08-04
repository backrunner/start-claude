import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

interface ShellConfig {
  path: string
  aliasPrefix: string
  aliasFormat: string
  comment: string
}

const UNIX_SHELLS: Record<string, ShellConfig> = {
  bash: {
    path: path.join(os.homedir(), '.bashrc'),
    aliasPrefix: 'alias',
    aliasFormat: 'alias claude="start-claude"',
    comment: '# start-claude override',
  },
  zsh: {
    path: path.join(os.homedir(), '.zshrc'),
    aliasPrefix: 'alias',
    aliasFormat: 'alias claude="start-claude"',
    comment: '# start-claude override',
  },
  fish: {
    path: path.join(os.homedir(), '.config/fish/config.fish'),
    aliasPrefix: 'alias',
    aliasFormat: 'alias claude="start-claude"',
    comment: '# start-claude override',
  },
}

const WINDOWS_SHELLS: Record<string, ShellConfig> = {
  'powershell': {
    path: path.join(os.homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    aliasPrefix: 'Set-Alias',
    aliasFormat: 'Set-Alias -Name claude -Value start-claude',
    comment: '# start-claude override',
  },
  'pwsh': {
    path: path.join(os.homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    aliasPrefix: 'Set-Alias',
    aliasFormat: 'Set-Alias -Name claude -Value start-claude',
    comment: '# start-claude override',
  },
  'cmd': {
    path: path.join(os.homedir(), 'claude-alias.bat'),
    aliasPrefix: '@echo off',
    aliasFormat: '@echo off\nstart-claude %*',
    comment: 'REM start-claude override',
  },
  'git-bash': {
    path: path.join(os.homedir(), '.bashrc'),
    aliasPrefix: 'alias',
    aliasFormat: 'alias claude="start-claude"',
    comment: '# start-claude override',
  },
}

export class OverrideManager {
  private isWindows(): boolean {
    return process.platform === 'win32'
  }

  private detectWindowsShell(): string | null {
    // Check for PowerShell (Core or Windows PowerShell)
    if (process.env.PSModulePath) {
      return 'powershell'
    }

    // Check for Git Bash
    if (process.env.SHELL && process.env.SHELL.includes('bash')) {
      return 'git-bash'
    }

    // Check for Command Prompt
    if (process.env.COMSPEC && process.env.COMSPEC.includes('cmd')) {
      return 'cmd'
    }

    // Default to PowerShell on Windows
    return 'powershell'
  }

  private getShellConfig(): ShellConfig | null {
    if (this.isWindows()) {
      const shell = this.detectWindowsShell()
      if (shell && WINDOWS_SHELLS[shell]) {
        return WINDOWS_SHELLS[shell]
      }
      return null
    }

    // Unix-like systems
    const shell = process.env.SHELL?.split('/').pop()
    if (shell && UNIX_SHELLS[shell]) {
      return UNIX_SHELLS[shell]
    }

    return null
  }

  private ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private setupWindowsCmdAlias(shellConfig: ShellConfig): boolean {
    try {
      // For CMD, we create a batch file and add it to PATH
      this.ensureDirectoryExists(shellConfig.path)

      const batchContent = `${shellConfig.comment}\n${shellConfig.aliasFormat}`
      fs.writeFileSync(shellConfig.path, batchContent, 'utf-8')

      // Add the directory to user PATH if not already there
      const userPath = process.env.PATH || ''
      const batchDir = path.dirname(shellConfig.path)

      if (!userPath.includes(batchDir)) {
        // Note: This would require registry modification or using setx command
        // For now, we'll just inform the user
        console.log(`\nTo complete the setup for Command Prompt:`)
        console.log(`1. The alias file has been created at: ${shellConfig.path}`)
        console.log(`2. Add ${batchDir} to your system PATH environment variable`)
        console.log(`3. Or move the file to a directory already in your PATH`)
      }

      return true
    }
    catch {
      return false
    }
  }

  isOverrideActive(): boolean {
    const shellConfig = this.getShellConfig()
    if (!shellConfig) {
      return false
    }

    try {
      if (!fs.existsSync(shellConfig.path)) {
        return false
      }

      const content = fs.readFileSync(shellConfig.path, 'utf-8')

      // For CMD, check if the batch file exists and has the right content
      if (this.isWindows() && this.detectWindowsShell() === 'cmd') {
        return content.includes('start-claude %*')
      }

      // For other shells, check for the alias line
      return content.includes(shellConfig.aliasFormat)
    }
    catch {
      return false
    }
  }

  enableOverride(): boolean {
    const shellConfig = this.getShellConfig()
    if (!shellConfig) {
      return false
    }

    // Special handling for Windows CMD
    if (this.isWindows() && this.detectWindowsShell() === 'cmd') {
      return this.setupWindowsCmdAlias(shellConfig)
    }

    try {
      this.ensureDirectoryExists(shellConfig.path)

      let content = ''
      if (fs.existsSync(shellConfig.path)) {
        content = fs.readFileSync(shellConfig.path, 'utf-8')
      }

      // Check if alias already exists
      if (content.includes(shellConfig.aliasFormat)) {
        return true
      }

      // Add the alias
      const aliasLines = [shellConfig.comment, shellConfig.aliasFormat]
      const newContent = `${content.trim()}\n\n${aliasLines.join('\n')}\n`

      fs.writeFileSync(shellConfig.path, newContent, 'utf-8')
      return true
    }
    catch {
      return false
    }
  }

  disableOverride(): boolean {
    const shellConfig = this.getShellConfig()
    if (!shellConfig) {
      return false
    }

    try {
      if (!fs.existsSync(shellConfig.path)) {
        return true
      }

      // For CMD, just delete the batch file
      if (this.isWindows() && this.detectWindowsShell() === 'cmd') {
        fs.unlinkSync(shellConfig.path)
        return true
      }

      // For other shells, remove the alias lines
      const content = fs.readFileSync(shellConfig.path, 'utf-8')
      const lines = content.split('\n')

      const filteredLines = lines.filter(line =>
        !line.includes(shellConfig.comment) && !line.includes(shellConfig.aliasFormat),
      )

      const newContent = filteredLines.join('\n')
      fs.writeFileSync(shellConfig.path, newContent, 'utf-8')
      return true
    }
    catch {
      return false
    }
  }

  getShellInfo(): { shell: string | null, configFile: string | null, platform: string, instructions?: string } {
    const platform = this.isWindows() ? 'windows' : 'unix'

    if (this.isWindows()) {
      const shell = this.detectWindowsShell()
      const shellConfig = shell ? WINDOWS_SHELLS[shell] : null

      let instructions = ''
      if (shell === 'cmd') {
        instructions = 'For Command Prompt, you may need to add the alias file directory to your PATH'
      }
      else if (shell === 'powershell') {
        instructions = 'For PowerShell, you may need to set execution policy: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser'
      }

      return {
        shell,
        configFile: shellConfig?.path || null,
        platform,
        instructions,
      }
    }

    // Unix-like systems
    const shell = process.env.SHELL?.split('/').pop() ?? null
    const shellConfig = this.getShellConfig()

    return {
      shell,
      configFile: shellConfig?.path || null,
      platform,
    }
  }

  getSupportedShells(): string[] {
    if (this.isWindows()) {
      return Object.keys(WINDOWS_SHELLS)
    }
    return Object.keys(UNIX_SHELLS)
  }
}
