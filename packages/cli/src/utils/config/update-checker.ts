import type { Buffer } from 'node:buffer'
import { exec, execSync, spawn } from 'node:child_process'
import { accessSync, constants, createWriteStream, mkdirSync, rmSync } from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { extract } from 'tar'
import { version } from '../../../package.json'
import { isGlobalNodePath } from '../system/path-utils'
import { CacheManager } from './cache-manager'

// Get the current file path using import.meta.url for bundled code
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  updateCommand: string
}

/**
 * Check if a version is a prerelease (contains beta, alpha, rc, etc.)
 */
function isPrereleaseVersion(version: string): boolean {
  return version.includes('-') || version.includes('beta') || version.includes('alpha') || version.includes('rc')
}

/**
 * Fetch latest stable (non-prerelease) version from npm registry via HTTP
 * Much faster than spawning pnpm subprocess
 * Filters out beta, alpha, and other prerelease versions
 */
async function fetchLatestVersionFromNpm(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = 3000 // Reduced to 3 seconds

    // Fetch full package metadata to access all versions
    const req = https.get('https://registry.npmjs.org/start-claude', {
      timeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'start-claude-cli',
      },
    }, (res: any) => {
      let data = ''

      res.on('data', (chunk: Buffer) => {
        data += chunk.toString()
      })

      res.on('end', () => {
        try {
          const pkg = JSON.parse(data)

          // Get the latest dist-tag first as a fallback
          const latestTagVersion = pkg['dist-tags']?.latest

          // Check if the latest tag version is a prerelease
          if (latestTagVersion && !isPrereleaseVersion(latestTagVersion)) {
            resolve(latestTagVersion)
            return
          }

          // If latest tag is a prerelease, find the newest stable version
          // Get all versions and filter out prereleases
          const allVersions = Object.keys(pkg.versions || {})
          const stableVersions = allVersions.filter(v => !isPrereleaseVersion(v))

          if (stableVersions.length === 0) {
            reject(new Error('No stable versions found'))
            return
          }

          // Sort versions and get the latest stable one
          stableVersions.sort((a, b) => compareVersions(a, b))
          const latestStable = stableVersions[stableVersions.length - 1]

          resolve(latestStable)
        }
        catch {
          reject(new Error('Failed to parse npm registry response'))
        }
      })
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.on('error', (error: Error) => {
      reject(error)
    })
  })
}

export async function checkForUpdates(forceCheck = false): Promise<UpdateInfo | null> {
  try {
    const cache = CacheManager.getInstance()

    // Check if we should skip the update check based on last check time
    if (!forceCheck && !cache.shouldCheckForUpdates()) {
      return null
    }

    // Use HTTP request instead of spawning pnpm subprocess
    const latestVersion = await fetchLatestVersionFromNpm()

    const hasUpdate = compareVersions(version, latestVersion) < 0

    // Update the last check timestamp
    cache.setUpdateCheckTimestamp(Date.now(), version)

    return {
      currentVersion: version,
      latestVersion,
      hasUpdate,
      updateCommand: 'pnpm add -g start-claude@latest',
    }
  }
  catch {
    // Silently fail if update check fails (network issues, etc.)
    return null
  }
}

function compareVersions(current: string, latest: string): number {
  // Split version into main version and prerelease parts
  // e.g., "1.2.3-beta.1" -> ["1.2.3", "beta.1"]
  const [currentMain, currentPre] = current.split('-')
  const [latestMain, latestPre] = latest.split('-')

  // Compare main version numbers (e.g., "1.2.3")
  const currentParts = currentMain.split('.').map(Number)
  const latestParts = latestMain.split('.').map(Number)

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0
    const latestPart = latestParts[i] || 0

    if (currentPart < latestPart)
      return -1
    if (currentPart > latestPart)
      return 1
  }

  // If main versions are equal, check prerelease
  // A version with prerelease (e.g., 1.2.3-beta) is LESS than without (e.g., 1.2.3)
  if (currentPre && !latestPre) {
    return -1 // current is prerelease, latest is stable -> current < latest
  }
  if (!currentPre && latestPre) {
    return 1 // current is stable, latest is prerelease -> current > latest
  }

  // Both are prereleases or both are stable
  return 0
}

