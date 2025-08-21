import { spawn } from 'node:child_process'
import process from 'node:process'
import { UILogger } from '../utils/cli/ui'

export async function handleUsageCommand(subcommand?: string, options: any = {}): Promise<void> {
  const ui = new UILogger()
  ui.displayWelcome()
  const args = ['ccusage']

  if (subcommand) {
    args.push(subcommand)
  }

  // Add all passed options to ccusage
  for (const [key, value] of Object.entries(options)) {
    if (key === 'parent' || typeof value === 'function')
      continue

    const flagName = key.replace(/([A-Z])/g, '-$1').toLowerCase()

    if (typeof value === 'boolean' && value) {
      args.push(`--${flagName}`)
    }
    else if (value !== undefined && value !== false) {
      args.push(`--${flagName}`)
      args.push(String(value))
    }
  }

  ui.displayInfo(`Running: npx ${args.join(' ')}`)

  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, {
      stdio: 'inherit',
      shell: true,
    })

    child.on('error', (error) => {
      ui.displayError(`Failed to run ccusage: ${error.message}`)
      reject(error)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        ui.displayError(`ccusage exited with code ${code}`)
        process.exit(code)
      }
      resolve()
    })
  })
}
