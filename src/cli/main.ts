import type { ClaudeConfig } from '../config/types'
import type { ProgramOptions } from './common'

import process from 'node:process'
import { Command } from 'commander'
import inquirer from 'inquirer'
import { name, version } from '../../package.json'

import { ConfigManager } from '../config/manager'
import { TransformerService } from '../services/transformer'
import { S3SyncManager } from '../storage/s3-sync'
import { checkClaudeInstallation, promptClaudeInstallation } from '../utils/cli/detection'
import { UILogger } from '../utils/cli/ui'
import { checkForUpdates, performAutoUpdate, relaunchCLI } from '../utils/config/update-checker'
import { StatusLineManager } from '../utils/statusline/manager'
import { handleSyncVerification } from '../utils/sync/verification'
import { startClaude } from './claude'
import { buildClaudeArgs, buildCliOverrides, filterProcessArgs, parseBalanceStrategy, resolveConfig } from './common'
import { handleProxyMode } from './proxy'

const program = new Command()

program.enablePositionalOptions()

const configManager = ConfigManager.getInstance()
const s3SyncManager = S3SyncManager.getInstance()
const statusLineManager = StatusLineManager.getInstance()

// Initialize S3 sync for the config manager
configManager.initializeS3Sync().catch(console.error)

/**
 * Handle statusline sync on startup
 */