export interface UpdateResult {
  success: boolean
  error?: string
  usedSudo?: boolean
  method?: 'silent-upgrade' | 'package-manager'
  shouldRetryWithPackageManager?: boolean
}

/**
 * Get the global installation path for start-claude
 * Uses import.meta.url to work correctly with bundled code
 * Returns null if not running from a global installation
 */
function getGlobalInstallPath(): string | null {
  try {
    // Start from the current file location (bundled CLI in bin/ directory)
    let currentPath = __dirname

    // Walk up the directory tree to find the start-claude package root
    // After bundling, __dirname will be in bin/ or similar, and we need to find the package root
    while (currentPath !== path.dirname(currentPath)) {
      // Check if this directory looks like the start-claude package root
      // It should have package.json with name "start-claude"
      const packageJsonPath = path.join(currentPath, 'package.json')
      try {
        accessSync(packageJsonPath, constants.F_OK)
        // Found package.json, verify it's start-claude
        // We can't use require here since we're bundled, so just check the directory structure
        // If we find package.json and we're in a node_modules path, assume it's correct
        // Use path.normalize to ensure consistent path separators
        const normalizedPath = path.normalize(currentPath)
        const nodeModulesPattern = path.normalize(path.join('node_modules', 'start-claude'))

        if (normalizedPath.includes(nodeModulesPattern)) {
          return currentPath
        }

        // Check if the current directory is named "start-claude" and parent is "node_modules"
        if (path.basename(currentPath) === 'start-claude') {
          const parentDir = path.dirname(currentPath)
          if (path.basename(parentDir) === 'node_modules') {
            return currentPath
          }
        }
      }
      catch {
        // Continue searching
      }

      currentPath = path.dirname(currentPath)
    }

    // Fallback: check if we're in a global node path
    if (isGlobalNodePath(__filename)) {
      // Walk up from __filename to find node_modules/start-claude
      currentPath = path.dirname(__filename)
      while (currentPath !== path.dirname(currentPath)) {
        const modulePath = path.join(currentPath, 'node_modules', 'start-claude')
        try {
          accessSync(modulePath, constants.F_OK)
          return modulePath
        }
        catch {
          // Continue searching
        }

        // Check if we're directly in start-claude directory
        if (path.basename(currentPath) === 'start-claude') {
          const parentDir = path.dirname(currentPath)
          if (path.basename(parentDir) === 'node_modules') {
            return currentPath
          }
        }

        currentPath = path.dirname(currentPath)
      }
    }
  }
  catch {
    // Silently fail
  }

  return null
}

/**
 * Check if we have write permissions to a directory
 */
function hasWritePermission(dirPath: string): boolean {
  try {
    accessSync(dirPath, constants.W_OK)
    return true
  }
  catch {
    return false
  }
}

/**
 * Detect package manager to use for updates
 */
function detectPackageManager(): 'pnpm' | 'npm' | 'yarn' {
  try {
    execSync('pnpm --version', { stdio: 'ignore' })
    return 'pnpm'
  }
  catch {
    // pnpm not available
  }

  try {
    execSync('yarn --version', { stdio: 'ignore' })
    return 'yarn'
  }
  catch {
    // yarn not available
  }

  return 'npm' // Fallback to npm
}

/**
 * Download a specific version of start-claude tarball from npm
 * Only downloads stable (non-prerelease) versions
 */
