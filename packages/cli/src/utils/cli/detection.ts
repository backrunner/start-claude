import type { InstallMethodInfo } from '../../config/types'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import inquirer from 'inquirer'
import { CacheManager } from '../config/cache-manager'
import { detectAvailableInstallMethods } from './install-methods'

const execAsync = promisify(exec)

export async function checkClaudeInstallation(): Promise<{
  isInstalled: boolean
  version?: string
  error?: string
}> {
  const cache = CacheManager.getInstance()

  // Check permanent cache first - only verify installation once
  const cachedInstalled = cache.isClaudeInstalled()
  if (cachedInstalled === true) {
    const cachedVersion = cache.getClaudeVersion()
    return {
      isInstalled: true,
      version: cachedVersion || undefined,
    }
  }

  // First time check or previously failed - verify installation
  try {
    const { stdout } = await execAsync('claude --version')
    const version = stdout.trim()

    // Cache permanently (no expiration)
    cache.setClaudeInstalled(true, version)

    return {
      isInstalled: true,
      version,
    }
  }
  catch (error) {
    // Don't cache failures - allow retry on next startup
    return {
      isInstalled: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Detect available installation methods for the current platform
 * Returns methods sorted by priority with availability status
 */
export async function detectInstallMethods(): Promise<{
  available: InstallMethodInfo[]
  preferred?: InstallMethodInfo
}> {
  const allMethods = await detectAvailableInstallMethods()
  const available = allMethods.filter(m => m.available)

  // Prefer the first available method (already sorted by priority)
  const preferred = available[0]

  return { available, preferred }
}

export async function promptClaudeInstallation(): Promise<void> {
  console.error('Claude Code CLI is not installed or not found in PATH.')
  console.error('')

  const { available, preferred } = await detectInstallMethods()

  if (available.length === 0) {
    console.error('No supported installation methods found.')
    console.error('')
    console.error('To install Claude Code CLI manually, please visit:')
    console.error('https://docs.anthropic.com/en/docs/claude-code')
    return
  }

  console.error(`Available installation methods: ${available.map(m => m.name).join(', ')}`)
  console.error('')

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldInstall',
      message: `Would you like to install Claude Code CLI using ${preferred?.name}?`,
      default: true,
    },
  ])

  if (answers.shouldInstall !== true) {
    console.error('Installation cancelled.')
    console.error('')
    console.error('To install Claude Code CLI manually, please visit:')
    console.error('https://docs.anthropic.com/en/docs/claude-code')
    console.error('')
    console.error('Or use one of these commands:')
    available.forEach((method) => {
      console.error(`  ${method.name}: ${method.installCmd}`)
    })
    return
  }

  let selectedMethod = preferred

  if (available.length > 1) {
    const methodAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'installMethod',
        message: 'Select installation method:',
        choices: available.map(method => ({
          name: `${method.name} (${method.installCmd})`,
          value: method,
        })),
        default: preferred,
      },
    ])
    selectedMethod = methodAnswers.installMethod as InstallMethodInfo
  }

  if (selectedMethod) {
    console.error(`Installing Claude Code CLI using ${selectedMethod.name}...`)
    console.error(`Running: ${selectedMethod.installCmd}`)
    console.error('')

    try {
      const { stdout, stderr } = await execAsync(selectedMethod.installCmd)

      if (stdout)
        console.error(stdout)
      if (stderr)
        console.error(stderr)

      console.error('')
      console.error('Installation completed! Please run start-claude again.')

      // Cache the installation method
      const cache = CacheManager.getInstance()
      cache.set('claude.installMethod', selectedMethod.method)
    }
    catch (error) {
      console.error('')
      console.error('Installation failed:', error instanceof Error ? error.message : 'Unknown error')
      console.error('')
      console.error('Please try installing manually:')
      console.error(`  ${selectedMethod.installCmd}`)
      console.error('')
      console.error('Or visit: https://docs.anthropic.com/en/docs/claude-code')
    }
  }
}
