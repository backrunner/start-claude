import { UILogger } from '../../../utils/cli/ui'
import { CodexConfigManager } from '../../config/manager'

export async function handleCodexListCommand(): Promise<void> {
  const ui = new UILogger()
  const configManager = CodexConfigManager.getInstance()

  const configs = configManager.listConfigs()

  if (configs.length === 0) {
    ui.displayWarning('No Codex configurations found')
    ui.displayInfo('\nAdd a configuration with: start-codex add')
    return
  }

  // Sort by order (ascending)
  const sortedConfigs = configs.sort((a, b) => (a.order || 0) - (b.order || 0))

  // Display configurations using simple formatting
  ui.displayInfo('\nCodex Configurations:')
  ui.displayInfo('─'.repeat(100))

  sortedConfigs.forEach((config) => {
    const status = config.isDefault ? '[DEFAULT]' : ''
    const enabled = config.enabled ? '✓' : '✗'
    const apiKeyDisplay = config.apiKey ? `••••••${config.apiKey.slice(-4)}` : '-'

    console.log(`\n${status} ${config.name}`)
    console.log(`  API Key: ${apiKeyDisplay}`)
    if (config.baseUrl) {
      console.log(`  Base URL: ${config.baseUrl}`)
    }
    if (config.model) {
      console.log(`  Model: ${config.model}`)
    }
    console.log(`  Enabled: ${enabled}`)
  })

  console.log(`\n${'─'.repeat(100)}`)

  // Show default config info
  const defaultConfig = configManager.getDefaultConfig()
  if (defaultConfig) {
    ui.displayInfo(`\nDefault configuration: ${defaultConfig.name}`)
  }
  else {
    ui.displayWarning('\nNo default configuration set')
    ui.displayInfo('Set a default with: start-codex set <name>')
  }
}