async function downloadLatestTarball(destPath: string, version?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = 30000 // 30 seconds

    // Fetch full package metadata to get tarball URL for specific version
    https.get('https://registry.npmjs.org/start-claude', {
      timeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'start-claude-cli',
      },
    }, (res: any) => {
      let data = ''

      res.on('data', (chunk: Buffer) => {
        data += chunk.toString()
      })

      res.on('end', () => {
        try {
          const pkg = JSON.parse(data)

          // Determine which version to download
          let targetVersion = version
          if (!targetVersion) {
            // Get the latest stable version
            const latestTagVersion = pkg['dist-tags']?.latest

            // Check if latest is stable
            if (latestTagVersion && !isPrereleaseVersion(latestTagVersion)) {
              targetVersion = latestTagVersion
            }
            else {
              // Find newest stable version from all versions
              const allVersions = Object.keys(pkg.versions || {})
              const stableVersions = allVersions.filter(v => !isPrereleaseVersion(v))

              if (stableVersions.length === 0) {
                reject(new Error('No stable versions available'))
                return
              }

              stableVersions.sort((a, b) => compareVersions(a, b))
              targetVersion = stableVersions[stableVersions.length - 1]
            }
          }

          // At this point, targetVersion must be defined
          if (!targetVersion) {
            reject(new Error('Could not determine target version'))
            return
          }

          // Verify target version is not a prerelease
          if (isPrereleaseVersion(targetVersion)) {
            reject(new Error(`Cannot download prerelease version: ${targetVersion}`))
            return
          }

          // Get tarball URL for specific version
          const versionData = pkg.versions?.[targetVersion]
          const tarballUrl = versionData?.dist?.tarball

          if (!tarballUrl) {
            reject(new Error(`No tarball URL found for version ${targetVersion}`))
            return
          }

          // Download the tarball
          https.get(tarballUrl, {
            timeout,
            headers: {
              'User-Agent': 'start-claude-cli',
            },
          }, (tarRes: any) => {
            const fileStream = createWriteStream(destPath)

            pipeline(tarRes, fileStream)
              .then(() => resolve())
              .catch(reject)
          }).on('error', reject)
        }
        catch (error) {
          reject(error)
        }
      })
    }).on('error', reject).on('timeout', () => {
      reject(new Error('Download timeout'))
    })
  })
}

/**
 * Verify that critical CLI files exist after installation
 * This detects partial copies that could break the CLI
 */
function verifyCLIInstallation(installPath: string): { valid: boolean, missingFiles: string[] } {
  // Use path.join for all file paths to ensure platform compatibility
  const criticalFiles = [
    'package.json',
    path.join('bin', 'cli.mjs'),
    path.join('bin', 'cli.cjs'),
  ]

  const missingFiles: string[] = []

  for (const file of criticalFiles) {
    const filePath = path.join(installPath, file)
    try {
      accessSync(filePath, constants.F_OK)
    }
    catch {
      missingFiles.push(file)
    }
  }

  return {
    valid: missingFiles.length === 0,
    missingFiles,
  }
}

/**
 * Perform a safe file copy with error detection
 * Returns { success: true } or { success: false, error: string }
 */
function safeCopy(sourcePath: string, destPath: string): { success: boolean, error?: string } {
  try {
    let result: { stdout: Buffer, stderr: Buffer }

    // Normalize paths to ensure correct separators for the platform
    const normalizedSource = path.normalize(sourcePath)
    const normalizedDest = path.normalize(destPath)

    if (process.platform === 'win32') {
      // Windows: xcopy with error checking
      // /E = copy subdirectories including empty ones
      // /I = destination is a directory
      // /Y = suppress prompting to overwrite
      // /C = continue copying even if errors occur (but we'll check stderr)
      // Note: xcopy requires backslash separator and handles wildcards at the end
      const sourceWithWildcard = `${normalizedSource + path.sep}*`

      result = execSync(`xcopy /E /I /Y /C "${sourceWithWildcard}" "${normalizedDest}"`, {
        encoding: 'buffer',
        stdio: ['ignore', 'pipe', 'pipe'], // capture stdout and stderr
      }) as any

      // Check stderr for errors/warnings
      const stderr = result.stderr?.toString() || ''
      if (stderr.includes('File not found') || stderr.includes('Access denied') || stderr.includes('denied')) {
        return {
          success: false,
          error: `xcopy reported errors: ${stderr.trim()}`,
        }
      }
    }
    else {
      // Unix: cp with verbose output to detect partial failures
      // Use normalized path with forward slashes and wildcard
      const sourceWithWildcard = `${normalizedSource + path.sep}*`
      const destWithSeparator = normalizedDest + path.sep

      result = execSync(`cp -rf "${sourceWithWildcard}" "${destWithSeparator}"`, {
        encoding: 'buffer',
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as any

      // Check stderr for errors
      const stderr = result.stderr?.toString() || ''
      if (stderr.length > 0 && (stderr.includes('cannot') || stderr.includes('denied') || stderr.includes('error'))) {
        return {
          success: false,
          error: `cp reported errors: ${stderr.trim()}`,
        }
      }
    }

    return { success: true }
  }
  catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown copy error',
    }
  }
}

