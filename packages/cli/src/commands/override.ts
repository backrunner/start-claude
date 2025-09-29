import boxen from 'boxen'
import chalk from 'chalk'
import { OverrideManager } from '../cli/override'
import { ConfigManager } from '../config/manager'
import { UILogger } from '../utils/cli/ui'

export async function handleOverrideCommand(): Promise<void> {
  const ui = new UILogger()
  ui.displayWelcome()

  const configManager = ConfigManager.getInstance()
  const overrideManager = OverrideManager.getInstance()

  const shellInfo = overrideManager.getShellInfo()
  const isActive = overrideManager.isOverrideActive()

  ui.displayInfo(`Detected shell: ${shellInfo.shell || 'Unknown'}`)
  ui.displayInfo(`Platform: ${shellInfo.platform}`)
  if (shellInfo.configFile) {
    ui.displayInfo(`Config file: ${shellInfo.configFile}`)
  }
  if (shellInfo.instructions) {
    ui.displayWarning(shellInfo.instructions)
  }

  if (isActive) {
    ui.displayInfo('Claude command override is already enabled')
    ui.displayInfo('Use "start-claude override disable" to disable it')
    return
  }

  // Enable override directly
  const success = overrideManager.enableOverride()
  if (success) {
    ui.displaySuccess('Claude command override enabled')
    ui.displayInfo('You can now use "claude" to run start-claude')

    if (shellInfo.platform === 'windows') {
      if (shellInfo.shell === 'powershell') {
        ui.displayWarning('Note: You may need to restart PowerShell for changes to take effect')
        ui.displayInfo('If you get execution policy errors, run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser')
      }
      else if (shellInfo.shell === 'cmd') {
        ui.displayWarning('Note: For Command Prompt, make sure the alias file directory is in your PATH')
      }
      else {
        ui.displayWarning('Note: You may need to restart your shell for changes to take effect')
      }
    }
    else {
      const sourceCommand = shellInfo.shell === 'zsh'
        ? 'source ~/.zshrc'
        : shellInfo.shell === 'fish'
          ? 'source ~/.config/fish/config.fish'
          : 'source ~/.bashrc'
      ui.displayWarning(`Note: You may need to restart your shell or run "${sourceCommand}" for changes to take effect`)
    }

    // Update settings
    await configManager.updateSettings({ overrideClaudeCommand: true })
  }
  else {
    ui.displayError('Failed to enable Claude command override')
    if (!shellInfo.shell) {
      ui.displayError('Could not detect your shell. This feature may not be supported on your system.')
    }
  }
}

export async function handleOverrideDisableCommand(): Promise<void> {
  const ui = new UILogger()
  ui.displayWelcome()

  const configManager = ConfigManager.getInstance()
  const overrideManager = OverrideManager.getInstance()

  const isActive = overrideManager.isOverrideActive()

  if (!isActive) {
    ui.displayInfo('Claude command override is already disabled')
    return
  }

  const result = overrideManager.disableOverride()
  if (result.success) {
    ui.displaySuccess('Claude command override disabled')
    ui.displayInfo('The original "claude" command will be used')

    const shellInfo = overrideManager.getShellInfo()
    if (shellInfo.platform !== 'windows' && result.cleanupCommand) {
      console.log(boxen(chalk.gray(result.cleanupCommand), {
        title: 'Immediate cleanup (optional)',
        titleAlignment: 'left',
        padding: 1,
        borderStyle: 'round',
        borderColor: 'gray',
      }))
      ui.displayWarning('Note: The disable will take effect after restarting your terminal')
    }

    // Update settings
    await configManager.updateSettings({ overrideClaudeCommand: false })
  }
  else {
    ui.displayError('Failed to disable Claude command override')
  }
}

export async function handleOverrideStatusCommand(): Promise<void> {
  const ui = new UILogger()
  ui.displayWelcome()

  const overrideManager = OverrideManager.getInstance()
  const shellInfo = overrideManager.getShellInfo()
  const isActive = overrideManager.isOverrideActive()

  ui.displayInfo(`Detected shell: ${shellInfo.shell || 'Unknown'}`)
  ui.displayInfo(`Platform: ${shellInfo.platform}`)
  if (shellInfo.configFile) {
    ui.displayInfo(`Config file: ${shellInfo.configFile}`)
  }
  ui.displayInfo(`Claude command override is currently ${isActive ? 'enabled' : 'disabled'}`)
  if (isActive && shellInfo.configFile) {
    ui.displayInfo(`Override configured in: ${shellInfo.configFile}`)
  }
}

export async function handleOverrideShellsCommand(): Promise<void> {
  const ui = new UILogger()
  ui.displayWelcome()

  const overrideManager = OverrideManager.getInstance()
  const shellInfo = overrideManager.getShellInfo()
  const supportedShells = overrideManager.getSupportedShells()

  ui.displayInfo(`Supported shells on ${shellInfo.platform}:`)
  supportedShells.forEach((shell) => {
    ui.displayInfo(`  - ${shell}`)
  })
}
