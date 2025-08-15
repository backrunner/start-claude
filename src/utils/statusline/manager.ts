import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { displayError, displayInfo, displaySuccess, displayVerbose, displayWarning } from '../cli/ui'

export interface ClaudeCodeSettings {
  statusLine?: {
    type: string
    command: string
    padding: number
  }
  [key: string]: any
}

export interface CCStatusLineConfig {
  [key: string]: any
}

export class StatusLineManager {
  private readonly CCSTATUSLINE_CONFIG_PATH = join(homedir(), '.config', 'ccstatusline', 'settings.json')
  private readonly CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

  /**
   * Run ccstatusline setup and monitor for completion
   */
  async runStatusLineSetup(options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      displayInfo('🚀 Starting ccstatusline setup...')
      displayVerbose('Running: npx ccstatusline@latest', options.verbose)

      return await new Promise((resolve) => {
        const child = spawn('npx', ['ccstatusline@latest'], {
          stdio: 'inherit',
          shell: true,
        })

        child.on('close', (code) => {
          if (code === 0) {
            displaySuccess('✅ ccstatusline setup completed successfully!')
            resolve(true)
          }
          else {
            displayError(`❌ ccstatusline setup failed with exit code ${code}`)
            resolve(false)
          }
        })

        child.on('error', (error) => {
          displayError(`❌ Failed to run ccstatusline setup: ${error.message}`)
          resolve(false)
        })
      })
    }
    catch (error) {
      displayError(`❌ Failed to start ccstatusline setup: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Check if ccstatusline config exists
   */
  hasStatusLineConfig(): boolean {
    return existsSync(this.CCSTATUSLINE_CONFIG_PATH)
  }

  /**
   * Read ccstatusline configuration
   */
  readStatusLineConfig(options: { verbose?: boolean } = {}): CCStatusLineConfig | null {
    try {
      if (!this.hasStatusLineConfig()) {
        displayVerbose('No ccstatusline config found', options.verbose)
        return null
      }

      displayVerbose(`Reading ccstatusline config from: ${this.CCSTATUSLINE_CONFIG_PATH}`, options.verbose)
      const content = readFileSync(this.CCSTATUSLINE_CONFIG_PATH, 'utf-8')
      const config = JSON.parse(content)
      displayVerbose('✅ ccstatusline config loaded successfully', options.verbose)
      return config
    }
    catch (error) {
      displayError(`❌ Failed to read ccstatusline config: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  /**
   * Write ccstatusline configuration
   */
  writeStatusLineConfig(config: CCStatusLineConfig, options: { verbose?: boolean } = {}): boolean {
    try {
      displayVerbose(`Writing ccstatusline config to: ${this.CCSTATUSLINE_CONFIG_PATH}`, options.verbose)

      // Ensure directory exists
      const configDir = join(homedir(), '.config', 'ccstatusline')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }

      writeFileSync(this.CCSTATUSLINE_CONFIG_PATH, JSON.stringify(config, null, 2))
      displayVerbose('✅ ccstatusline config written successfully', options.verbose)
      return true
    }
    catch (error) {
      displayError(`❌ Failed to write ccstatusline config: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Load Claude Code settings
   */
  async loadClaudeSettings(options: { verbose?: boolean } = {}): Promise<ClaudeCodeSettings> {
    try {
      if (!existsSync(this.CLAUDE_SETTINGS_PATH)) {
        displayVerbose('No Claude settings file found, creating default', options.verbose)
        return {}
      }

      displayVerbose(`Reading Claude settings from: ${this.CLAUDE_SETTINGS_PATH}`, options.verbose)
      const content = readFileSync(this.CLAUDE_SETTINGS_PATH, 'utf-8')
      const settings = JSON.parse(content)
      displayVerbose('✅ Claude settings loaded successfully', options.verbose)
      return settings
    }
    catch (error) {
      displayWarning(`⚠️ Failed to read Claude settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
      displayVerbose('Using default Claude settings', options.verbose)
      return {}
    }
  }

  /**
   * Save Claude Code settings
   */
  async saveClaudeSettings(settings: ClaudeCodeSettings, options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      displayVerbose(`Writing Claude settings to: ${this.CLAUDE_SETTINGS_PATH}`, options.verbose)

      // Ensure directory exists
      const settingsDir = join(homedir(), '.claude')
      if (!existsSync(settingsDir)) {
        mkdirSync(settingsDir, { recursive: true })
      }

      writeFileSync(this.CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
      displayVerbose('✅ Claude settings saved successfully', options.verbose)
      return true
    }
    catch (error) {
      displayError(`❌ Failed to save Claude settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Enable statusline in Claude Code settings
   */
  async enableStatusLineInClaude(options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      displayInfo('🔧 Configuring Claude Code statusline...')

      const settings = await this.loadClaudeSettings(options)

      // Update settings with our status line
      settings.statusLine = {
        type: 'command',
        command: 'npx -y ccstatusline@latest',
        padding: 0,
      }

      const success = await this.saveClaudeSettings(settings, options)
      if (success) {
        displaySuccess('✅ Claude Code statusline configuration updated!')
      }
      return success
    }
    catch (error) {
      displayError(`❌ Failed to enable statusline in Claude: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Disable statusline in Claude Code settings
   */
  async disableStatusLineInClaude(options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      displayInfo('🔧 Removing Claude Code statusline configuration...')

      const settings = await this.loadClaudeSettings(options)

      // Remove statusline configuration
      if (settings.statusLine) {
        delete settings.statusLine
        const success = await this.saveClaudeSettings(settings, options)
        if (success) {
          displaySuccess('✅ Claude Code statusline configuration removed!')
        }
        return success
      }
      else {
        displayInfo('ℹ️ No statusline configuration found in Claude settings')
        return true
      }
    }
    catch (error) {
      displayError(`❌ Failed to disable statusline in Claude: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Sync statusline config from ccstatusline to local if missing
   */
  async syncStatusLineConfig(ccstatuslineConfig: CCStatusLineConfig, options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      if (this.hasStatusLineConfig()) {
        displayVerbose('Local ccstatusline config already exists, skipping sync', options.verbose)
        return true
      }

      displayInfo('📥 Syncing statusline configuration to local ccstatusline...')
      return this.writeStatusLineConfig(ccstatuslineConfig, options)
    }
    catch (error) {
      displayError(`❌ Failed to sync statusline config: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }
}