async function handleStatusLineSync(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  try {
    const settings = await configManager.getSettings()
    const statusLineConfig = settings.statusLine

    // Only proceed if statusline is enabled and has config
    if (!statusLineConfig?.enabled || !statusLineConfig.config) {
      if (options.verbose) {
        ui.verbose('Statusline not enabled or no config found, skipping sync')
      }
      return
    }

    if (options.verbose) {
      ui.verbose('🔍 Checking statusline integration...')
    }

    // Sync both ccstatusline config and Claude Code settings
    await statusLineManager.syncStatusLineConfig(statusLineConfig.config, { verbose: options.verbose, silent: !options.verbose })
  }
  catch (error) {
    // Don't fail the entire startup for statusline issues
    if (options.verbose) {
      ui.verbose(`⚠️ Statusline sync error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

program
  .name(name)
  .version(version, '-v, --version', 'Display version number')
  .description('Start Claude Code with specified configuration')

program
  .option('--config <name>', 'Use specific configuration')
  .option('--list', 'List all configurations')
  .option('--balance [strategy]', 'Start a proxy server with load balancing on port 2333. Strategies: fallback (priority-based), polling (round-robin), speedfirst (fastest response)')
  .option('--add-dir <dir>', 'Add directory to search path', (value, previous: string[] = []) => [...previous, value])
  .option('--allowedTools <tools>', 'Comma-separated list of allowed tools', value => value.split(','))
  .option('--disallowedTools <tools>', 'Comma-separated list of disallowed tools', value => value.split(','))
  .option('-p, --print [query]', 'Print output to stdout with optional query')
  .option('--output-format <format>', 'Output format')
  .option('--input-format <format>', 'Input format')
  .option('--verbose', 'Enable verbose output')
  .option('--debug', 'Enable debug mode')
  .option('--max-turns <number>', 'Maximum number of turns', Number.parseInt)
  .option('--model <model>', 'Override model for this session')
  .option('--permission-mode <mode>', 'Permission mode')
  .option('--permission-prompt-tool', 'Enable permission prompt tool')
  .option('--resume', 'Resume previous session')
  .option('--continue', 'Continue previous session')
  .option('--check-updates', 'Force check for updates')
  .option('--force-config-check', 'Force check for remote config updates (bypass interval limit)')
  .option('--dangerously-skip-permissions', 'Skip permission checks (dangerous)')
  .option('-e, --env <key=value>', 'Set environment variable', (value, previous: string[] = []) => [...previous, value])
  .option('--proxy <url>', 'Set HTTPS proxy for requests')
  .option('--api-key <key>', 'Override API key for this session')
  .option('--base-url <url>', 'Override base URL for this session')
  .argument('[config]', 'Configuration name (alternative to --config)')
  .action(async (configArg: string | undefined, options: ProgramOptions) => {
    const ui = new UILogger(options.verbose)

    if (options.list === true) {
      ui.displayWelcome()
      const configs = await configManager.listConfigs()
      ui.displayConfigList(configs)
      return
    }

    // Always show welcome at the start
    ui.displayWelcome()

    // Display verbose mode status if enabled
    ui.verbose('Verbose mode enabled')

    // Parse balance strategy from CLI options
    const balanceConfig = parseBalanceStrategy(options.balance)
    let shouldUseProxy = balanceConfig.enabled
    const cliStrategy = balanceConfig.strategy
    let systemSettings: unknown = null

    // Display strategy info if CLI strategy was provided
    if (cliStrategy && typeof options.balance === 'string') {
      ui.info(`🎯 Using ${cliStrategy} load balancer strategy`)
    }

    if (!shouldUseProxy && options.balance !== false) {
      try {
        systemSettings = await s3SyncManager.getSystemSettings()
        if (systemSettings && typeof systemSettings === 'object' && 'balanceMode' in systemSettings) {
          const balanceMode = (systemSettings as { balanceMode?: { enableByDefault?: boolean } }).balanceMode
          shouldUseProxy = balanceMode?.enableByDefault === true
        }
      }
      catch {
        // Ignore errors getting system settings, just use default behavior
      }
    }

    // If not yet using proxy, check if we need it for transformer-enabled configs
    // We check config existence without triggering fuzzy search prompts to avoid double confirmation
    if (!shouldUseProxy) {
      const configName = options.config || configArg
      let config: ClaudeConfig | undefined

      if (configName) {
        // Check config directly without fuzzy search to avoid prompts
        config = await configManager.getConfig(configName)
        if (!config) {
          // If config not found locally, check S3 silently
          if (await s3SyncManager.isS3Configured()) {
            const syncSuccess = await s3SyncManager.checkAutoSync({ verbose: options.verbose, silent: !options.verbose })
            if (syncSuccess) {
              config = await configManager.getConfig(configName)
            }
          }
        }
      }
      else {
        // For default config, we can check normally
        config = await configManager.getDefaultConfig()
      }

      if (TransformerService.isTransformerEnabled(config?.transformerEnabled)) {
        shouldUseProxy = true
        ui.info('🔧 Auto-enabling proxy mode for transformer-enabled configuration')
      }
    }

    // Check for updates (rate limited to once per day, unless forced)
    // First check if an immediate update is needed due to outdated CLI
    const needsImmediateUpdate = configManager.needsImmediateUpdate()
    const updateInfo = await checkForUpdates(options.checkUpdates || needsImmediateUpdate)

    // Check for remote config updates (once per day, unless forced)
    let remoteUpdateResult = false
    if (await s3SyncManager.isS3Configured()) {
      remoteUpdateResult = await s3SyncManager.checkAutoSync({ verbose: options.verbose, silent: !options.verbose })
      if (remoteUpdateResult && options.verbose) {
        ui.verbose('✨ Remote configuration updated successfully')
      }
    }

    if (shouldUseProxy) {
      // Get fresh system settings if we haven't already
      if (!systemSettings) {
        try {
          systemSettings = await s3SyncManager.getSystemSettings()
        }
        catch {
          // Use null if we can't get settings
        }
      }
      await handleProxyMode(configManager, options, configArg, systemSettings, undefined, cliStrategy)
      return
    }

    if (updateInfo?.hasUpdate) {
      ui.warning(`🔔 Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`)

      const updateAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'autoUpdate',
          message: 'Would you like to update now?',
          default: needsImmediateUpdate, // Default to Y if immediate update is needed
        },
      ])

      if (updateAnswer.autoUpdate) {
        ui.info('⏳ Updating start-claude...')
        const updateResult = await performAutoUpdate()

        if (updateResult.success) {
          ui.success(`✅ Successfully updated to version ${updateInfo.latestVersion}!`)
          ui.info('🔄 Relaunching with new version...')

          // Small delay to ensure the message is displayed
          setTimeout(() => {
            relaunchCLI()
          }, 1000)
          return
        }
        else {
          ui.error('❌ Failed to auto-update. Please run manually:')
          ui.error(updateInfo.updateCommand)
          if (updateResult.error) {
            ui.error(`Error details: ${updateResult.error}`)
          }
          ui.warning('⚠️ Continuing with current version...')
        }
      }
    }

    const claudeCheck = await checkClaudeInstallation()
    if (!claudeCheck.isInstalled) {
      await promptClaudeInstallation()
      process.exit(1)
    }

    const config = await resolveConfig(configManager, s3SyncManager, options, configArg)

    // Handle configuration sync verification
    await handleSyncVerification(options)

    // Handle statusline sync after S3 sync
    await handleStatusLineSync(options)

    if (config) {
      ui.displayBoxedConfig(config)
    }
    else {
      ui.info('🔧 No configuration found, starting Claude Code directly')
    }

    // Build arguments to pass to claude command
    const claudeArgs = buildClaudeArgs(options, config)
    const filteredArgs = filterProcessArgs(configArg)
    const allArgs = [...claudeArgs, ...filteredArgs]

    // Create CLI overrides for environment variables and API settings
    const cliOverrides = buildCliOverrides(options)

    ui.info('🚀 Claude Code is starting...')

    const exitCode = await startClaude(config, allArgs, cliOverrides)
    process.exit(exitCode)
  })

program
  .command('add')
  .description('Add a new configuration')
  .option('-e, --use-editor', 'Create configuration in editor')
  .action(async options => (await import('../commands/add')).handleAddCommand(options))

program
  .command('edit <name>')
  .description('Edit an existing configuration')
  .option('-e, --use-editor', 'Open configuration in editor')
  .action(async (name, options) => (await import('../commands/edit')).handleEditCommand(name, options))

program
  .command('remove <name>')
  .description('Remove a configuration')
  .action(async name => (await import('../commands/config')).handleRemoveCommand(name))

program
  .command('list')
  .description('List all configurations')
  .action(async () => (await import('../commands/config')).handleListCommand())

program
  .command('default <name>')
  .description('Set a configuration as default')
  .action(async name => (await import('../commands/config')).handleDefaultCommand(name))

const overrideCmd = program
  .command('override')
  .description('Enable Claude command override (alias "claude" to "start-claude")')
  .action(async () => (await import('../commands/override')).handleOverrideCommand())

overrideCmd
  .command('disable')
  .description('Disable Claude command override')
  .action(async () => (await import('../commands/override')).handleOverrideDisableCommand())

overrideCmd
  .command('status')
  .description('View Claude command override status')
  .action(async () => (await import('../commands/override')).handleOverrideStatusCommand())

overrideCmd
  .command('shells')
  .description('Show supported shells for override')
  .action(async () => (await import('../commands/override')).handleOverrideShellsCommand())

// Setup command with subcommands
const setupCmd = program
  .command('setup')
  .description('Interactive setup wizard for start-claude configuration')
  .action(async () => (await import('../commands/setup')).handleSetupCommand())

setupCmd
  .command('statusline')
  .description('Setup statusline integration for Claude Code')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/setup')).handleSetupStatusLineCommand(options))

setupCmd
  .command('s3')
  .description('Setup S3 sync configuration')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/setup')).handleSetupS3Command(options))

setupCmd
  .command('sync')
  .description('Setup configuration synchronization with cloud storage')
  .action(async () => (await import('../commands/sync')).setupSyncCommand())

// S3 command group with subcommands
const s3Cmd = program
  .command('s3')
  .description('S3 sync operations')

s3Cmd
  .command('setup')
  .description('Setup S3 sync configuration')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/s3')).handleS3SetupCommand(options))

s3Cmd
  .command('sync')
  .description('Sync configurations with S3')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/s3')).handleS3SyncCommand(options))

s3Cmd
  .command('upload')
  .description('Upload local configurations to S3')
  .option('-f, --force', 'Force overwrite remote configurations')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/s3')).handleS3UploadCommand(options))

s3Cmd
  .command('download')
  .description('Download configurations from S3')
  .option('-f, --force', 'Force overwrite local configurations')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/s3')).handleS3DownloadCommand(options))

s3Cmd
  .command('status')
  .description('Show S3 sync status')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/s3')).handleS3StatusCommand(options))

// Statusline command group
const statuslineCmd = program
  .command('statusline')
  .description('Statusline integration management')

statuslineCmd
  .command('setup')
  .description('Setup statusline integration for Claude Code')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/statusline')).handleStatusLineSetupCommand(options))

statuslineCmd
  .command('disable')
  .description('Disable statusline integration')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/statusline')).handleStatusLineDisableCommand(options))

statuslineCmd
  .command('status')
  .description('Show statusline integration status')
  .option('--verbose', 'Enable verbose output')
  .action(async options => (await import('../commands/statusline')).handleStatusLineStatusCommand(options))

// Sync command group
const syncCmd = program
  .command('sync')
  .description('Configuration synchronization management')

syncCmd
  .command('setup')
  .description('Setup configuration synchronization with cloud storage')
  .action(async () => (await import('../commands/sync')).setupSyncCommand())

syncCmd
  .command('status')
  .description('Show configuration sync status')
  .action(async () => (await import('../commands/sync')).syncStatusCommand())

syncCmd
  .command('disable')
  .description('Disable configuration synchronization')
  .action(async () => (await import('../commands/sync')).disableSyncCommand())

// Legacy S3 commands with deprecation warnings
function createDeprecatedS3Command(
  command: string,
  newCommand: string,
  description: string,
  handler: (options: any) => Promise<void>,
): Command {
  return program
    .command(command)
    .description(`${description} (DEPRECATED: use 'start-claude ${newCommand}')`)
    .option('--verbose', 'Enable verbose output')
    .option('-f, --force', 'Force overwrite configurations', false)
    .action(async (options) => {
      const ui = new UILogger()
      ui.warning(`⚠️  WARNING: 'start-claude ${command}' is deprecated.`)
      ui.warning(`   Please use 'start-claude ${newCommand}' instead.`)
      ui.warning(`   The old command will be removed in a future version.\n`)
      await handler(options)
    })
}

createDeprecatedS3Command('s3-setup', 's3 setup', 'Setup S3 sync configuration', async options => (await import('../commands/s3')).handleS3SetupCommand(options))
createDeprecatedS3Command('s3-sync', 's3 sync', 'Sync configurations with S3', async options => (await import('../commands/s3')).handleS3SyncCommand(options))
createDeprecatedS3Command('s3-upload', 's3 upload', 'Upload local configurations to S3', async options => (await import('../commands/s3')).handleS3UploadCommand(options))
createDeprecatedS3Command('s3-download', 's3 download', 'Download configurations from S3', async options => (await import('../commands/s3')).handleS3DownloadCommand(options))
createDeprecatedS3Command('s3-status', 's3 status', 'Show S3 sync status', async options => (await import('../commands/s3')).handleS3StatusCommand(options))

program
  .command('edit-config')
  .description('Edit the configuration file directly in your editor')
  .action(async () => (await import('../commands/edit-config')).handleEditConfigCommand())

program
  .command('manage')
  .alias('manager')
  .description('Open the Claude Configuration Manager web interface')
  .option('-p, --port <number>', 'Port to run the manager on', '2334')
  .option('--verbose', 'Enable verbose output')
  .option('--debug', 'Enable debug mode')
  .action(async options => (await import('../commands/manager')).handleManagerCommand(options))

// Usage command with subcommands
program
  .command('usage [subcommand]')
  .description('Show Claude Code usage statistics via ccusage')
  .option('--since <date>', 'Filter from date (YYYYMMDD)')
  .option('--until <date>', 'Filter to date (YYYYMMDD)')
  .option('--json', 'JSON output')
  .option('--breakdown', 'Per-model cost breakdown')
  .option('--timezone <tz>', 'Use specific timezone')
  .option('--locale <locale>', 'Use specific locale for date/time formatting')
  .option('--instances', 'Group by project/instance')
  .option('--project <name>', 'Filter to specific project')
  .option('--live', 'Real-time usage dashboard (for blocks command)')
  .action(async (subcommand, options) => (await import('../commands/usage')).handleUsageCommand(subcommand, options))

program.parse()
