import type { SyncConfig } from '../../sync/manager'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import inquirer from 'inquirer'
import { SyncManager } from '../../sync/manager'
import { UILogger } from '../cli/ui'
import { getWindowsUserPath, isWSL } from '../system/path-utils'

const CONFIG_DIR = join(homedir(), '.start-claude')
const LOCAL_CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const SYNC_CONFIG_FILE = join(CONFIG_DIR, 'sync.json')

export interface WSLConfigDetectionResult {
  hasLocalConfig: boolean
  hasWindowsConfig: boolean
  windowsConfigPath?: string
  shouldPrompt: boolean
}

/**
 * Detect if both WSL local and Windows host configs exist
 */
export function detectWSLConfigs(): WSLConfigDetectionResult {
  // Only run in WSL
  if (!isWSL()) {
    return {
      hasLocalConfig: false,
      hasWindowsConfig: false,
      shouldPrompt: false,
    }
  }

  // Check if sync is already configured
  if (existsSync(SYNC_CONFIG_FILE)) {
    // Sync already configured, no need to prompt
    return {
      hasLocalConfig: existsSync(LOCAL_CONFIG_FILE),
      hasWindowsConfig: false,
      shouldPrompt: false,
    }
  }

  // Check for WSL local config
  const hasLocalConfig = existsSync(LOCAL_CONFIG_FILE)

  // Check for Windows host config
  const windowsUserPath = getWindowsUserPath()
  if (!windowsUserPath) {
    return {
      hasLocalConfig,
      hasWindowsConfig: false,
      shouldPrompt: false,
    }
  }

  const windowsConfigPath = join(windowsUserPath, '.start-claude', 'config.json')
  const hasWindowsConfig = existsSync(windowsConfigPath)

  // Only prompt if BOTH exist
  const shouldPrompt = hasLocalConfig && hasWindowsConfig

  return {
    hasLocalConfig,
    hasWindowsConfig,
    windowsConfigPath,
    shouldPrompt,
  }
}

/**
 * Validate that a config file is valid JSON and has the expected structure
 */
function isValidConfigFile(configPath: string): boolean {
  try {
    const content = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)

    // Basic validation - should have version and configs array
    return (
      config
      && typeof config.version === 'number'
      && Array.isArray(config.configs)
    )
  }
  catch {
    return false
  }
}

/**
 * Get config file info for display
 */
function getConfigInfo(configPath: string): string {
  try {
    if (!existsSync(configPath)) {
      return 'Not found'
    }

    if (!isValidConfigFile(configPath)) {
      return 'Invalid config file'
    }

    const content = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    const configCount = config.configs?.length || 0

    return `${configCount} configuration${configCount !== 1 ? 's' : ''}`
  }
  catch {
    return 'Error reading file'
  }
}

/**
 * Prompt user to choose between WSL local or Windows host config
 */
export async function promptWSLConfigChoice(
  detection: WSLConfigDetectionResult,
): Promise<'local' | 'windows' | null> {
  const ui = new UILogger()

  ui.displayInfo('\n🪟 WSL Configuration Detected')
  ui.displayInfo('Found configuration files in both WSL and Windows host.')
  ui.displayInfo('')

  // Display info about both configs
  ui.displayInfo(`WSL local config:     ${getConfigInfo(LOCAL_CONFIG_FILE)}`)
  if (detection.windowsConfigPath) {
    ui.displayInfo(`Windows host config:  ${getConfigInfo(detection.windowsConfigPath)}`)
  }
  ui.displayInfo('')

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Which configuration would you like to use?',
      choices: [
        {
          name: '🪟 Windows Host - Use Windows config (recommended for shared setup)',
          value: 'windows',
        },
        {
          name: '🐧 WSL Local - Use WSL-only config (independent setup)',
          value: 'local',
        },
        {
          name: '❌ Skip - I will configure this later',
          value: 'skip',
        },
      ],
    },
  ])

  if (choice === 'skip') {
    ui.displayInfo('\nℹ️  You can configure sync later with: start-claude sync setup')
    return null
  }

  return choice
}

/**
 * Handle WSL config detection and setup on startup
 */
export async function handleWSLConfigDetection(
  options: { verbose?: boolean } = {},
): Promise<void> {
  const ui = new UILogger(options.verbose)

  try {
    // Detect configs
    const detection = detectWSLConfigs()

    // If no prompt needed, return early
    if (!detection.shouldPrompt) {
      ui.verbose('WSL config detection: No prompt needed')
      return
    }

    ui.verbose('WSL config detection: Both local and Windows configs found')

    // Prompt user for choice
    const choice = await promptWSLConfigChoice(detection)

    if (!choice) {
      // User skipped, no action needed
      return
    }

    const syncManager = new SyncManager()

    if (choice === 'windows') {
      // Configure wsl-host sync
      const windowsUserPath = getWindowsUserPath()
      if (!windowsUserPath || !detection.windowsConfigPath) {
        ui.displayError('❌ Failed to detect Windows user directory')
        return
      }

      ui.displayInfo('\n🔄 Configuring Windows host sync...')

      const syncConfig: SyncConfig = {
        enabled: true,
        provider: 'wsl-host',
        cloudPath: windowsUserPath,
        linkedAt: new Date().toISOString(),
      }

      syncManager.saveSyncConfig(syncConfig)

      ui.displaySuccess('✅ Successfully configured Windows host sync!')
      ui.displayInfo(`📂 Config path: ${detection.windowsConfigPath}`)
      ui.displayInfo(`🔗 WSL will now use Windows host configuration`)
      ui.displayInfo('\n💡 Changes in Windows will be reflected in WSL automatically\n')
    }
    else if (choice === 'local') {
      // User chose local - create a marker to prevent future prompts
      // We do this by creating a sync.json with disabled status
      ui.displayInfo('\n🐧 Using WSL local configuration...')

      const syncConfig: SyncConfig = {
        enabled: false,
        provider: 'custom', // Use custom as placeholder
        linkedAt: new Date().toISOString(),
      }

      syncManager.saveSyncConfig(syncConfig)

      ui.displaySuccess('✅ WSL will use local configuration')
      ui.displayInfo(`📂 Config path: ${LOCAL_CONFIG_FILE}`)
      ui.displayInfo('\n💡 You can enable sync later with: start-claude sync setup\n')
    }
  }
  catch (error) {
    // Don't fail the entire startup for config detection issues
    ui.verbose(
      `⚠️ WSL config detection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Check if WSL config detection should run
 * This is used to avoid prompting on every command
 */
export function shouldRunWSLConfigDetection(): boolean {
  // Only run in WSL
  if (!isWSL()) {
    return false
  }

  // Don't run if sync.json already exists (choice already made)
  if (existsSync(SYNC_CONFIG_FILE)) {
    return false
  }

  // Check if both configs exist
  const detection = detectWSLConfigs()
  return detection.shouldPrompt
}
