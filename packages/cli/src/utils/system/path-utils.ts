import { execSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export interface FindExecutableOptions {
  env?: NodeJS.ProcessEnv
  extensions?: string[]
  skipDirs?: string[]
}

/**
 * Find an executable in the system PATH with cross-platform support
 * This handles Windows, macOS, and Linux environments properly
 */
export function findExecutable(
  command: string,
  options: FindExecutableOptions = {},
): string | null {
  const {
    env = process.env,
    extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.ps1', '.bat', ''] : [''],
    skipDirs = ['.start-claude'],
  } = options

  const pathEnv = env.PATH || env.Path || ''
  let pathDirs = pathEnv.split(path.delimiter)

  // Add platform-specific global installation paths
  const globalPaths = getGlobalNodePaths(env)
  pathDirs = [...globalPaths, ...pathDirs]

  for (const dir of pathDirs) {
    // Skip directories that might cause infinite loops or issues
    if (skipDirs.some(skipDir => dir.includes(skipDir))) {
      continue
    }

    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext)
      try {
        // Check if file exists and is accessible
        accessSync(fullPath, constants.F_OK)
        return fullPath
      }
      catch {
        // Continue searching
      }
    }
  }
  return null
}

/**
 * Get platform-specific global Node.js installation paths
 * This handles NVM, n, and standard Node.js installations
 */
export function getGlobalNodePaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const paths: string[] = []

  if (process.platform === 'win32') {
    // Windows paths
    if (env.APPDATA) {
      paths.push(path.join(env.APPDATA, 'npm'))
    }
    if (env.ProgramFiles) {
      paths.push(path.join(env.ProgramFiles, 'nodejs'))
    }
    if (env['ProgramFiles(x86)']) {
      paths.push(path.join(env['ProgramFiles(x86)'], 'nodejs'))
    }
    if (env.LOCALAPPDATA) {
      paths.push(path.join(env.LOCALAPPDATA, 'npm'))
      // winget installation paths
      paths.push(path.join(env.LOCALAPPDATA, 'Programs', 'claude'))
      paths.push(path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages'))
    }
    // bun global path (Windows)
    if (env.USERPROFILE) {
      paths.push(path.join(env.USERPROFILE, '.bun', 'bin'))
      // Official installer path (Windows)
      paths.push(path.join(env.USERPROFILE, '.claude', 'bin'))
    }
  }
  else {
    // macOS/Linux paths

    // Standard global node paths
    paths.push('/usr/local/bin')
    paths.push('/usr/bin')
    paths.push('/opt/homebrew/bin') // Homebrew on Apple Silicon
    paths.push('/usr/local/opt/node@16/bin') // Homebrew specific node versions
    paths.push('/usr/local/opt/node@18/bin')
    paths.push('/usr/local/opt/node@20/bin')

    // NVM paths
    if (env.NVM_DIR) {
      paths.push(path.join(env.NVM_DIR, 'versions', 'node'))
      // Add current nvm node version bin
      const currentNodeVersion = env.NVM_BIN
      if (currentNodeVersion) {
        paths.push(currentNodeVersion)
      }
    }

    // n-install paths
    if (env.N_PREFIX) {
      paths.push(path.join(env.N_PREFIX, 'bin'))
    }

    // User-specific global installations
    if (env.HOME) {
      paths.push(path.join(env.HOME, '.npm-global', 'bin'))
      paths.push(path.join(env.HOME, '.nvm', 'versions', 'node'))
      paths.push(path.join(env.HOME, '.n', 'bin'))
      // bun global path
      paths.push(path.join(env.HOME, '.bun', 'bin'))
      // Official installer path (~/.claude/bin)
      paths.push(path.join(env.HOME, '.claude', 'bin'))
      // User local bin (macOS/Linux) - also used by official installer on macOS
      paths.push(path.join(env.HOME, '.local', 'bin'))
    }

    // snap path (Linux)
    paths.push('/snap/bin')
  }

  // Filter out empty or invalid paths
  return paths.filter(p => p && p !== 'npm' && p !== 'nodejs')
}

/**
 * Check if a given path is likely a global Node.js installation path
 */
export function isGlobalNodePath(dirPath: string): boolean {
  if (!dirPath)
    return false

  if (process.platform === 'win32') {
    // Windows patterns only
    const windowsPatterns = [
      /[\\/]npm[\\/]?$/i,
      /[\\/]nodejs[\\/]?$/i,
      /AppData[\\/]Roaming[\\/]npm/i,
      /Program Files[\\/]nodejs/i,
      /\.bun[\\/]bin/i,
      /\.claude[\\/]bin/i,
      /WinGet[\\/]Packages/i,
      /Programs[\\/]claude/i,
    ]
    return windowsPatterns.some(pattern => pattern.test(dirPath))
  }
  else {
    // Unix patterns (macOS/Linux)
    const unixPatterns = [
      /\/usr\/local\/bin/,
      /\/usr\/bin/,
      /\/opt\/homebrew\/bin/,
      /\.npm-global\/bin/,
      /\.nvm\/versions\/node/,
      /\.n\/bin/,
      /\/usr\/local\/opt\/node@\d+\/bin/,
      /\.bun\/bin/,
      /\.claude\/bin/,
      /\.local\/bin/,
      /\/snap\/bin/,
    ]
    return unixPatterns.some(pattern => pattern.test(dirPath))
  }
}

