import type { Buffer } from 'node:buffer'
import { execSync, spawn } from 'node:child_process'
import { accessSync, constants, cpSync, createWriteStream, mkdirSync, rmSync } from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { extract } from 'tar'
import { version } from '../../../package.json'
import { findExecutable, isGlobalNodePath } from '../system/path-utils'
import { CacheManager } from './cache-manager'

// Get the current file path using import.meta.url for bundled code
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Cache keys for silent upgrade tracking
const CACHE_KEY_FAILURE_COUNT = 'upgrade.consecutiveFailures'
const CACHE_KEY_USER_DISMISSED = 'upgrade.userDismissedPrompt'
const FAILURE_THRESHOLD = 10
const BACKGROUND_RUNNING_TTL_MS = 5 * 60 * 1000

export const BACKGROUND_UPGRADE_ARG = '--start-claude-background-upgrade'
export const BACKGROUND_UPGRADE_ENV = 'START_CLAUDE_BACKGROUND_UPGRADE'

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

    // Update the last check timestamp and remember the newest published version
    cache.setUpdateCheckTimestamp(Date.now(), latestVersion)

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

type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

function detectPackageManagerFromInstallPath(installPath: string | null): PackageManager | null {
  if (!installPath) {
    return null
  }

  const normalizedPath = path.normalize(installPath).toLowerCase().replace(/\\/g, '/')

  if (normalizedPath.includes('/.pnpm/') || normalizedPath.includes('pnpm')) {
    return 'pnpm'
  }

  if (normalizedPath.includes('/.bun/') || normalizedPath.includes('bun')) {
    return 'bun'
  }

  if (normalizedPath.includes('/yarn/') || normalizedPath.includes('/.config/yarn/')) {
    return 'yarn'
  }

  if (normalizedPath.includes('/node_modules/start-claude')) {
    return 'npm'
  }

  return null
}

/**
 * Detect package manager to use for start-claude updates.
 */
function detectPackageManager(): PackageManager {
  const installedPackageManager = detectPackageManagerFromInstallPath(getGlobalInstallPath())
  if (installedPackageManager) {
    return installedPackageManager
  }

  // Fallback to checking available package managers via PATH lookup (fast, no execution)
  if (findExecutable('pnpm')) {
    return 'pnpm'
  }

  if (findExecutable('bun')) {
    return 'bun'
  }

  if (findExecutable('yarn')) {
    return 'yarn'
  }

  return 'npm' // Fallback to npm
}

function pathExists(filePath: string): boolean {
  try {
    accessSync(filePath, constants.F_OK)
    return true
  }
  catch {
    return false
  }
}

function resolveCliEntryPath(): string | null {
  const argvEntry = process.argv[1]
  if (argvEntry) {
    const resolvedArgvEntry = path.resolve(argvEntry)
    if (pathExists(resolvedArgvEntry)) {
      return resolvedArgvEntry
    }
  }

  const bundledEntryName = path.basename(__filename).toLowerCase()
  if (!['cli.js', 'cli.cjs', 'cli.mjs'].includes(bundledEntryName)) {
    return null
  }

  const bundledEntryPath = path.resolve(__filename)
  if (pathExists(bundledEntryPath)) {
    return bundledEntryPath
  }

  return null
}

function isNodeRunnableEntryPath(entryPath: string): boolean {
  const ext = path.extname(entryPath).toLowerCase()
  return ext === '.js' || ext === '.cjs' || ext === '.mjs' || ext === '.ts'
}

function buildCliInvocation(args: string[]): { command: string, args: string[], shell: boolean } | null {
  const entryPath = resolveCliEntryPath()

  if (entryPath) {
    if (isNodeRunnableEntryPath(entryPath)) {
      return {
        command: process.execPath,
        args: [...process.execArgv, entryPath, ...args],
        shell: false,
      }
    }

    return {
      command: entryPath,
      args,
      shell: process.platform === 'win32',
    }
  }

  const binaryName = process.argv[1] ? path.basename(process.argv[1]) : 'start-claude'
  return {
    command: binaryName,
    args,
    shell: process.platform === 'win32',
  }
}

/**
 * Download a specific version of start-claude tarball from npm
 * Only downloads stable (non-prerelease) versions
 */
