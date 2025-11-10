import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { getWindowsUserPath, isWSL } from '../system/path-utils'

export interface CloudStorageInfo {
  isAvailable: boolean
  isEnabled: boolean
  path?: string
  version?: string
  error?: string
}

export interface CloudStorageStatus {
  oneDrive: CloudStorageInfo
  iCloud: CloudStorageInfo
  windowsHost?: CloudStorageInfo // Available when running in WSL
}

/**
 * Detect if OneDrive is set up and enabled on the system
 */
export function detectOneDrive(): CloudStorageInfo {
  const isWindows = process.platform === 'win32'
  const isMacOS = process.platform === 'darwin'
  const isWSLEnv = isWSL()

  if (isWindows) {
    return detectOneDriveWindows()
  }
  else if (isMacOS) {
    return detectOneDriveMacOS()
  }
  else if (isWSLEnv) {
    // In WSL, check if OneDrive is available via Windows host
    return detectOneDriveWSL()
  }
  else {
    return {
      isAvailable: false,
      isEnabled: false,
      error: 'OneDrive is not supported on this platform',
    }
  }
}

/**
 * Detect OneDrive on Windows
 */
function detectOneDriveWindows(): CloudStorageInfo {
  try {
    // Check for OneDrive folder in user's profile
    const oneDrivePath = process.env.OneDrive || join(homedir(), 'OneDrive')

    // Check if OneDrive folder exists and is accessible
    if (existsSync(oneDrivePath)) {
      const stats = statSync(oneDrivePath)
      if (stats.isDirectory()) {
        // Check if OneDrive process is running by looking for common OneDrive files
        const oneDriveSettingsPath = join(oneDrivePath, '.849C9593-D756-4E56-8D6E-42412F2A707B')
        const hasOneDriveSettings = existsSync(oneDriveSettingsPath)

        // Check for OneDrive executable in Program Files
        const oneDriveExePaths = [
          'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe',
          'C:\\Program Files (x86)\\Microsoft OneDrive\\OneDrive.exe',
          join(process.env.LOCALAPPDATA || '', 'Microsoft', 'OneDrive', 'OneDrive.exe'),
        ]

        const hasOneDriveExecutable = oneDriveExePaths.some(path => existsSync(path))

        return {
          isAvailable: hasOneDriveExecutable,
          isEnabled: hasOneDriveSettings || hasOneDriveExecutable,
          path: oneDrivePath,
        }
      }
    }

    // Check registry or environment variables for OneDrive installation
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) {
      const oneDriveLocalPath = join(localAppData, 'Microsoft', 'OneDrive')
      if (existsSync(oneDriveLocalPath)) {
        return {
          isAvailable: true,
          isEnabled: false,
          path: oneDrivePath,
          error: 'OneDrive is installed but may not be configured',
        }
      }
    }

    return {
      isAvailable: false,
      isEnabled: false,
      error: 'OneDrive is not installed',
    }
  }
  catch (error) {
    return {
      isAvailable: false,
      isEnabled: false,
      error: `Error detecting OneDrive: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Detect OneDrive on macOS
 */
function detectOneDriveMacOS(): CloudStorageInfo {
  try {
    // Check for OneDrive app in Applications
    const oneDriveAppPaths = [
      '/Applications/OneDrive.app',
      join(homedir(), 'Applications', 'OneDrive.app'),
    ]

    const hasOneDriveApp = oneDriveAppPaths.some(path => existsSync(path))

    // Check for OneDrive folder in user's home directory
    // Include common variants and any directory starting with "OneDrive"
    const oneDrivePaths = [
      join(homedir(), 'OneDrive'),
      join(homedir(), 'OneDrive - Personal'),
      join(homedir(), 'OneDrive - Business'),
      ...(() => {
        try {
          return readdirSync(homedir(), { withFileTypes: true })
            .filter(d => d.isDirectory() && d.name.startsWith('OneDrive'))
            .map(d => join(homedir(), d.name))
        }
        catch {
          return [] as string[]
        }
      })(),
    ]

    let oneDrivePath: string | undefined
    let hasOneDriveFolder = false

    for (const path of oneDrivePaths) {
      if (existsSync(path)) {
        const stats = statSync(path)
        if (stats.isDirectory()) {
          hasOneDriveFolder = true
          oneDrivePath = path
          break
        }
      }
    }

    // Check for OneDrive configuration files
    const oneDriveConfigPaths = [
      join(homedir(), 'Library', 'Group Containers', 'UBF8T346G9.OneDriveSyncClientSuite'),
      join(homedir(), 'Library', 'Application Support', 'OneDrive'),
    ]

    const hasOneDriveConfig = oneDriveConfigPaths.some(path => existsSync(path))

    if (hasOneDriveApp || hasOneDriveFolder || hasOneDriveConfig) {
      return {
        isAvailable: hasOneDriveApp,
        isEnabled: hasOneDriveFolder || hasOneDriveConfig,
        path: oneDrivePath,
      }
    }

    return {
      isAvailable: false,
      isEnabled: false,
      error: 'OneDrive is not installed',
    }
  }
  catch (error) {
    return {
      isAvailable: false,
      isEnabled: false,
      error: `Error detecting OneDrive: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Detect OneDrive in WSL (via Windows host)
 */
function detectOneDriveWSL(): CloudStorageInfo {
  try {
    const windowsUserPath = getWindowsUserPath()
    if (!windowsUserPath) {
      return {
        isAvailable: false,
        isEnabled: false,
        error: 'Could not detect Windows user directory',
      }
    }

    // Check for OneDrive folder in Windows user directory
    const oneDrivePaths = [
      join(windowsUserPath, 'OneDrive'),
      join(windowsUserPath, 'OneDrive - Personal'),
      join(windowsUserPath, 'OneDrive - Business'),
    ]

    // Also try to find any directory starting with "OneDrive"
    try {
      const dirs = readdirSync(windowsUserPath, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('OneDrive'))
        .map(d => join(windowsUserPath, d.name))
      oneDrivePaths.push(...dirs)
    }
    catch {
      // If we can't read the directory, continue with the default paths
    }

    for (const path of oneDrivePaths) {
      if (existsSync(path)) {
        const stats = statSync(path)
        if (stats.isDirectory()) {
          return {
            isAvailable: true,
            isEnabled: true,
            path,
          }
        }
      }
    }

    return {
      isAvailable: false,
      isEnabled: false,
      error: 'OneDrive folder not found in Windows user directory',
    }
  }
  catch (error) {
    return {
      isAvailable: false,
      isEnabled: false,
      error: `Error detecting OneDrive in WSL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Detect if iCloud is set up and enabled on the system
 */
export function detectiCloud(): CloudStorageInfo {
  const isWindows = process.platform === 'win32'
  const isMacOS = process.platform === 'darwin'
  const isWSLEnv = isWSL()

  if (isMacOS) {
    return detectiCloudMacOS()
  }
  else if (isWindows) {
    return detectiCloudWindows()
  }
  else if (isWSLEnv) {
    // In WSL, check if iCloud is available via Windows host
    return detectiCloudWSL()
  }
  else {
    return {
      isAvailable: false,
      isEnabled: false,
      error: 'iCloud is not supported on this platform',
    }
  }
}

/**
 * Detect iCloud on macOS
 */
function detectiCloudMacOS(): CloudStorageInfo {
  try {
    // Check for iCloud Drive folder
    const iCloudPaths = [
      join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
      join(homedir(), 'iCloud Drive (Archive)'),
      join(homedir(), 'iCloud Drive'),
    ]

    let iCloudPath: string | undefined
    let hasiCloudFolder = false

    for (const path of iCloudPaths) {
      if (existsSync(path)) {
        const stats = statSync(path)
        if (stats.isDirectory()) {
          hasiCloudFolder = true
          iCloudPath = path
          break
        }
      }
    }

    // Check for iCloud configuration files
    const iCloudConfigPaths = [
      join(homedir(), 'Library', 'Application Support', 'CloudDocs'),
      join(homedir(), 'Library', 'Preferences', 'com.apple.bird.plist'),
    ]

    const hasiCloudConfig = iCloudConfigPaths.some(path => existsSync(path))

    // Check if iCloud Drive is enabled in System Preferences
    // This is a more reliable indicator on macOS
    const cloudDocsExists = existsSync(iCloudPaths[0]) // Check com~apple~CloudDocs path

    if (hasiCloudFolder || hasiCloudConfig || cloudDocsExists) {
      return {
        isAvailable: true,
        isEnabled: cloudDocsExists || hasiCloudFolder,
        path: iCloudPath || iCloudPaths[0], // Use first path (com~apple~CloudDocs) as fallback
      }
    }

    return {
      isAvailable: false,
      isEnabled: false,
      error: 'iCloud Drive is not enabled',
    }
  }
  catch (error) {
    return {
      isAvailable: false,
      isEnabled: false,
      error: `Error detecting iCloud: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Detect iCloud on Windows
 */
function detectiCloudWindows(): CloudStorageInfo {
  try {
    // Check for iCloud for Windows installation
    const iCloudPaths = [
      'C:\\Program Files\\Common Files\\Apple\\Internet Services\\iCloudServices.exe',
      'C:\\Program Files (x86)\\Common Files\\Apple\\Internet Services\\iCloudServices.exe',
    ]

    const hasiCloudApp = iCloudPaths.some(path => existsSync(path))

    // Check for iCloud Drive folder
    const iCloudDrivePaths = [
      join(homedir(), 'iCloudDrive'),
      join(homedir(), 'iCloud Drive'),
      process.env.iCloudDrive || '',
    ].filter(Boolean)

    let iCloudDrivePath: string | undefined
    let hasiCloudDriveFolder = false

    for (const path of iCloudDrivePaths) {
      if (existsSync(path)) {
        const stats = statSync(path)
        if (stats.isDirectory()) {
          hasiCloudDriveFolder = true
          iCloudDrivePath = path
          break
        }
      }
    }

    // Check for iCloud configuration in AppData
    const appData = process.env.APPDATA
    let hasiCloudConfig = false

    if (appData) {
      const iCloudConfigPaths = [
        join(appData, 'Apple Computer', 'MobileSync'),
        join(appData, 'Apple Computer', 'iCloud'),
      ]

      hasiCloudConfig = iCloudConfigPaths.some(path => existsSync(path))
    }

    if (hasiCloudApp || hasiCloudDriveFolder || hasiCloudConfig) {
      return {
        isAvailable: hasiCloudApp || hasiCloudDriveFolder, // Consider available if folder exists or app is installed
        isEnabled: hasiCloudDriveFolder || hasiCloudConfig,
        path: iCloudDrivePath,
      }
    }

    return {
      isAvailable: false,
      isEnabled: false,
      error: 'iCloud for Windows is not installed',
    }
  }
  catch (error) {
    return {
      isAvailable: false,
      isEnabled: false,
      error: `Error detecting iCloud: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Detect iCloud in WSL (via Windows host)
 */
function detectiCloudWSL(): CloudStorageInfo {
  try {
    const windowsUserPath = getWindowsUserPath()
    if (!windowsUserPath) {
      return {
        isAvailable: false,
        isEnabled: false,
        error: 'Could not detect Windows user directory',
      }
    }

    // Check for iCloud Drive folder in Windows user directory
    const iCloudDrivePaths = [
      join(windowsUserPath, 'iCloudDrive'),
      join(windowsUserPath, 'iCloud Drive'),
    ]

    for (const path of iCloudDrivePaths) {
      if (existsSync(path)) {
        const stats = statSync(path)
        if (stats.isDirectory()) {
          return {
            isAvailable: true,
            isEnabled: true,
            path,
          }
        }
      }
    }

    return {
      isAvailable: false,
      isEnabled: false,
      error: 'iCloud Drive folder not found in Windows user directory',
    }
  }
  catch (error) {
    return {
      isAvailable: false,
      isEnabled: false,
      error: `Error detecting iCloud in WSL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Detect Windows host config directory when running in WSL
 */
export function detectWindowsHostFromWSL(): CloudStorageInfo {
  if (!isWSL()) {
    return {
      isAvailable: false,
      isEnabled: false,
      error: 'Not running in WSL',
    }
  }

  try {
    const windowsUserPath = getWindowsUserPath()

    if (!windowsUserPath) {
      return {
        isAvailable: false,
        isEnabled: false,
        error: 'Could not detect Windows user directory',
      }
    }

    // Check for .start-claude config in Windows user home directory
    const windowsConfigDir = join(windowsUserPath, '.start-claude')
    const windowsConfigFile = join(windowsConfigDir, 'config.json')
    const windowsSyncFile = join(windowsConfigDir, 'sync.json')

    // First, check if Windows has cloud sync configured
    if (existsSync(windowsSyncFile)) {
      try {
        const syncData = readFileSync(windowsSyncFile, 'utf-8')
        const syncConfig = JSON.parse(syncData)

        // If Windows is using cloud sync (not local), don't offer wsl-host option
        // Instead, the WSL user should use the same cloud sync provider
        if (syncConfig.enabled && syncConfig.provider !== 'wsl-host') {
          return {
            isAvailable: false,
            isEnabled: false,
            path: windowsUserPath,
            error: `Windows is using ${syncConfig.provider} sync. Please use the same sync provider in WSL.`,
          }
        }
      }
      catch {
        // Invalid sync.json, continue checking for config.json
      }
    }

    // Check if Windows has a local config file (not using cloud sync)
    if (existsSync(windowsConfigFile)) {
      try {
        // Verify it's a valid config file
        const configData = readFileSync(windowsConfigFile, 'utf-8')
        const config = JSON.parse(configData)

        const hasValidConfig = config
          && typeof config.version === 'number'
          && Array.isArray(config.configs)

        if (hasValidConfig) {
          return {
            isAvailable: true,
            isEnabled: true,
            path: windowsUserPath,
          }
        }
        else {
          return {
            isAvailable: true,
            isEnabled: false,
            path: windowsUserPath,
            error: 'Windows config file exists but is invalid',
          }
        }
      }
      catch {
        return {
          isAvailable: true,
          isEnabled: false,
          path: windowsUserPath,
          error: 'Windows config file exists but could not be parsed',
        }
      }
    }

    // Windows user path exists but no config yet
    return {
      isAvailable: true,
      isEnabled: false,
      path: windowsUserPath,
      error: 'Windows user directory found but no config exists',
    }
  }
  catch (error) {
    return {
      isAvailable: false,
      isEnabled: false,
      error: `Error detecting Windows host: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Detect if Windows host is using cloud sync and return the sync config
 */
export interface WindowsSyncInfo {
  hasSync: boolean
  provider?: 'icloud' | 'onedrive' | 'custom' | 's3'
  cloudPath?: string
}

export function detectWindowsCloudSync(): WindowsSyncInfo {
  if (!isWSL()) {
    return { hasSync: false }
  }

  try {
    const windowsUserPath = getWindowsUserPath()
    if (!windowsUserPath) {
      return { hasSync: false }
    }

    const windowsSyncFile = join(windowsUserPath, '.start-claude', 'sync.json')

    if (existsSync(windowsSyncFile)) {
      try {
        const syncData = readFileSync(windowsSyncFile, 'utf-8')
        const syncConfig = JSON.parse(syncData)

        if (syncConfig.enabled && syncConfig.provider !== 'wsl-host') {
          return {
            hasSync: true,
            provider: syncConfig.provider,
            cloudPath: syncConfig.cloudPath || syncConfig.customPath,
          }
        }
      }
      catch {
        // Invalid sync.json
      }
    }

    return { hasSync: false }
  }
  catch {
    return { hasSync: false }
  }
}

/**
 * Get comprehensive cloud storage status for the system
 */
export function getCloudStorageStatus(): CloudStorageStatus {
  const status: CloudStorageStatus = {
    oneDrive: detectOneDrive(),
    iCloud: detectiCloud(),
  }

  // Add Windows host detection if running in WSL
  if (isWSL()) {
    status.windowsHost = detectWindowsHostFromWSL()
  }

  return status
}

/**
 * Get a list of available and enabled cloud storage services
 */
export function getAvailableCloudServices(): Array<{ name: string, path?: string, isEnabled: boolean }> {
  const status = getCloudStorageStatus()
  const services: Array<{ name: string, path?: string, isEnabled: boolean }> = []

  // Add Windows host first if running in WSL and config is available
  if (status.windowsHost && status.windowsHost.isEnabled) {
    services.push({
      name: 'Windows Host',
      path: status.windowsHost.path,
      isEnabled: status.windowsHost.isEnabled,
    })
  }

  if (status.oneDrive.isAvailable || status.oneDrive.isEnabled) {
    services.push({
      name: 'OneDrive',
      path: status.oneDrive.path,
      isEnabled: status.oneDrive.isEnabled,
    })
  }

  if (status.iCloud.isAvailable || status.iCloud.isEnabled) {
    services.push({
      name: 'iCloud',
      path: status.iCloud.path,
      isEnabled: status.iCloud.isEnabled,
    })
  }

  return services
}

export interface CloudStorageConfigInfo {
  provider: 'icloud' | 'onedrive' | 'wsl-host'
  path: string
  configPath: string
  hasValidConfig: boolean
}

/**
 * Detect existing cloud storage configurations that could be automatically synced
 */
export function detectExistingCloudStorageConfigs(): CloudStorageConfigInfo[] {
  const results: CloudStorageConfigInfo[] = []
  const cloudStatus = getCloudStorageStatus()

  // Check Windows host first if running in WSL
  if (cloudStatus.windowsHost && cloudStatus.windowsHost.isEnabled && cloudStatus.windowsHost.path) {
    const windowsConfigDir = join(cloudStatus.windowsHost.path, '.start-claude')
    const windowsConfigFile = join(windowsConfigDir, 'config.json')

    if (existsSync(windowsConfigFile)) {
      try {
        // Validate that it's a proper config file
        const configData = readFileSync(windowsConfigFile, 'utf-8')
        const config = JSON.parse(configData)

        // Basic validation - should have version and configs array
        const hasValidConfig = config
          && typeof config.version === 'number'
          && Array.isArray(config.configs)

        results.push({
          provider: 'wsl-host',
          path: cloudStatus.windowsHost.path,
          configPath: windowsConfigFile,
          hasValidConfig,
        })
      }
      catch {
        // Invalid JSON or other error - still report it but mark as invalid
        results.push({
          provider: 'wsl-host',
          path: cloudStatus.windowsHost.path,
          configPath: windowsConfigFile,
          hasValidConfig: false,
        })
      }
    }
  }

  // Check iCloud for existing config
  if (cloudStatus.iCloud.isEnabled && cloudStatus.iCloud.path) {
    const iCloudConfigDir = join(cloudStatus.iCloud.path, '.start-claude')
    const iCloudConfigFile = join(iCloudConfigDir, 'config.json')

    if (existsSync(iCloudConfigFile)) {
      try {
        // Validate that it's a proper config file
        const configData = readFileSync(iCloudConfigFile, 'utf-8')
        const config = JSON.parse(configData)

        // Basic validation - should have version and configs array
        const hasValidConfig = config
          && typeof config.version === 'number'
          && Array.isArray(config.configs)

        results.push({
          provider: 'icloud',
          path: cloudStatus.iCloud.path,
          configPath: iCloudConfigFile,
          hasValidConfig,
        })
      }
      catch {
        // Invalid JSON or other error - still report it but mark as invalid
        results.push({
          provider: 'icloud',
          path: cloudStatus.iCloud.path,
          configPath: iCloudConfigFile,
          hasValidConfig: false,
        })
      }
    }
  }

  // Check OneDrive for existing config
  if (cloudStatus.oneDrive.isEnabled && cloudStatus.oneDrive.path) {
    const oneDriveConfigDir = join(cloudStatus.oneDrive.path, '.start-claude')
    const oneDriveConfigFile = join(oneDriveConfigDir, 'config.json')

    if (existsSync(oneDriveConfigFile)) {
      try {
        // Validate that it's a proper config file
        const configData = readFileSync(oneDriveConfigFile, 'utf-8')
        const config = JSON.parse(configData)

        // Basic validation - should have version and configs array
        const hasValidConfig = config
          && typeof config.version === 'number'
          && Array.isArray(config.configs)

        results.push({
          provider: 'onedrive',
          path: cloudStatus.oneDrive.path,
          configPath: oneDriveConfigFile,
          hasValidConfig,
        })
      }
      catch {
        // Invalid JSON or other error - still report it but mark as invalid
        results.push({
          provider: 'onedrive',
          path: cloudStatus.oneDrive.path,
          configPath: oneDriveConfigFile,
          hasValidConfig: false,
        })
      }
    }
  }

  return results
}
