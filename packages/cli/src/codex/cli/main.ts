import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { UILogger } from '../../utils/cli/ui'
import { CodexConfigManager } from '../config/manager'
import { startCodex } from './launcher'

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read package.json for version
const packageJsonPath = join(__dirname, '../../package.json')
let version = '1.0.0'
try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  version = packageJson.version
}
catch {
  // Fallback to default version if package.json is not found
}

export async function runCodexCLI(): Promise<void> {
  const program = new Command()
  const name = 'start-codex'

  program
    .name(name)
    .version(version)
    .description('Start OpenAI Codex CLI with configuration management')

  // Default command - start Codex
  program
    .argument('[config]', 'Configuration name to use')
    .option('--list', 'List all configurations (shortcut for "start-codex list")')
    .action(async (configName?: string, options?: { list?: boolean }) => {
      if (options?.list) {
        // Shortcut for list command
        const { handleCodexListCommand } = await import('../commands/codex/list')
        await handleCodexListCommand()
        return
      }

      const configManager = CodexConfigManager.getInstance()
      const ui = new UILogger()

      let config

      if (configName) {
        // Use specified config
        config = configManager.getConfig(configName)
        if (!config) {
          ui.displayError(`Configuration "${configName}" not found`)
          ui.displayInfo('\nAvailable configurations:')
          const configs = configManager.listConfigs()
          configs.forEach((c) => {
            console.log(`  - ${c.name}`)
          })
          process.exit(1)
        }
      }
      else {
        // Use default config
        config = configManager.getDefaultConfig()
        if (!config) {
          ui.displayError('No default configuration set')
          ui.displayInfo('\nAvailable configurations:')
          const configs = configManager.listConfigs()
          if (configs.length === 0) {
            ui.displayInfo('  (none)')
            ui.displayInfo('\nAdd a configuration with: start-codex add')
          }
          else {
            configs.forEach((c) => {
              console.log(`  - ${c.name}${c.isDefault ? ' (default)' : ''}`)
            })
            ui.displayInfo('\nSet a default with: start-codex set <name>')
          }
          process.exit(1)
        }
      }

      // Start Codex with the selected config
      const exitCode = await startCodex(config, [])
      process.exit(exitCode)
    })

  // Add command - add new configuration
  program
    .command('add')
    .description('Add a new Codex configuration')
    .action(async () => {
      const { handleCodexAddCommand } = await import('../commands/codex/add')
      await handleCodexAddCommand()
    })

  // Edit command - edit existing configuration
  program
    .command('edit <name>')
    .description('Edit an existing Codex configuration')
    .action(async (name: string) => {
      const { handleCodexEditCommand } = await import('../commands/codex/edit')
      await handleCodexEditCommand(name)
    })

  // Remove command - remove configuration
  program
    .command('remove <name>')
    .alias('rm')
    .description('Remove a Codex configuration')
    .action(async (name: string) => {
      const { handleCodexRemoveCommand } = await import('../commands/codex/remove')
      await handleCodexRemoveCommand(name)
    })

  // List command - list all configurations
  program
    .command('list')
    .alias('ls')
    .description('List all Codex configurations')
    .action(async () => {
      const { handleCodexListCommand } = await import('../commands/codex/list')
      await handleCodexListCommand()
    })

  // Set command - set default configuration
  program
    .command('set <name>')
    .description('Set default Codex configuration')
    .action(async (name: string) => {
      const { handleCodexSetCommand } = await import('../commands/codex/set')
      await handleCodexSetCommand(name)
    })

  // S3 sync commands
  const s3Command = program.command('s3').description('S3 sync operations')

  s3Command
    .command('upload')
    .description('Upload Codex configs to S3')
    .action(async () => {
      const { CodexS3SyncManager } = await import('../storage/s3-sync')
      const s3Manager = CodexS3SyncManager.getInstance()
      await s3Manager.uploadConfigs()
    })

  s3Command
    .command('download')
    .description('Download Codex configs from S3')
    .action(async () => {
      const { CodexS3SyncManager } = await import('../storage/s3-sync')
      const s3Manager = CodexS3SyncManager.getInstance()
      await s3Manager.downloadConfigs()
    })

  s3Command
    .command('test')
    .description('Test S3 connection')
    .action(async () => {
      const { CodexS3SyncManager } = await import('../storage/s3-sync')
      const s3Manager = CodexS3SyncManager.getInstance()
      await s3Manager.testConnection()
    })

  // Manager command - open web interface
  program
    .command('manage')
    .alias('manager')
    .description('Open web-based configuration manager')
    .action(async () => {
      const ui = new UILogger()
      ui.displayInfo('Opening Codex configuration manager...')
      ui.displayInfo('Note: Navigate to http://localhost:2334/codex in your browser')

      // Import and run manager command with codex mode
      const { handleManagerCommand } = await import('../../commands/manager')
      await handleManagerCommand({ defaultMode: 'codex' })
    })

  // Parse arguments
  await program.parseAsync(process.argv)
}

// Run the CLI
runCodexCLI().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
