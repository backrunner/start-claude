import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import inquirer from 'inquirer'
import { displayError, displayInfo, displaySuccess, displayVerbose, displayWarning } from '../cli/ui'
import { CacheManager } from '../config/cache-manager'

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
  private static instance: StatusLineManager
  private readonly CCSTATUSLINE_CONFIG_PATH = join(homedir(), '.config', 'ccstatusline', 'settings.json')
  private readonly CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')
  private readonly cacheManager = CacheManager.getInstance()

  static getInstance(): StatusLineManager {
    if (!StatusLineManager.instance) {
      StatusLineManager.instance = new StatusLineManager()
    }
    return StatusLineManager.instance
  }

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
   * Compare two statusline configurations to check if they are different
   */
  private configsAreDifferent(config1: any, config2: any): boolean {
    return JSON.stringify(config1) !== JSON.stringify(config2)
  }

  /**
   * Prompt user about statusline config conflict and handle the response
   */
  private async handleStatusLineConfigConflict(
    existingConfig: any,
    proposedConfig: any,
    options: { verbose?: boolean } = {},
  ): Promise<'replace' | 'keep'> {
    // Check if we've already asked the user about this conflict
    const cachedDecision = this.cacheManager.getStatuslineConflictDecision(existingConfig, proposedConfig)
    if (cachedDecision) {
      displayVerbose(`Using cached decision: ${cachedDecision} existing Claude statusline config`, options.verbose)
      return cachedDecision
    }

    displayWarning('⚠️ Claude Code already has a statusline configuration that differs from start-claude config.')
    displayInfo('\nExisting Claude Code statusline config:')
    console.log(JSON.stringify(existingConfig, null, 2))
    displayInfo('\nProposed start-claude statusline config:')
    console.log(JSON.stringify(proposedConfig, null, 2))

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Replace with start-claude config', value: 'replace' },
          { name: 'Keep existing Claude Code config', value: 'keep' },
        ],
        default: 'keep',
      },
    ])

    const userChoice = answer.action as 'replace' | 'keep'

    // Cache the user's decision
    this.cacheManager.setStatuslineConflictDecision(existingConfig, proposedConfig, userChoice)

    return userChoice
  }

  /**
   * Enable statusline in Claude Code settings with conflict detection
   */
  async enableStatusLineInClaudeWithConflictCheck(options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      const settings = await this.loadClaudeSettings(options)
      const proposedConfig = {
        type: 'command',
        command: 'npx -y ccstatusline@latest',
        padding: 0,
      }

      // Check if statusline config already exists and is different
      if (settings.statusLine && this.configsAreDifferent(settings.statusLine, proposedConfig)) {
        const userChoice = await this.handleStatusLineConfigConflict(
          settings.statusLine,
          proposedConfig,
          options,
        )

        if (userChoice === 'keep') {
          displayInfo('✅ Keeping existing Claude Code statusline configuration')
          return true
        }

        displayInfo('🔄 Replacing Claude Code statusline configuration...')
      }
      else if (settings.statusLine) {
        displayVerbose('Claude Code statusline config matches proposed config', options.verbose)
        return true
      }
      else {
        displayVerbose('No existing Claude Code statusline config found, adding new config', options.verbose)
      }

      // Update settings with our status line
      settings.statusLine = proposedConfig

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
      let success = true

      // Sync ccstatusline config if missing
      if (!this.hasStatusLineConfig()) {
        displayInfo('📥 Syncing statusline configuration to local ccstatusline...')
        success = this.writeStatusLineConfig(ccstatuslineConfig, options)
        if (!success) {
          return false
        }
      }
      else {
        displayVerbose('Local ccstatusline config already exists, skipping ccstatusline sync', options.verbose)
      }

      // Ensure Claude Code settings are also configured with conflict detection
      displayVerbose('Checking Claude Code statusline configuration...', options.verbose)
      success = await this.enableStatusLineInClaudeWithConflictCheck(options)

      return success
    }
    catch (error) {
      displayError(`❌ Failed to sync statusline config: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }
}