/**
 * Perform silent upgrade by extracting tarball to the installation directory
 * This method doesn't require sudo and should work in most cases
 * Uses atomic operations with rollback to ensure CLI is never left in broken state
 */
async function performSilentUpgrade(): Promise<UpdateResult> {
  const cache = CacheManager.getInstance()
  const tmpDir = path.join(os.tmpdir(), `start-claude-upgrade-${Date.now()}`)
  let backupPath: string | null = null
  let needsRollback = false
  let installPath: string | null = null

  try {
    installPath = getGlobalInstallPath()
    if (!installPath) {
      cache.set('upgrade.silentFailed', true)
      return {
        success: false,
        error: 'Could not determine installation path',
        shouldRetryWithPackageManager: true,
      }
    }

    // Check if we have write permissions to the installation directory
    if (!hasWritePermission(installPath)) {
      cache.set('upgrade.silentFailed', true)
      return {
        success: false,
        error: 'No write permission to installation directory',
        shouldRetryWithPackageManager: true,
      }
    }

    // Verify current installation is valid before attempting upgrade
    const preUpgradeCheck = verifyCLIInstallation(installPath)
    if (!preUpgradeCheck.valid) {
      cache.set('upgrade.silentFailed', true)
      return {
        success: false,
        error: `Current installation is invalid (missing: ${preUpgradeCheck.missingFiles.join(', ')}). Please reinstall manually.`,
        shouldRetryWithPackageManager: true,
      }
    }

    // Create a temporary directory for the download
    mkdirSync(tmpDir, { recursive: true })

    const tarballPath = path.join(tmpDir, 'start-claude.tgz')

    // Download the latest tarball
    await downloadLatestTarball(tarballPath)

    // Extract the tarball to a temp location first
    const extractPath = path.join(tmpDir, 'package')
    mkdirSync(extractPath, { recursive: true })

    await extract({
      file: tarballPath,
      cwd: tmpDir,
    })

    // Verify extracted package is valid before proceeding
    const extractedCheck = verifyCLIInstallation(extractPath)
    if (!extractedCheck.valid) {
      cache.set('upgrade.silentFailed', true)
      return {
        success: false,
        error: `Downloaded package is invalid (missing: ${extractedCheck.missingFiles.join(', ')}). Aborting upgrade.`,
        shouldRetryWithPackageManager: true,
      }
    }

    // CRITICAL: Create backup before modifying installation
    // This ensures we can rollback if upgrade fails
    backupPath = path.join(tmpDir, 'backup')
    mkdirSync(backupPath, { recursive: true })

    const backupResult = safeCopy(installPath, backupPath)
    if (!backupResult.success) {
      // If backup fails, abort upgrade - don't risk breaking the CLI
      cache.set('upgrade.silentFailed', true)
      return {
        success: false,
        error: `Failed to create backup: ${backupResult.error}`,
        shouldRetryWithPackageManager: true,
      }
    }

    // Verify backup is complete
    const backupCheck = verifyCLIInstallation(backupPath)
    if (!backupCheck.valid) {
      cache.set('upgrade.silentFailed', true)
      return {
        success: false,
        error: `Backup verification failed (missing: ${backupCheck.missingFiles.join(', ')}). Aborting upgrade.`,
        shouldRetryWithPackageManager: true,
      }
    }

    // Now attempt to copy new files over existing installation
    const upgradeResult = safeCopy(extractPath, installPath)
    if (!upgradeResult.success) {
      needsRollback = true
      throw new Error(`File copy failed: ${upgradeResult.error}`)
    }

    // CRITICAL: Verify installation is complete and valid after upgrade
    const postUpgradeCheck = verifyCLIInstallation(installPath)
    if (!postUpgradeCheck.valid) {
      needsRollback = true
      throw new Error(`Post-upgrade verification failed - installation incomplete (missing: ${postUpgradeCheck.missingFiles.join(', ')})`)
    }

    // Upgrade successful - clear the failed flag
    cache.delete('upgrade.silentFailed')

    return {
      success: true,
      method: 'silent-upgrade',
    }
  }
  catch (error) {
    // Any error during upgrade requires rollback
    if (needsRollback && backupPath && installPath) {
      // CRITICAL: Restore from backup
      try {
        // Use the already-validated installPath instead of calling getGlobalInstallPath() again
        const rollbackResult = safeCopy(backupPath, installPath)
        if (!rollbackResult.success) {
          throw new Error(`Rollback copy failed: ${rollbackResult.error}`)
        }

        // Verify rollback was successful
        const rollbackCheck = verifyCLIInstallation(installPath)
        if (!rollbackCheck.valid) {
          throw new Error(`Rollback verification failed (missing: ${rollbackCheck.missingFiles.join(', ')})`)
        }

        // Rollback successful
        cache.set('upgrade.silentFailed', true)
        return {
          success: false,
          error: `Upgrade failed, successfully rolled back to previous version: ${error instanceof Error ? error.message : 'Unknown error'}`,
          shouldRetryWithPackageManager: true,
        }
      }
      catch (rollbackError) {
        // CRITICAL: Both upgrade and rollback failed
        cache.set('upgrade.silentFailed', true)
        return {
          success: false,
          error: `CRITICAL: Upgrade and rollback both failed. Backup preserved at: ${backupPath}. Please restore manually. Original error: ${error instanceof Error ? error.message : 'Unknown error'}. Rollback error: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown'}`,
          shouldRetryWithPackageManager: true,
        }
      }
    }

    // Set flag to try package manager next time
    cache.set('upgrade.silentFailed', true)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during silent upgrade',
      shouldRetryWithPackageManager: true,
    }
  }
  finally {
    // Clean up temp directory (including backup if upgrade was successful)
    // Only clean up if we don't need the backup for manual recovery
    try {
      if (tmpDir && !needsRollback) {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    }
    catch {
      // Ignore cleanup errors - backup may still be needed
    }
  }
}

