import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import inquirer from 'inquirer'
import { UILogger } from '../cli/ui'
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
      const logger = new UILogger(options.verbose)
      logger.displayInfo('🚀 Starting ccstatusline setup...')
      logger.displayVerbose('Running: npx ccstatusline@latest')

      return await new Promise((resolve) => {
        const child = spawn('npx', ['ccstatusline@latest'], {
          stdio: 'inherit',
          shell: true,
        })

        child.on('close', (code) => {
          if (code === 0) {
            logger.displaySuccess('✅ ccstatusline setup completed successfully!')
            resolve(true)
          }
          else {
            logger.displayError(`❌ ccstatusline setup failed with exit code ${code}`)
            resolve(false)
          }
        })

        child.on('error', (error) => {
          logger.displayError(`❌ Failed to run ccstatusline setup: ${error.message}`)
          resolve(false)
        })
      })
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`❌ Failed to start ccstatusline setup: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
      const logger = new UILogger(options.verbose)
      if (!this.hasStatusLineConfig()) {
        logger.displayVerbose('No ccstatusline config found')
        return null
      }

      logger.displayVerbose(`Reading ccstatusline config from: ${this.CCSTATUSLINE_CONFIG_PATH}`)
      const content = readFileSync(this.CCSTATUSLINE_CONFIG_PATH, 'utf-8')
      const config = JSON.parse(content)
      logger.displayVerbose('✅ ccstatusline config loaded successfully')
      return config
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`❌ Failed to read ccstatusline config: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  /**
   * Write ccstatusline configuration
   */
  writeStatusLineConfig(config: CCStatusLineConfig, options: { verbose?: boolean } = {}): boolean {
    try {
      const logger = new UILogger(options.verbose)
      logger.displayVerbose(`Writing ccstatusline config to: ${this.CCSTATUSLINE_CONFIG_PATH}`)

      // Ensure directory exists
      const configDir = join(homedir(), '.config', 'ccstatusline')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }

      writeFileSync(this.CCSTATUSLINE_CONFIG_PATH, JSON.stringify(config, null, 2))
      logger.displayVerbose('✅ ccstatusline config written successfully')
      return true
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`❌ Failed to write ccstatusline config: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Load Claude Code settings
   */
  async loadClaudeSettings(options: { verbose?: boolean } = {}): Promise<ClaudeCodeSettings> {
    try {
      const logger = new UILogger(options.verbose)
      if (!existsSync(this.CLAUDE_SETTINGS_PATH)) {
        logger.displayVerbose('No Claude settings file found, creating default')
        return {}
      }

      logger.displayVerbose(`Reading Claude settings from: ${this.CLAUDE_SETTINGS_PATH}`)
      const content = readFileSync(this.CLAUDE_SETTINGS_PATH, 'utf-8')
      const settings = JSON.parse(content)
      logger.displayVerbose('✅ Claude settings loaded successfully')
      return settings
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayWarning(`⚠️ Failed to read Claude settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.displayVerbose('Using default Claude settings')
      return {}
    }
  }

  /**
   * Save Claude Code settings
   */
  async saveClaudeSettings(settings: ClaudeCodeSettings, options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      const logger = new UILogger(options.verbose)
      logger.displayVerbose(`Writing Claude settings to: ${this.CLAUDE_SETTINGS_PATH}`)

      // Ensure directory exists
      const settingsDir = join(homedir(), '.claude')
      if (!existsSync(settingsDir)) {
        mkdirSync(settingsDir, { recursive: true })
      }

      writeFileSync(this.CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
      logger.displayVerbose('✅ Claude settings saved successfully')
      return true
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`❌ Failed to save Claude settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Enable statusline in Claude Code settings
   */
  async enableStatusLineInClaude(options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      const logger = new UILogger(options.verbose)
      logger.displayInfo('🔧 Configuring Claude Code statusline...')

      const settings = await this.loadClaudeSettings(options)

      // Update settings with our status line
      settings.statusLine = {
        type: 'command',
        command: 'npx -y ccstatusline@latest',
        padding: 0,
      }

      const success = await this.saveClaudeSettings(settings, options)
      if (success) {
        logger.displaySuccess('✅ Claude Code statusline configuration updated!')
      }
      return success
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`❌ Failed to enable statusline in Claude: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
      const logger = new UILogger(options.verbose)
      logger.displayVerbose(`Using cached decision: ${cachedDecision} existing Claude statusline config`)
      return cachedDecision
    }

    const logger = new UILogger()
    logger.displayWarning('⚠️ Claude Code already has a statusline configuration that differs from start-claude config.')
    logger.displayInfo('\nExisting Claude Code statusline config:')
    console.log(JSON.stringify(existingConfig, null, 2))
    logger.displayInfo('\nProposed start-claude statusline config:')
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
      const logger = new UILogger(options.verbose)
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
          logger.displayInfo('✅ Keeping existing Claude Code statusline configuration')
          return true
        }

        logger.displayInfo('🔄 Replacing Claude Code statusline configuration...')
      }
      else if (settings.statusLine) {
        logger.displayVerbose('Claude Code statusline config matches proposed config')
        return true
      }
      else {
        logger.displayVerbose('No existing Claude Code statusline config found, adding new config')
      }

      // Update settings with our status line
      settings.statusLine = proposedConfig

      const success = await this.saveClaudeSettings(settings, options)
      if (success) {
        logger.displaySuccess('✅ Claude Code statusline configuration updated!')
      }
      return success
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`❌ Failed to enable statusline in Claude: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Disable statusline in Claude Code settings
   */
  async disableStatusLineInClaude(options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      const logger = new UILogger(options.verbose)
      logger.displayInfo('🔧 Removing Claude Code statusline configuration...')

      const settings = await this.loadClaudeSettings(options)

      // Remove statusline configuration
      if (settings.statusLine) {
        delete settings.statusLine
        const success = await this.saveClaudeSettings(settings, options)
        if (success) {
          logger.displaySuccess('✅ Claude Code statusline configuration removed!')
        }
        return success
      }
      else {
        logger.displayInfo('ℹ️ No statusline configuration found in Claude settings')
        return true
      }
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`❌ Failed to disable statusline in Claude: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Sync statusline config from ccstatusline to local if missing
   */
  async syncStatusLineConfig(ccstatuslineConfig: CCStatusLineConfig, options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      const logger = new UILogger(options.verbose)
      let success = true

      // Sync ccstatusline config if missing
      if (!this.hasStatusLineConfig()) {
        logger.displayInfo('📥 Syncing statusline configuration to local ccstatusline...')
        success = this.writeStatusLineConfig(ccstatuslineConfig, options)
        if (!success) {
          return false
        }
      }
      else {
        logger.displayVerbose('Local ccstatusline config already exists, skipping ccstatusline sync')
      }

      // Ensure Claude Code settings are also configured with conflict detection
      logger.displayVerbose('Checking Claude Code statusline configuration...')
      success = await this.enableStatusLineInClaudeWithConflictCheck(options)

      return success
    }
    catch (error) {
      const logger = new UILogger()
      logger.displayError(`❌ Failed to sync statusline config: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }
}
