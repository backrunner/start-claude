import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import inquirer from 'inquirer'

const execAsync = promisify(exec)

export async function checkClaudeInstallation(): Promise<{
  isInstalled: boolean
  version?: string
  error?: string
}> {
  try {
    const { stdout } = await execAsync('claude --version')
    const version = stdout.trim()
    return {
      isInstalled: true,
      version,
    }
  }
  catch (error) {
    return {
      isInstalled: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function detectPackageManager(): Promise<{
  available: Array<{ name: string, command: string, installCmd: string }>
  preferred?: { name: string, command: string, installCmd: string }
}> {
  const packageManagers = [
    { name: 'npm', command: 'npm', installCmd: 'npm install -g @anthropic-ai/claude-code' },
    { name: 'pnpm', command: 'pnpm', installCmd: 'pnpm add -g @anthropic-ai/claude-code' },
    { name: 'yarn', command: 'yarn', installCmd: 'yarn global add @anthropic-ai/claude-code' },
    { name: 'bun', command: 'bun', installCmd: 'bun add -g @anthropic-ai/claude-code' },
  ]

  const available = []

  for (const pm of packageManagers) {
    try {
      await execAsync(`${pm.command} --version`)
      available.push(pm)
    }
    catch {
      // Package manager not available
    }
  }

  // Prefer pnpm if available, otherwise use the first available
  const preferred = available.find(pm => pm.name === 'pnpm') || available[0]

  return { available, preferred }
}

export async function promptClaudeInstallation(): Promise<void> {
  console.error('❌ Claude Code CLI is not installed or not found in PATH.')
  console.error('')

  const { available, preferred } = await detectPackageManager()

  if (available.length === 0) {
    console.error('No supported package managers found (npm, pnpm, yarn, bun).')
    console.error('')
    console.error('To install Claude Code CLI manually, please visit:')
    console.error('https://docs.anthropic.com/en/docs/claude-code')
    return
  }

  console.error(`Detected package managers: ${available.map(pm => pm.name).join(', ')}`)
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
    available.forEach((pm) => {
      console.error(`  ${pm.installCmd}`)
    })
    return
  }

  let selectedPackageManager = preferred

  if (available.length > 1) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'packageManager',
        message: 'Select package manager:',
        choices: available.map(pm => ({
          name: `${pm.name} (${pm.installCmd})`,
          value: pm,
        })),
        default: preferred,
      },
    ])
    selectedPackageManager = answers.packageManager as typeof preferred
  }

  if (selectedPackageManager) {
    console.error(`Installing Claude Code CLI using ${selectedPackageManager.name}...`)
    console.error(`Running: ${selectedPackageManager.installCmd}`)
    console.error('')

    try {
      const { stdout, stderr } = await execAsync(selectedPackageManager.installCmd)

      if (stdout)
        console.error(stdout)
      if (stderr)
        console.error(stderr)

      console.error('')
      console.error('✅ Installation completed! Please run start-claude again.')
    }
    catch (error) {
      console.error('')
      console.error('❌ Installation failed:', error instanceof Error ? error.message : 'Unknown error')
      console.error('')
      console.error('Please try installing manually:')
      console.error(`  ${selectedPackageManager.installCmd}`)
      console.error('')
      console.error('Or visit: https://docs.anthropic.com/en/docs/claude-code')
    }
  }
}