/**
 * Perform package manager update with optional sudo for macOS
 */
async function performPackageManagerUpdate(useSudo: boolean = false): Promise<UpdateResult> {
  const packageManager = detectPackageManager()
  const updateCommand = packageManager === 'npm'
    ? 'npm install -g start-claude@latest'
    : packageManager === 'yarn'
      ? 'yarn global add start-claude@latest'
      : 'pnpm add -g start-claude@latest'

  const finalCommand = useSudo ? `sudo ${updateCommand}` : updateCommand

  try {
    const result = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      exec(finalCommand, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          reject(error)
        }
        else {
          resolve({ stdout, stderr })
        }
      })
    })

    // Check if the update was successful
    if (result.stderr && (result.stderr.includes('error') || result.stderr.includes('failed'))) {
      throw new Error(result.stderr.trim())
    }

    // Clear the failed flag on success
    const cache = CacheManager.getInstance()
    cache.delete('upgrade.silentFailed')

    return {
      success: true,
      usedSudo: useSudo,
      method: 'package-manager',
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Check if the error is permission-related
    const isPermissionError = errorMessage.includes('EACCES')
      || errorMessage.includes('EPERM')
      || errorMessage.includes('permission denied')
      || errorMessage.includes('Permission denied')

    return {
      success: false,
      error: errorMessage,
      usedSudo: useSudo,
      method: 'package-manager',
      shouldRetryWithPackageManager: !useSudo && isPermissionError && process.platform === 'darwin',
    }
  }
}

/**
 * Main auto-update function
 * Flow:
 * 1. First time or if silent upgrade not flagged as failed: Try silent upgrade
 * 2. If silent upgrade failed before: Return info to prompt user for package manager update
 */
