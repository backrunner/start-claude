import type { ClaudeInstallMethod, InstallMethodInfo } from '../../config/types'
import { accessSync, constants } from 'node:fs'
import process from 'node:process'
import { CacheManager } from '../config/cache-manager'
import { findExecutable } from '../system/path-utils'

/**
 * All supported installation methods with their configurations
 * Priority: lower number = higher priority
 * npm/pnpm/yarn/bun are prioritized over homebrew/winget/official-script
 */
const INSTALL_METHODS: Array<Omit<InstallMethodInfo, 'available'>> = [
  {
    method: 'pnpm',
    name: 'pnpm',
    command: 'pnpm',
    installCmd: 'pnpm add -g @anthropic-ai/claude-code',
    updateCmd: 'pnpm update -g @anthropic-ai/claude-code',
    priority: 10,
  },
  {
    method: 'npm',
    name: 'npm',
    command: 'npm',
    installCmd: 'npm install -g @anthropic-ai/claude-code',
    updateCmd: 'npm update -g @anthropic-ai/claude-code',
    priority: 15,
  },
  {
    method: 'yarn',
    name: 'yarn',
    command: 'yarn',
    installCmd: 'yarn global add @anthropic-ai/claude-code',
    updateCmd: 'yarn global upgrade @anthropic-ai/claude-code',
    priority: 20,
  },
  {
    method: 'bun',
    name: 'bun',
    command: 'bun',
    installCmd: 'bun add -g @anthropic-ai/claude-code',
    updateCmd: 'bun update -g @anthropic-ai/claude-code',
    priority: 25,
  },
  {
    method: 'homebrew',
    name: 'Homebrew',
    command: 'brew',
    installCmd: 'brew install claude-code',
    updateCmd: 'brew upgrade claude-code',
    priority: 30,
  },
  {
    method: 'winget',
    name: 'winget',
    command: 'winget',
    installCmd: 'winget install Anthropic.ClaudeCode',
    updateCmd: 'winget upgrade Anthropic.ClaudeCode',
    priority: 30,
  },
  {
    method: 'official-script',
    name: 'Official Installer',
    command: 'curl',
    installCmd: getOfficialInstallCommand(),
    updateCmd: 'claude update',
    priority: 40,
  },
]

/**
 * Get the official installation command based on platform
 */
function getOfficialInstallCommand(): string {
  if (process.platform === 'win32') {
    return 'irm https://claude.ai/install.ps1 | iex'
  }
  return 'curl -fsSL https://claude.ai/install.sh | sh'
}

/**
 * Check if a command is available by searching PATH (fast, no execution)
 */
function isCommandInPath(command: string): boolean {
  return findExecutable(command) !== null
}

/**
 * Detect available installation methods for the current platform
 * Uses PATH lookup instead of executing commands for speed
 * Returns methods sorted by priority (lower = higher priority)
 */
export async function detectAvailableInstallMethods(): Promise<InstallMethodInfo[]> {
  const methods: InstallMethodInfo[] = []

  for (const method of INSTALL_METHODS) {
    // Skip platform-specific methods on wrong platform
    if (method.method === 'homebrew' && process.platform !== 'darwin') {
      continue
    }
    if (method.method === 'winget' && process.platform !== 'win32') {
      continue
    }

    // Check if the command is available in PATH (fast lookup, no execution)
    let available = false
    if (method.method === 'official-script') {
      // Official script needs curl or wget
      available = isCommandInPath('curl') || isCommandInPath('wget')
    }
    else {
      available = isCommandInPath(method.command)
    }

    methods.push({ ...method, available })
  }

  // Sort by priority and filter to available only for the sorted result
  return methods.sort((a, b) => a.priority - b.priority)
}

/**
 * Detect how Claude Code was installed based on executable path
 */
export function detectInstallMethodFromPath(claudePath: string): ClaudeInstallMethod {
  const normalizedPath = claudePath.toLowerCase()

  // Check for pnpm first (more specific)
  if (normalizedPath.includes('pnpm')) {
    return 'pnpm'
  }

  // Check for npm/node_modules
  if (normalizedPath.includes('node_modules') || normalizedPath.includes('/npm/') || normalizedPath.includes('\\npm\\')) {
    return 'npm'
  }

  // Check for bun
  if (normalizedPath.includes('.bun/bin') || normalizedPath.includes('.bun\\bin')) {
    return 'bun'
  }

  // Check for Homebrew
  if (normalizedPath.includes('/homebrew/') || normalizedPath.includes('/opt/homebrew/') || normalizedPath.includes('/cellar/')) {
    return 'homebrew'
  }

  // Check for winget (Windows)
  if (normalizedPath.includes('winget') || normalizedPath.includes('microsoft\\winget') || normalizedPath.includes('programs\\claude')) {
    return 'winget'
  }

  // Check for official installer
  if (normalizedPath.includes('.claude/bin') || normalizedPath.includes('.claude\\bin')) {
    return 'official-script'
  }

  return 'unknown'
}

/**
 * Get update command for a specific installation method
 */
export function getUpdateCommand(method: ClaudeInstallMethod): string {
  const methodInfo = INSTALL_METHODS.find(m => m.method === method)
  if (methodInfo) {
    return methodInfo.updateCmd
  }
  // Fallback to npm
  return 'npm update -g @anthropic-ai/claude-code'
}

/**
 * Get install command for a specific installation method
 */
export function getInstallCommand(method: ClaudeInstallMethod): string {
  const methodInfo = INSTALL_METHODS.find(m => m.method === method)
  if (methodInfo) {
    return methodInfo.installCmd
  }
  // Fallback to npm
  return 'npm install -g @anthropic-ai/claude-code'
}

/**
 * Find Claude executable with cache-first strategy
 * 1. Check cache for path
 * 2. If cached path exists and is executable, return it
 * 3. If not, clear cache and do full detection
 * 4. Cache the result and return
 */
export function findClaudeExecutable(env: NodeJS.ProcessEnv = process.env): { path: string, method: ClaudeInstallMethod } | null {
  const cache = CacheManager.getInstance()

  // Step 1: Check cache
  const cachedPath = cache.getClaudePath()
  if (cachedPath) {
    // Step 2: Verify cached path still exists and is accessible
    try {
      accessSync(cachedPath, constants.F_OK | constants.X_OK)
      const cachedMethod = cache.getClaudeInstallMethod() || 'unknown'
      return { path: cachedPath, method: cachedMethod }
    }
    catch {
      // Cached path is invalid, clear cache and continue to full detection
      cache.clearClaudePathCache()
    }
  }

  // Step 3: Full detection
  const claudePath = findExecutable('claude', { env, skipDirs: ['.start-claude'] })

  if (!claudePath) {
    return null
  }

  // Step 4: Detect installation method and cache
  const method = detectInstallMethodFromPath(claudePath)
  cache.setClaudePath(claudePath, method)

  return { path: claudePath, method }
}
