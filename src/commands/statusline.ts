import { ConfigManager } from '../config/manager'
import { displayError, displayInfo, displaySuccess, displayVerbose, displayWelcome } from '../utils/cli/ui'
import { StatusLineManager } from '../utils/statusline/manager'

/**
 * Handle statusline setup command
 */
export async function handleStatusLineSetupCommand(options: { verbose?: boolean } = {}): Promise<void> {
  displayWelcome()

  const configManager = ConfigManager.getInstance()
  const statusLineManager = new StatusLineManager()

  try {
    displayInfo('🛠️ Setting up ccstatusline integration...')

    // Run ccstatusline setup
    const setupSuccess = await statusLineManager.runStatusLineSetup(options)
    if (!setupSuccess) {
      displayError('❌ ccstatusline setup failed')
      return
    }

    // Check if ccstatusline config was created
    displayVerbose('Checking for ccstatusline configuration...', options.verbose)
    const ccstatuslineConfig = statusLineManager.readStatusLineConfig(options)

    if (!ccstatuslineConfig) {
      displayError('❌ ccstatusline configuration not found after setup')
      return
    }

    displaySuccess('✅ ccstatusline configuration detected!')
    displayVerbose(`ccstatusline config: ${JSON.stringify(ccstatuslineConfig, null, 2)}`, options.verbose)

    // Save to start-claude config
    displayInfo('💾 Saving statusline configuration to start-claude...')
    configManager.updateSettings({
      statusLine: {
        enabled: true,
        config: ccstatuslineConfig,
      },
    })

    // Enable in Claude Code settings
    await statusLineManager.enableStatusLineInClaude(options)

    displaySuccess('🎉 Statusline setup completed successfully!')
    displayInfo('💡 The statusline will now be available in Claude Code')
    displayInfo('💡 To disable: start-claude statusline disable')
  }
  catch (error) {
    displayError(`❌ Failed to setup statusline: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Handle statusline disable command
 */
export async function handleStatusLineDisableCommand(options: { verbose?: boolean } = {}): Promise<void> {
  displayWelcome()

  const configManager = ConfigManager.getInstance()
  const statusLineManager = new StatusLineManager()

  try {
    displayInfo('🔧 Disabling statusline integration...')

    // Update start-claude config
    configManager.updateSettings({
      statusLine: {
        enabled: false,
      },
    })

    // Remove from Claude Code settings
    await statusLineManager.disableStatusLineInClaude(options)

    displaySuccess('✅ Statusline integration disabled successfully!')
    displayInfo('💡 To re-enable: start-claude setup statusline')
  }
  catch (error) {
    displayError(`❌ Failed to disable statusline: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Handle statusline status command
 */
export async function handleStatusLineStatusCommand(options: { verbose?: boolean } = {}): Promise<void> {
  displayWelcome()

  const configManager = ConfigManager.getInstance()
  const statusLineManager = new StatusLineManager()

  try {
    const settings = configManager.getSettings()
    const statusLine = settings.statusLine

    displayInfo('📊 Statusline Integration Status:')

    if (!statusLine || !statusLine.enabled) {
      displayInfo('   Status: ❌ Disabled')
      displayInfo('   To enable: start-claude setup statusline')
      return
    }

    displayInfo('   Status: ✅ Enabled')

    // Check local ccstatusline config
    const hasLocalConfig = statusLineManager.hasStatusLineConfig()
    displayInfo(`   Local ccstatusline config: ${hasLocalConfig ? '✅ Found' : '❌ Missing'}`)

    // Check Claude settings
    const claudeSettings = await statusLineManager.loadClaudeSettings(options)
    const hasClaudeConfig = !!claudeSettings.statusLine
    displayInfo(`   Claude Code integration: ${hasClaudeConfig ? '✅ Configured' : '❌ Missing'}`)

    if (statusLine.config && options.verbose) {
      displayVerbose('Stored statusline config:', options.verbose)
      displayVerbose(JSON.stringify(statusLine.config, null, 2), options.verbose)
    }
  }
  catch (error) {
    displayError(`❌ Failed to check statusline status: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