async function downloadLatestTarball(destPath: string, version?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = 30000 // 30 seconds

    // Fetch full package metadata to get tarball URL for specific version
    const metadataReq = https.get('https://registry.npmjs.org/start-claude', {
      timeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'start-claude-cli',
      },
    }, (res: any) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`npm registry returned ${res.statusCode}`))
        res.resume?.()
        return
      }

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
          const tarballReq = https.get(tarballUrl, {
            timeout,
            headers: {
              'User-Agent': 'start-claude-cli',
            },
          }, (tarRes: any) => {
            if (tarRes.statusCode && tarRes.statusCode >= 400) {
              reject(new Error(`tarball download returned ${tarRes.statusCode}`))
              tarRes.resume?.()
              return
            }

            const fileStream = createWriteStream(destPath)

            pipeline(tarRes, fileStream)
              .then(() => resolve())
              .catch(reject)
          })

          tarballReq.on('error', reject)
          tarballReq.on('timeout', () => {
            tarballReq.destroy()
            reject(new Error('Tarball download timeout'))
          })
        }
        catch (error) {
          reject(error)
        }
      })
    })

    metadataReq.on('error', reject)
    metadataReq.on('timeout', () => {
      metadataReq.destroy()
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
export function safeCopy(sourcePath: string, destPath: string): { success: boolean, error?: string } {
  try {
    const normalizedSource = path.normalize(sourcePath)
    const normalizedDest = path.normalize(destPath)

    cpSync(normalizedSource, normalizedDest, {
      recursive: true,
      force: true,
    })

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
  const updateCommand = getPackageManagerUpdateCommand(packageManager)
  const command = useSudo ? 'sudo' : updateCommand.command
  const args = useSudo ? [updateCommand.command, ...updateCommand.args] : updateCommand.args

  try {
    const result = await runPackageManagerCommand(command, args, useSudo)

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
      shouldRetryWithPackageManager: !useSudo && isPermissionError && process.platform !== 'win32',
    }
  }
}

function getPackageManagerUpdateCommand(packageManager: PackageManager): { command: string, args: string[] } {
  if (packageManager === 'npm') {
    return { command: 'npm', args: ['install', '-g', 'start-claude@latest'] }
  }

  if (packageManager === 'yarn') {
    return { command: 'yarn', args: ['global', 'add', 'start-claude@latest'] }
  }

  if (packageManager === 'bun') {
    return { command: 'bun', args: ['add', '-g', 'start-claude@latest'] }
  }

  return { command: 'pnpm', args: ['add', '-g', 'start-claude@latest'] }
}

async function runPackageManagerCommand(command: string, args: string[], inheritStdio: boolean): Promise<{ stdout: string, stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === 'win32' && command !== 'sudo',
      stdio: inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Package manager update timed out'))
    }, 60000)

    child.once('error', (error: Error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.once('close', (code: number | null) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(stderr.trim() || `Package manager update failed with exit code ${code ?? 'unknown'}`))
    })
  })
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

function recordBackgroundUpgradeResult(result: UpdateResult): void {
  const cache = CacheManager.getInstance()

  cache.set('upgrade.backgroundResult', {
    ...result,
    timestamp: Date.now(),
  })

  if (result.success) {
    cache.set(CACHE_KEY_FAILURE_COUNT, 0)
    cache.delete(CACHE_KEY_USER_DISMISSED)
    return
  }

  const failures = cache.get(CACHE_KEY_FAILURE_COUNT) || 0
  cache.set(CACHE_KEY_FAILURE_COUNT, failures + 1)
}

function recordBackgroundUpgradeError(error: unknown): void {
  recordBackgroundUpgradeResult({
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
    shouldRetryWithPackageManager: true,
  })
}

export function isBackgroundUpgradeProcess(): boolean {
  return process.argv.includes(BACKGROUND_UPGRADE_ARG) && process.env[BACKGROUND_UPGRADE_ENV] === '1'
}

