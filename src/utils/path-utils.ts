import { accessSync, constants } from 'node:fs'
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
    extensions = process.platform === 'win32' ? ['.cmd', '.ps1', '.bat', ''] : [''],
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
    }
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
    ]
    return unixPatterns.some(pattern => pattern.test(dirPath))
  }
}
