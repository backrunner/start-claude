import type { SyncConfig } from '../../sync/manager'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import inquirer from 'inquirer'
import { SyncManager } from '../../sync/manager'
import { UILogger } from '../cli/ui'
import { getWindowsHostActualConfigPath } from '../cloud-storage/detector'
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
 * Detect if both WSL local and Windows host configs exist with actual content
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
      hasLocalConfig: hasConfigContent(LOCAL_CONFIG_FILE),
      hasWindowsConfig: false,
      shouldPrompt: false,
    }
  }

  // Check for WSL local config with actual content
  const hasLocalConfigContent = hasConfigContent(LOCAL_CONFIG_FILE)

  // Check for Windows host config
  const windowsUserPath = getWindowsUserPath()
  if (!windowsUserPath) {
    return {
      hasLocalConfig: hasLocalConfigContent,
      hasWindowsConfig: false,
      shouldPrompt: false,
    }
  }

  const windowsConfigPath = join(windowsUserPath, '.start-claude', 'config.json')
  // Check if Windows config has actual content
  const hasWindowsConfigContent = hasConfigContent(windowsConfigPath)

  // Only prompt if BOTH have actual content
  const shouldPrompt = hasLocalConfigContent && hasWindowsConfigContent

  return {
    hasLocalConfig: hasLocalConfigContent,
    hasWindowsConfig: hasWindowsConfigContent,
    windowsConfigPath,
    shouldPrompt,
  }
}

/**
 * Validate that a config file is valid JSON and has the expected structure with actual content
 */
function isValidConfigFile(configPath: string): boolean {
  try {
    const content = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)

    // Valid config must have version, configs array, AND at least one config
    return (
      config
      && typeof config.version === 'number'
      && Array.isArray(config.configs)
      && config.configs.length > 0
    )
  }
  catch {
    return false
  }
}

/**
 * Check if a config file exists and has actual content
 */
function hasConfigContent(configPath: string): boolean {
  try {
    if (!existsSync(configPath)) {
      return false
    }
    const content = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    return Array.isArray(config.configs) && config.configs.length > 0
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
 * Get provider display name for user-friendly messages
 */
function getProviderDisplayName(provider: string): string {
  switch (provider) {
    case 'icloud':
      return 'iCloud Drive'
    case 'onedrive':
      return 'OneDrive'
    case 'wsl-host':
      return 'Windows Host'
    case 'custom':
      return 'Custom Folder'
    default:
      return provider
  }
}

/**
 * Handle WSL config detection and setup on startup
 * This handles two scenarios:
 * 1. Both WSL local and Windows have configs - prompt user to choose
 * 2. Only Windows has config (no local) - offer to auto-setup with Windows config
 */
export async function handleWSLConfigDetection(
  options: { verbose?: boolean } = {},
): Promise<void> {
  const ui = new UILogger(options.verbose)

  // Only run in WSL
  if (!isWSL()) {
    return
  }

  try {
    // Check if sync is already configured
    if (existsSync(SYNC_CONFIG_FILE)) {
      ui.verbose('WSL config detection: Sync already configured, skipping')
      return
    }

    // Detect configs
    const detection = detectWSLConfigs()

    // Scenario 1: Both have content - prompt user to choose
    if (detection.shouldPrompt) {
      ui.verbose('WSL config detection: Both local and Windows configs found with content')

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
      return
    }

    // Scenario 2: Only Windows has content, no local content - offer auto-setup
    if (!detection.hasLocalConfig && detection.hasWindowsConfig) {
      ui.verbose('WSL config detection: Only Windows has config content, offering auto-setup')

      // Get the actual Windows config path (considering Windows might be using cloud sync)
      const windowsActualConfig = getWindowsHostActualConfigPath()

      if (windowsActualConfig) {
        const providerName = windowsActualConfig.syncProvider
          ? getProviderDisplayName(windowsActualConfig.syncProvider)
          : 'Windows Host'

        ui.displayInfo('🪟 Running in WSL with no local configuration')
        ui.displayInfo(`📱 Found existing configuration from ${providerName}`)
        ui.displayInfo(`📂 Location: ${windowsActualConfig.configPath}`)

        // For WSL without local config, auto-setup with Windows host config by default
        const { autoSetup } = await inquirer.prompt([{
          type: 'confirm',
          name: 'autoSetup',
          message: `Would you like to use the ${providerName} configuration? (Recommended)`,
          default: true,
        }])

        if (autoSetup) {
          const syncManager = new SyncManager()

          // Determine the correct provider and path
          let provider: 'icloud' | 'onedrive' | 'wsl-host'
          let syncPath: string

          if (windowsActualConfig.syncProvider && windowsActualConfig.cloudPath) {
            // Windows is using cloud sync, WSL should use the same
            provider = windowsActualConfig.syncProvider as 'icloud' | 'onedrive' | 'wsl-host'
            syncPath = windowsActualConfig.cloudPath
          }
          else {
            // Windows is using local config, use wsl-host
            provider = 'wsl-host'
            const windowsUserPath = getWindowsUserPath()
            syncPath = windowsUserPath || ''
          }

          if (syncPath) {
            const success = await syncManager.autoSetupFromCloudConfig(
              provider,
              syncPath,
              windowsActualConfig.configPath,
            )

            if (success) {
              ui.displaySuccess('✅ Automatic sync setup completed successfully')
            }
            else {
              ui.verbose('❌ Automatic sync setup failed')
            }
          }
        }
        else {
          ui.verbose('ℹ️  Automatic sync setup skipped by user')
        }
      }
      return
    }

    ui.verbose('WSL config detection: No action needed')
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