export async function runBackgroundUpgradeWorker(): Promise<void> {
  const cache = CacheManager.getInstance()

  try {
    const result = await performSilentUpgrade()
    recordBackgroundUpgradeResult(result)
  }
  catch (error) {
    recordBackgroundUpgradeError(error)
  }
  finally {
    cache.delete('upgrade.backgroundRunning')
  }
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
    cache.set('upgrade.backgroundRunning', true, BACKGROUND_RUNNING_TTL_MS)

    const invocation = buildCliInvocation([BACKGROUND_UPGRADE_ARG])
    if (!invocation) {
      recordBackgroundUpgradeResult({
        success: false,
        error: 'Could not determine CLI entry point for background upgrade',
        shouldRetryWithPackageManager: true,
      })
      cache.delete('upgrade.backgroundRunning')
      return
    }

    const child = spawn(invocation.command, invocation.args, {
      detached: true,
      stdio: 'ignore',
      shell: invocation.shell,
      windowsHide: true,
      env: {
        ...process.env,
        [BACKGROUND_UPGRADE_ENV]: '1',
      },
    })

    child.once('error', (error: Error) => {
      recordBackgroundUpgradeError(error)
      cache.delete('upgrade.backgroundRunning')
    })

    child.unref()
  }
  catch {
    // Silently fail if there's any error in the synchronous setup code
    // This ensures the CLI never crashes due to upgrade logic
    try {
      const cache = CacheManager.getInstance()
      cache.delete('upgrade.backgroundRunning')
    }
    catch {
      // Ignore cache cleanup errors
    }
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
 * Restarts the CLI with the same arguments after an update
 * This ensures the user continues with their original command
 */
export function relaunchCLI(): void {
  // Get the original command and arguments
  const args = process.argv.slice(2) // Remove 'node' and script path
  const invocation = buildCliInvocation(args)

  if (!invocation) {
    process.exit(1)
    return
  }

  // Spawn a new process with the same arguments
  const child = spawn(invocation.command, invocation.args, {
    detached: true,
    stdio: 'inherit',
    shell: invocation.shell,
  })

  // Allow the parent process to exit independently
  child.unref()

  // Exit the current process
  process.exit(0)
}

/**
 * Check if sudo is needed for global npm install on macOS
 */
function checkNeedsSudo(): boolean {
  if (process.platform !== 'darwin')
    return false

  try {
    const installPath = getGlobalInstallPath()
    if (installPath && hasWritePermission(installPath)) {
      return false
    }

    const globalDir = execSync('npm root -g', { encoding: 'utf-8' }).trim()
    accessSync(globalDir, constants.W_OK)
    return false
  }
  catch {
    return true
  }
}

/**
 * Perform interactive upgrade when user chooses to upgrade
 */
async function performInteractiveUpgrade(ui: { info: (msg: string) => void, success: (msg: string) => void, error: (msg: string) => void }): Promise<void> {
  const needsSudo = checkNeedsSudo()
  const pm = detectPackageManager()

  if (needsSudo) {
    ui.info(`Admin privileges required for global install, using sudo ${pm}...`)
  }

  ui.info('Upgrading start-claude...')
  const result = await performPackageManagerUpdate(needsSudo)

  if (result.success) {
    ui.success('Upgrade successful! The new version will be used on next startup.')
    const cache = CacheManager.getInstance()
    cache.set(CACHE_KEY_FAILURE_COUNT, 0)
    cache.delete(CACHE_KEY_USER_DISMISSED)
  }
  else {
    ui.error(`Upgrade failed: ${result.error}`)
    if (!needsSudo && result.shouldRetryWithPackageManager) {
      ui.info('Permission issue detected, retrying with sudo...')
      const retryResult = await performPackageManagerUpdate(true)
      if (retryResult.success) {
        ui.success('Upgrade successful!')
        const cache = CacheManager.getInstance()
        cache.set(CACHE_KEY_FAILURE_COUNT, 0)
        cache.delete(CACHE_KEY_USER_DISMISSED)
      }
      else {
        ui.error(`Upgrade still failed: ${retryResult.error}`)
      }
    }
  }
}

/**
 * Prompt user for upgrade choice using inquirer
 */
async function promptUserForUpgrade(ui: { info: (msg: string) => void, success: (msg: string) => void, error: (msg: string) => void }): Promise<void> {
  // Dynamic import to avoid loading inquirer unless needed
  const inquirer = await import('inquirer')

  const { choice } = await inquirer.default.prompt([{
    type: 'list',
    name: 'choice',
    message: 'Background upgrade has failed multiple times. Would you like to upgrade now for the best experience?',
    choices: [
      { name: 'Upgrade now', value: 'upgrade' },
      { name: 'Skip (don\'t ask again)', value: 'dismiss' },
    ],
  }])

  const cache = CacheManager.getInstance()

  if (choice === 'upgrade') {
    await performInteractiveUpgrade(ui)
  }
  else {
    cache.set(CACHE_KEY_USER_DISMISSED, true)
  }
}

/**
 * Handle background upgrade result silently, only prompting after multiple failures
 */
export async function handleBackgroundUpgradeResult(ui: { info: (msg: string) => void, success: (msg: string) => void, error: (msg: string) => void }): Promise<void> {
  const result = checkBackgroundUpgradeResult()
  if (!result)
    return

  // Silent handling - no messages for success or failure
  // Failure counting is handled in performBackgroundUpgrade

  // Check if we need to prompt user (after multiple failures)
  const cache = CacheManager.getInstance()
  const failures = cache.get(CACHE_KEY_FAILURE_COUNT) || 0
  const dismissed = cache.get(CACHE_KEY_USER_DISMISSED)

  if (failures >= FAILURE_THRESHOLD && !dismissed) {
    await promptUserForUpgrade(ui)
  }
}