export async function performAutoUpdate(usePackageManager: boolean = false, useSudo: boolean = false): Promise<UpdateResult> {
  const cache = CacheManager.getInstance()
  const silentUpgradeFailed = cache.get('upgrade.silentFailed')

  // If explicitly requested to use package manager, or if silent upgrade failed before
  if (usePackageManager || silentUpgradeFailed) {
    return performPackageManagerUpdate(useSudo)
  }

  // Default: Try silent upgrade first
  return performSilentUpgrade()
}

/**
 * Perform background upgrade - this runs in the background without blocking the CLI
 * The upgrade happens silently, and results are saved to cache for next startup
 */
export async function performBackgroundUpgrade(): Promise<void> {
  // Wrap everything in try-catch to ensure this never crashes the CLI
  try {
    const cache = CacheManager.getInstance()

    // Don't start another background upgrade if one is already running
    if (cache.get('upgrade.backgroundRunning')) {
      return
    }

    // Mark that a background upgrade is running
    cache.set('upgrade.backgroundRunning', true, 5 * 60 * 1000) // 5 minute TTL

    // Run the upgrade asynchronously without blocking
    // Using setTimeout to ensure it runs after the CLI starts
    setTimeout(() => {
      void (async () => {
        try {
          const result = await performSilentUpgrade()

          // Save the result to cache
          cache.set('upgrade.backgroundResult', {
            ...result,
            timestamp: Date.now(),
          })
        }
        catch (error) {
          // Catch any unexpected errors (performSilentUpgrade should return errors, not throw)
          cache.set('upgrade.backgroundResult', {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          })
        }
        finally {
          cache.delete('upgrade.backgroundRunning')
        }
      })()
    }, 100) // Small delay to ensure CLI has started
  }
  catch {
    // Silently fail if there's any error in the synchronous setup code
    // This ensures the CLI never crashes due to upgrade logic
  }
}

/**
 * Check if there's a background upgrade result to display
 * Call this on CLI startup to show results from previous background upgrade
 */
export function checkBackgroundUpgradeResult(): { result: UpdateResult, latestVersion?: string } | null {
  try {
    const cache = CacheManager.getInstance()
    const result = cache.get('upgrade.backgroundResult')

    if (result) {
      // Get the latest version from the last update check
      const latestVersion = cache.get('updateCheck.lastVersion')

      // Clear the result after reading it
      cache.delete('upgrade.backgroundResult')

      return {
        result,
        latestVersion,
      }
    }

    return null
  }
  catch {
    // Silently fail if there's any error reading the cache
    // This ensures the CLI never crashes due to upgrade result checking
    return null
  }
}

/**
 * Detect if the CLI is running from a global installation
 */
function isGlobalInstall(): boolean {
  // Check if we're running via the global binary (not via node script.js)
  // When running globally, process.argv[1] should be the global binary path
  // or we can check if the script path is in a global node path
  if (!process.argv[1]) {
    return false
  }

  const scriptPath = process.argv[1]

  // Check if we're running via direct node execution (local development)
  if (scriptPath.endsWith('.js') || scriptPath.endsWith('.cjs') || scriptPath.endsWith('.mjs')) {
    // Check if the script is in a global Node.js installation path
    return isGlobalNodePath(scriptPath)
  }

  // If we're running via a binary (like start-claude command), it's global
  return true
}

/**
 * Restarts the CLI with the same arguments after an update
 * This ensures the user continues with their original command
 */
export function relaunchCLI(): void {
  // Get the original command and arguments
  const args = process.argv.slice(2) // Remove 'node' and script path
  const executable = process.argv[0] // node executable

  let commandToRun: string[]

  if (isGlobalInstall()) {
    // Running globally - use the binary name directly
    // Find the binary name from process.argv[1] or use 'start-claude'
    const binaryName = process.argv[1] && !process.argv[1].includes('/')
      ? process.argv[1]
      : 'start-claude'
    commandToRun = [binaryName, ...args]
  }
  else {
    // Running locally - use node with the script path
    const scriptPath = process.argv[1] // script path
    commandToRun = [scriptPath, ...args]
  }

  // Spawn a new process with the same arguments
  const child = spawn(executable, commandToRun, {
    detached: true,
    stdio: 'inherit',
  })

  // Allow the parent process to exit independently
  child.unref()

  // Exit the current process
  process.exit(0)
}
