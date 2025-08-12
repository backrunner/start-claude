import type { ProgramOptions } from './common'
import process from 'node:process'

import { Command } from 'commander'
import inquirer from 'inquirer'
import { name, version } from '../../package.json'
import { handleAddCommand } from '../commands/add'
import { handleDefaultCommand, handleListCommand, handleRemoveCommand } from '../commands/config'
import { handleEditCommand } from '../commands/edit'
import { handleEditConfigCommand } from '../commands/edit-config'
import { handleManagerCommand } from '../commands/manager'
import { handleOverrideCommand } from '../commands/override'
import { handleS3DownloadCommand, handleS3SetupCommand, handleS3StatusCommand, handleS3SyncCommand, handleS3UploadCommand } from '../commands/s3'
import { ConfigManager } from '../config/manager'

import { S3SyncManager } from '../storage/s3-sync'
import { checkClaudeInstallation, promptClaudeInstallation } from '../utils/detection'
import { displayBoxedConfig, displayConfigList, displayError, displayInfo, displaySuccess, displayVerbose, displayWarning, displayWelcome } from '../utils/ui'
import { checkForUpdates, performAutoUpdate, relaunchCLI } from '../utils/update-checker'
import { startClaude } from './claude'
import { buildClaudeArgs, buildCliOverrides, filterProcessArgs, resolveConfig } from './common'
import { handleProxyMode } from './proxy'

const program = new Command()
const configManager = new ConfigManager()
const s3SyncManager = new S3SyncManager()

program
  .name(name)
  .version(version)
  .description('Start Claude Code with specified configuration')

program
  .option('--config <name>', 'Use specific configuration')
  .option('--list', 'List all configurations')
  .option('--balance', 'Start a proxy server with load balancing on port 2333')
  .option('--add-dir <dir>', 'Add directory to search path', (value, previous: string[] = []) => [...previous, value])
  .option('--allowedTools <tools>', 'Comma-separated list of allowed tools', value => value.split(','))
  .option('--disallowedTools <tools>', 'Comma-separated list of disallowed tools', value => value.split(','))
  .option('-p, --print', 'Print output to stdout')
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
  .option('--dangerously-skip-permissions', 'Skip permission checks (dangerous)')
  .option('-e, --env <key=value>', 'Set environment variable', (value, previous: string[] = []) => [...previous, value])
  .option('--proxy <url>', 'Set HTTPS proxy for requests')
  .option('--api-key <key>', 'Override API key for this session')
  .option('--base-url <url>', 'Override base URL for this session')
  .argument('[config]', 'Configuration name (alternative to --config)')
  .action(async (configArg: string | undefined, options: ProgramOptions) => {
    if (options.list === true) {
      displayWelcome()
      const configs = configManager.listConfigs()
      displayConfigList(configs)
      return
    }

    // Always show welcome at the start
    displayWelcome()

    // Display verbose mode status if enabled
    displayVerbose('Verbose mode enabled', options.verbose)

    // Check if balance mode should be enabled by default (unless explicitly disabled)
    let shouldUseProxy = options.balance === true
    let systemSettings: any = null

    if (!shouldUseProxy && options.balance !== false) {
      try {
        systemSettings = s3SyncManager.getSystemSettings()
        shouldUseProxy = systemSettings?.balanceMode?.enableByDefault === true
      }
      catch {
        // Ignore errors getting system settings, just use default behavior
      }
    }

    // If not yet using proxy, check if we need it for transformer-enabled configs
    if (!shouldUseProxy) {
      const config = await resolveConfig(configManager, s3SyncManager, options, configArg)
      if (config?.transformerEnabled === true) {
        shouldUseProxy = true
        displayInfo('🔧 Auto-enabling proxy mode for transformer-enabled configuration')
      }
    }

    if (shouldUseProxy) {
      // Get fresh system settings if we haven't already
      if (!systemSettings) {
        try {
          systemSettings = s3SyncManager.getSystemSettings()
        }
        catch {
          // Use null if we can't get settings
        }
      }
      await handleProxyMode(configManager, options, configArg, systemSettings)
      return
    }

    // Check for updates (rate limited to once per day, unless forced)
    const updateInfo = await checkForUpdates(options.checkUpdates)
    if (updateInfo?.hasUpdate) {
      displayWarning(`🔔 Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`)

      const updateAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'autoUpdate',
          message: 'Would you like to update now?',
          default: false,
        },
      ])

      if (updateAnswer.autoUpdate) {
        displayInfo('⏳ Updating start-claude...')
        const updateSuccess = await performAutoUpdate()

        if (updateSuccess) {
          displaySuccess(`✅ Successfully updated to version ${updateInfo.latestVersion}!`)
          displayInfo('🔄 Relaunching with new version...')

          // Small delay to ensure the message is displayed
          setTimeout(() => {
            relaunchCLI()
          }, 1000)
          return
        }
        else {
          displayError('❌ Failed to auto-update. Please run manually:')
          displayInfo(updateInfo.updateCommand)
          displayWarning('⚠️ Continuing with current version...')
        }
      }
    }

    const claudeCheck = await checkClaudeInstallation()
    if (!claudeCheck.isInstalled) {
      await promptClaudeInstallation()
      process.exit(1)
    }

    const config = await resolveConfig(configManager, s3SyncManager, options, configArg)

    if (config) {
      displayBoxedConfig(config)
    }
    else {
      displayInfo('🔧 No configuration found, starting Claude Code directly')
    }

    // Build arguments to pass to claude command
    const claudeArgs = buildClaudeArgs(options, config)
    const filteredArgs = filterProcessArgs(configArg)
    const allArgs = [...claudeArgs, ...filteredArgs]

    // Create CLI overrides for environment variables and API settings
    const cliOverrides = buildCliOverrides(options)

    const exitCode = await startClaude(config, allArgs, cliOverrides)
    process.exit(exitCode)
  })

program
  .command('add')
  .description('Add a new configuration')
  .option('-e, --use-editor', 'Create configuration in editor')
  .action(handleAddCommand)

program
  .command('edit <name>')
  .description('Edit an existing configuration')
  .option('-e, --use-editor', 'Open configuration in editor')
  .action(handleEditCommand)

program
  .command('remove <name>')
  .description('Remove a configuration')
  .action(handleRemoveCommand)

program
  .command('list')
  .description('List all configurations')
  .action(handleListCommand)

program
  .command('default <name>')
  .description('Set a configuration as default')
  .action(handleDefaultCommand)

program
  .command('override')
  .description('Manage Claude command override settings')
  .action(handleOverrideCommand)

program
  .command('s3-setup')
  .description('Setup S3 sync configuration')
  .action(handleS3SetupCommand)

program
  .command('s3-sync')
  .description('Sync configurations with S3')
  .action(handleS3SyncCommand)

program
  .command('s3-upload')
  .description('Upload local configurations to S3')
  .option('-f, --force', 'Force overwrite remote configurations')
  .action(handleS3UploadCommand)

program
  .command('s3-download')
  .description('Download configurations from S3')
  .option('-f, --force', 'Force overwrite local configurations')
  .action(handleS3DownloadCommand)

program
  .command('s3-status')
  .description('Show S3 sync status')
  .action(handleS3StatusCommand)

program
  .command('edit-config')
  .description('Edit the configuration file directly in your editor')
  .action(handleEditConfigCommand)

program
  .command('manage')
  .alias('manager')
  .description('Open the Claude Configuration Manager web interface')
  .option('-p, --port <number>', 'Port to run the manager on', '2334')
  .action(handleManagerCommand)

program.parse()
