import inquirer from 'inquirer'
import { OverrideManager } from '../cli/override'
import { ConfigManager } from '../core/config'
import { displayError, displayInfo, displaySuccess, displayWarning, displayWelcome } from '../utils/ui'

export async function handleOverrideCommand(): Promise<void> {
  displayWelcome()

  const configManager = new ConfigManager()
  const overrideManager = new OverrideManager()

  const shellInfo = overrideManager.getShellInfo()
  const isActive = overrideManager.isOverrideActive()

  displayInfo(`Detected shell: ${shellInfo.shell || 'Unknown'}`)
  displayInfo(`Platform: ${shellInfo.platform}`)
  if (shellInfo.configFile) {
    displayInfo(`Config file: ${shellInfo.configFile}`)
  }
  if (shellInfo.instructions) {
    displayWarning(shellInfo.instructions)
  }

  const choices = [
    { name: `${isActive ? 'Disable' : 'Enable'} Claude command override`, value: 'toggle' },
    { name: 'View current status', value: 'view' },
    { name: 'Show supported shells', value: 'shells' },
  ]

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices,
    },
  ])

  if (answers.action === 'toggle') {
    if (isActive) {
      // Disable override
      const success = overrideManager.disableOverride()
      if (success) {
        displaySuccess('Claude command override disabled')
        displayInfo('The original "claude" command will be used')

        // Update settings
        configManager.updateSettings({ overrideClaudeCommand: false })
      }
      else {
        displayError('Failed to disable Claude command override')
      }
    }
    else {
      // Enable override
      const success = overrideManager.enableOverride()
      if (success) {
        displaySuccess('Claude command override enabled')
        displayInfo('You can now use "claude" to run start-claude')

        if (shellInfo.platform === 'windows') {
          if (shellInfo.shell === 'powershell') {
            displayWarning('Note: You may need to restart PowerShell for changes to take effect')
            displayInfo('If you get execution policy errors, run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser')
          }
          else if (shellInfo.shell === 'cmd') {
            displayWarning('Note: For Command Prompt, make sure the alias file directory is in your PATH')
          }
          else {
            displayWarning('Note: You may need to restart your shell for changes to take effect')
          }
        }
        else {
          displayWarning('Note: You may need to restart your shell or run "source ~/.bashrc" (or equivalent) for changes to take effect')
        }

        // Update settings
        configManager.updateSettings({ overrideClaudeCommand: true })
      }
      else {
        displayError('Failed to enable Claude command override')
        if (!shellInfo.shell) {
          displayError('Could not detect your shell. This feature may not be supported on your system.')
        }
      }
    }
  }
  else if (answers.action === 'view') {
    displayInfo(`Claude command override is currently ${isActive ? 'enabled' : 'disabled'}`)
    if (isActive && shellInfo.configFile) {
      displayInfo(`Override configured in: ${shellInfo.configFile}`)
    }
  }
  else if (answers.action === 'shells') {
    const supportedShells = overrideManager.getSupportedShells()
    displayInfo(`Supported shells on ${shellInfo.platform}:`)
    supportedShells.forEach((shell) => {
      displayInfo(`  - ${shell}`)
    })
  }
}