/**
 * Check if we're running in WSL (Windows Subsystem for Linux)
 */
export function isWSL(): boolean {
  // Method 1: Check WSL environment variables
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return true
  }

  // Method 2: Check /proc/version for WSL indicator (works for WSL 1 and 2)
  try {
    if (existsSync('/proc/version')) {
      const versionContent = readFileSync('/proc/version', 'utf-8').toLowerCase()
      return versionContent.includes('microsoft') || versionContent.includes('wsl')
    }
  }
  catch {
    // If we can't read /proc/version, continue with other checks
  }

  // Method 3: Check /etc/os-release for WSL indicator (WSL 2)
  try {
    if (existsSync('/etc/os-release')) {
      const osReleaseContent = readFileSync('/etc/os-release', 'utf-8').toLowerCase()
      return osReleaseContent.includes('microsoft') || osReleaseContent.includes('wsl')
    }
  }
  catch {
    // If we can't read /etc/os-release, not WSL
  }

  return false
}

/**
 * Get the Windows user home directory path when running in WSL
 * Returns the path in WSL format (/mnt/c/Users/username)
 */
export function getWindowsUserPath(): string | null {
  if (!isWSL()) {
    return null
  }

  try {
    // Method 1: Try wslpath command if available (most reliable)
    try {
      const windowsHome = execSync('wslpath "$(cmd.exe /c "echo %USERPROFILE%" 2>/dev/null | tr -d \'\\r\')"', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim()

      if (windowsHome && existsSync(windowsHome)) {
        return windowsHome
      }
    }
    catch {
      // wslpath might not be available, try other methods
    }

    // Method 2: Try WSLENV or WSL environment variables
    if (process.env.USERPROFILE) {
      // USERPROFILE might be set via WSLENV
      const userProfile = process.env.USERPROFILE
      // Convert Windows path to WSL path (C:\Users\name -> /mnt/c/Users/name)
      const wslPath = userProfile
        .replace(/\\/g, '/')
        .replace(/^([A-Z]):/i, (_, drive) => `/mnt/${drive.toLowerCase()}`)

      if (existsSync(wslPath)) {
        return wslPath
      }
    }

    // Method 3: Try common Windows user paths via /mnt/c/
    const username = execSync('cmd.exe /c "echo %USERNAME%" 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()

    if (username) {
      const commonPaths = [
        `/mnt/c/Users/${username}`,
        `/mnt/c/Users/${username.toLowerCase()}`,
      ]

      for (const testPath of commonPaths) {
        if (existsSync(testPath)) {
          return testPath
        }
      }
    }

    return null
  }
  catch {
    return null
  }
}

/**
 * Get the WSL distribution name
 */
export function getWSLDistroName(): string | null {
  if (!isWSL()) {
    return null
  }

  // Check environment variable first
  if (process.env.WSL_DISTRO_NAME) {
    return process.env.WSL_DISTRO_NAME
  }

  // Try to extract from /etc/os-release
  try {
    if (existsSync('/etc/os-release')) {
      const osReleaseContent = readFileSync('/etc/os-release', 'utf-8')
      const nameMatch = osReleaseContent.match(/^NAME="?([^"\n]+)"?/m)
      if (nameMatch) {
        return nameMatch[1]
      }
    }
  }
  catch {
    // If we can't read the file, return null
  }

  return null
}

/**
 * Convert Windows path to WSL path
 * Example: C:\Users\name -> /mnt/c/Users/name
 */
export function windowsPathToWSL(windowsPath: string): string | null {
  if (!isWSL()) {
    return null
  }

  try {
    // Use wslpath if available
    const wslPath = execSync(`wslpath "${windowsPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()

    return wslPath || null
  }
  catch {
    // Fallback to manual conversion
    const normalized = windowsPath.replace(/\\/g, '/')
    const wslPath = normalized.replace(/^([A-Z]):/i, (_, drive) => `/mnt/${drive.toLowerCase()}`)
    return wslPath
  }
}

/**
 * Convert WSL path to Windows path
 * Example: /mnt/c/Users/name -> C:\Users\name
 */
export function wslPathToWindows(wslPath: string): string | null {
  if (!isWSL()) {
    return null
  }

  try {
    // Use wslpath if available
    const windowsPath = execSync(`wslpath -w "${wslPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()

    return windowsPath || null
  }
  catch {
    // Fallback to manual conversion
    const match = wslPath.match(/^\/mnt\/([a-z])\/(.+)/)
    if (match) {
      const [, drive, rest] = match
      return `${drive.toUpperCase()}:\\${rest.replace(/\//g, '\\')}`
    }
    return null
  }
}
