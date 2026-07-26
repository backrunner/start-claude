import type { ClaudeConfig, SystemSettings } from '../config/types'
import type { ProgramOptions } from './common'

import process from 'node:process'
import { Command } from 'commander'
import { name, version } from '../../package.json'

import { ConfigManager } from '../config/manager'
import { SpeedTestStrategy } from '../config/types'
import { TransformerService } from '../services/transformer'
import { S3SyncManager } from '../storage/s3-sync'
import {
  checkClaudeInstallation,
  promptClaudeInstallation,
} from '../utils/cli/detection'
import { syncClaudeProviderSettings } from '../utils/claude/provider-settings'
import { UILogger } from '../utils/cli/ui'
import { hasConfigApiCredentials } from '../utils/config/credentials'
import { checkForUpdates, handleBackgroundUpgradeResult, isBackgroundUpgradeProcess, performBackgroundUpgrade, runBackgroundUpgradeWorker } from '../utils/config/update-checker'
import { McpSyncManager } from '../utils/mcp/sync-manager'
import { SpeedTestManager } from '../utils/network/speed-test'
import { StatusLineManager } from '../utils/statusline/manager'
import { handleWSLConfigDetection } from '../utils/wsl/config-detection'
import { startClaude } from './claude'
import {
  buildClaudeArgs,
  buildCliOverrides,
  filterProcessArgs,
  isDebugEnabled,
  resolveConfig,
  resolveStartConfigSelectorAsync,
} from './common'
import { handleProxyMode } from './proxy'

const program = new Command()

program.enablePositionalOptions()

const configManager = ConfigManager.getInstance()
const s3SyncManager = S3SyncManager.getInstance()
const statusLineManager = StatusLineManager.getInstance()
const mcpSyncManager = McpSyncManager.getInstance()

/**
 * Handle statusline sync on startup
 */
async function handleStatusLineSync(
  options: { verbose?: boolean } = {},
): Promise<void> {
  const ui = new UILogger(options.verbose)
  try {
    const settings = await configManager.getSettings()
    const statusLineConfig = settings.statusLine

    // Only proceed if statusline is enabled and has config
    if (!statusLineConfig?.enabled || !statusLineConfig.config) {
      ui.verbose('Statusline not enabled or no config found, skipping sync')
      return
    }

    ui.verbose('🔍 Checking statusline integration...')

    // Sync both ccstatusline config and Claude Code settings
    await statusLineManager.syncStatusLineConfig(
      statusLineConfig.config,
      options,
    )
  }
  catch (error) {
    // Don't fail the entire startup for statusline issues
    ui.verbose(
      `⚠️ Statusline sync error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Handle MCP sync on startup
 */
async function handleMcpSync(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  try {
    ui.verbose('🔍 Checking MCP configuration sync...')

    // Sync MCP settings from Claude Desktop and ~/.claude/settings.json
    await mcpSyncManager.checkAndSyncMcp(options)
  }
  catch (error) {
    // Don't fail the entire startup for MCP sync issues
    ui.verbose(`⚠️ MCP sync error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function handleClaudeProviderSettingsSync(
  config: ClaudeConfig,
  options: { verbose?: boolean } = {},
): Promise<void> {
  const ui = new UILogger(options.verbose)

  try {
    const settings = await configManager.getSettings()
    if (settings.syncClaudeProviderSettings !== true) {
      ui.verbose('Claude Code provider settings sync disabled')
      return
    }

    const result = await syncClaudeProviderSettings(config)
    if (result.backupPath) {
      ui.warning(`Conflicting Claude Code settings env backed up to: ${result.backupPath}`)
    }
    ui.verbose(`Claude Code provider settings synced: ${result.settingsPath}`)
  }
  catch (error) {
    ui.warning(`Failed to sync Claude Code provider settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Ensure migrations are run before any CLI operations
 * This runs idempotently - migrations that have already been applied will be skipped
 */
async function ensureMigrationsRun(): Promise<void> {
  try {
    // Simply loading the config will trigger migrations if needed
    // The ConfigFileManager.load() method handles all migration logic
    await configManager.load()
  }
  catch (error) {
    const ui = new UILogger()
    ui.displayError(`Failed to run migrations: ${error instanceof Error ? error.message : 'Unknown error'}`)
    // Don't exit - let the command handler deal with config errors
  }
}

program
  .name(name)
  .version(version, '-v, --version', 'Display version number')
  .description('Start Claude Code with specified configuration')
  .allowUnknownOption()
  .allowExcessArguments()

program
  .option('--config <name>', 'Use specific configuration')
  .option('--list', 'List all configurations')
  .option('--health-check', 'Perform health check on the endpoint without starting proxy server')
  .option('--add-dir <directories...>', 'Additional directories to allow tool access to')
  .option('--agent <agent>', 'Agent for the current session')
  .option('--agents <json>', 'Define custom subagents via JSON string')
  .option('--allow-dangerously-skip-permissions', 'Allow bypassing permission checks as an option')
  .option('--allowedTools, --allowed-tools <tools...>', 'Comma or space-separated list of allowed tools')
  .option('--append-system-prompt <prompt>', 'Append a system prompt')
  .option('--bare', 'Enable Claude bare mode')
  .option('--betas <betas...>', 'Beta headers to include in API requests')
  .option('--brief', 'Enable brief mode')
  .option('--chrome', 'Enable Claude in Chrome integration')
  .option('--no-chrome', 'Disable Claude in Chrome integration')
  .option('-c, --continue', 'Continue previous session')
  .option('--dangerously-skip-permissions', 'Skip permission checks (dangerous)')
  .option('-d, --debug [filter]', 'Enable debug mode with optional category filtering')
  .option('--debug-file <path>', 'Write debug logs to a specific file path')
  .option('--disable-slash-commands', 'Disable slash commands')
  .option('--disallowedTools, --disallowed-tools <tools...>', 'Comma or space-separated list of disallowed tools')
  .option('--effort <level>', 'Effort level')
  .option('--exclude-dynamic-system-prompt-sections', 'Move per-machine system prompt sections into the first user message')
  .option('--fallback-model <model>', 'Fallback model')
  .option('--file <specs...>', 'File resources to download at startup')
  .option('--fork-session', 'Fork session when resuming')
  .option('--from-pr [value]', 'Resume a session linked to a PR')
  .option('--ide', 'Automatically connect to IDE on startup')
  .option('--include-hook-events', 'Include hook lifecycle events in stream output')
  .option('--include-partial-messages', 'Include partial message chunks')
  .option('--input-format <format>', 'Input format')
  .option('--json-schema <schema>', 'JSON Schema for structured output validation')
  .option('--max-budget-usd <amount>', 'Maximum dollar amount to spend on API calls')
  .option('--max-turns <number>', 'Maximum number of turns', Number.parseInt)
  .option('--mcp-config <configs...>', 'Load MCP servers from JSON files or strings')
  .option('--mcp-debug', 'Enable MCP debug mode')
  .option('--model <model>', 'Override model for this session')
  .option('-n, --name <name>', 'Set a display name for this session')
  .option('--no-session-persistence', 'Disable session persistence')
  .option('--output-format <format>', 'Output format')
  .option('--permission-mode <mode>', 'Permission mode')
  .option('--permission-prompt-tool', 'Enable permission prompt tool')
  .option('--plugin-dir <path>', 'Load a plugin from a directory or zip', (value, previous: string[] = []) => [...previous, value])
  .option('--plugin-url <url>', 'Fetch a plugin zip from a URL', (value, previous: string[] = []) => [...previous, value])
  .option('-p, --print [query]', 'Print output to stdout with optional query')
  .option('--prompt-suggestions [value]', 'Enable prompt suggestions')
  .option('--remote-control [name]', 'Start with Remote Control enabled')
  .option('--remote-control-session-name-prefix <prefix>', 'Remote Control session name prefix')
  .option('--replay-user-messages', 'Re-emit user messages from stdin')
  .option('-r, --resume [value]', 'Resume previous session')
  .option('--safe-mode', 'Start with customizations disabled')
  .option('--session-id <uuid>', 'Use a specific session ID')
  .option('--setting-sources <sources>', 'Comma-separated setting sources')
  .option('--settings <file-or-json>', 'Path to settings JSON or JSON string')
  .option('--strict-mcp-config', 'Only use MCP servers from --mcp-config')
  .option('--system-prompt <prompt>', 'System prompt')
  .option('--tmux', 'Create a tmux session for the worktree')
  .option('--tools <tools...>', 'List of available built-in tools')
  .option('--verbose', 'Enable verbose output')
  .option('-w, --worktree [name]', 'Create a new git worktree')
  .option('--check-updates', 'Force check for updates')
  .option(
    '--force-config-check',
    'Force check for remote config updates (bypass interval limit)',
  )
  .option(
    '-e, --env <key=value>',
    'Set environment variable',
    (value, previous: string[] = []) => [...previous, value],
  )
  .option('--proxy <url>', 'Set HTTPS proxy for requests')
  .option('--api-key <key>', 'Override API key for this session')
  .option('--base-url <url>', 'Override base URL for this session')
  .argument('[config]', 'Configuration name (alternative to --config)')
  .action(async (configArg: string | undefined, options: ProgramOptions) => {
    const ui = new UILogger(options.verbose)
    const startConfigSelector = await resolveStartConfigSelectorAsync(
      process.argv.slice(2),
      {
        optionConfig: options.config,
        positionalConfig: configArg,
        configExists: async name => Boolean(await configManager.getConfig(name)),
      },
    )

    if (options.list === true) {
      ui.displayWelcome()
      const configs = await configManager.listConfigs()
      ui.displayConfigList(configs)
      return
    }

    // Handle health check mode - exit after health check
    if (options.healthCheck === true) {
      ui.displayWelcome()

      // Resolve config for health check
      const config = await resolveConfig(
        configManager,
        s3SyncManager,
        options,
        configArg,
        false,
        startConfigSelector,
      )

      if (!config) {
        ui.error('❌ No configuration found for health check')
        process.exit(1)
      }

      // Check if the config has necessary endpoint information
      if (!hasConfigApiCredentials(config)) {
        ui.error(
          `❌ Configuration "${config.name}" missing required endpoint information (baseUrl and apiKey or authToken)`,
        )
        process.exit(1)
      }

      ui.info(`🩺 Performing health check on endpoint: ${config.name}`)
      ui.info(`🌐 Base URL: ${config.baseUrl}`)

      try {
        // Create speed test manager for health check
        const speedTestManager = SpeedTestManager.fromConfig(
          SpeedTestStrategy.ResponseTime,
          {
            timeout: 10000, // 10 second timeout for health checks
            verbose: options.verbose || false,
            debug: isDebugEnabled(options),
          },
        )

        // Perform health check
        const result = await speedTestManager.testEndpointSpeed(config)

        if (result.success) {
          ui.success(`✅ Endpoint is healthy!`)
          ui.info(`📊 Response time: ${result.responseTime.toFixed(1)}ms`)
        }
        else {
          ui.error(`❌ Endpoint health check failed`)
          ui.error(`💬 Error: ${result.error}`)
          process.exit(1)
        }
      }
      catch (error) {
        ui.error(
          `❌ Health check failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
        process.exit(1)
      }

      return
    }

    // Always show welcome at the start
    ui.displayWelcome()

    // Display verbose mode status if enabled
    ui.verbose('Verbose mode enabled')

    // Check if there's a background upgrade result from previous run
    // Silent handling - only prompts after multiple consecutive failures
    try {
      await handleBackgroundUpgradeResult(ui)
    }
    catch {
      // Silently fail - upgrade result checking should never crash the CLI
    }

    // Handle WSL config detection if needed
    // This prompts the user to choose between WSL local and Windows host config
    // Only runs once on first startup in WSL when both configs exist
    try {
      await handleWSLConfigDetection({ verbose: options.verbose })
    }
    catch (error) {
      // Silently fail - config detection should never crash the CLI
      ui.verbose(`Failed WSL config detection: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    let systemSettings: SystemSettings | null = null

    // Perform multiple async operations in parallel for faster startup
    const [
      updateInfo,
      remoteUpdateResult,
      claudeCheckResult,
    ] = await Promise.allSettled([
      // Check for updates
      checkForUpdates(options.checkUpdates || configManager.needsImmediateUpdate()),

      // Check for remote config updates
      // Skip if cloud sync is enabled (cloud sync auto-syncs via filesystem, no need to check S3)
      s3SyncManager.isS3Configured().then(async (isConfigured) => {
        if (!isConfigured)
          return false
        // Skip S3 sync if cloud sync is enabled (filesystem-based sync is faster)
        if (s3SyncManager.isCloudSyncEnabled()) {
          ui.verbose('Cloud sync enabled, skipping S3 sync check')
          return false
        }
        return s3SyncManager.checkAutoSync({ verbose: options.verbose }).catch(() => false)
      }),

      // Check Claude installation
      checkClaudeInstallation(),
    ])

    // Process system settings result - get system settings for transformer check
    systemSettings = await s3SyncManager.getSystemSettings().catch(() => null)

    // Process update check result
    const updateCheckInfo = updateInfo?.status === 'fulfilled' ? updateInfo.value : null

    // Process remote update result - this tells us if S3 sync happened
    let hasS3Synced = false
    if (remoteUpdateResult.status === 'fulfilled' && remoteUpdateResult.value) {
      ui.verbose('✨ Remote configuration updated successfully')
      hasS3Synced = true
    }

    // Process Claude installation check
    const claudeCheck = claudeCheckResult.status === 'fulfilled' ? claudeCheckResult.value : { isInstalled: false }
    if (!claudeCheck.isInstalled) {
      await promptClaudeInstallation()
      process.exit(1)
    }

    // Check if we need proxy for transformer-enabled configs
    let shouldUseProxy = false
    const configName = startConfigSelector.value
    let config: ClaudeConfig | undefined

    if (configName) {
      // Check config directly without fuzzy search to avoid prompts
      config = await configManager.getConfig(configName)
      if (!config && remoteUpdateResult.status === 'fulfilled' && remoteUpdateResult.value) {
        // Config might have been updated during the remote sync
        config = await configManager.getConfig(configName)
      }
    }
    else {
      // For default config, we can check normally
      config = await configManager.getDefaultConfig()
    }

    if (TransformerService.isTransformerEnabled(config?.transformerEnabled)) {
      shouldUseProxy = true
      ui.info(
        '🔧 Auto-enabling proxy mode for transformer-enabled configuration',
      )
    }

    if (shouldUseProxy) {
      await handleProxyMode(
        configManager,
        options,
        configArg,
        systemSettings,
        undefined,
        undefined,
        startConfigSelector,
      )
      return
    }

    // Auto-update in background without user confirmation
    if (updateCheckInfo?.hasUpdate) {
      ui.verbose(`🔔 Update available: ${updateCheckInfo.currentVersion} → ${updateCheckInfo.latestVersion}`)
      ui.verbose('⏳ Starting background upgrade automatically...')

      // Start background upgrade asynchronously - no user confirmation needed
      try {
        void performBackgroundUpgrade()
        ui.verbose('✅ Background upgrade started. Results will be shown on next startup.')
      }
      catch (error) {
        // Silently fail - don't interrupt user's workflow
        ui.verbose(`Background upgrade failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    config = await resolveConfig(configManager, s3SyncManager, options, configArg, hasS3Synced, startConfigSelector)

    // Handle statusline and MCP sync in parallel for faster startup with error resilience
    try {
      await Promise.allSettled([
        handleStatusLineSync(options),
        handleMcpSync(options),
      ])
    }
    catch (error) {
      // This should rarely happen since we use allSettled, but just in case
      if (options.verbose) {
        ui.verbose(`⚠️ Sync operations completed with some issues: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    if (config) {
      ui.displayBoxedConfig(config)
      await handleClaudeProviderSettingsSync(config, options)
    }
    else {
      ui.info('🔧 No configuration found, starting Claude Code directly')
    }

    // Build arguments to pass to claude command
    const claudeArgs = buildClaudeArgs(options, config)
    const filteredArgs = filterProcessArgs(startConfigSelector)
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
  .action(async options =>
    (await import('../commands/add')).handleAddCommand(options),
  )

program
  .command('edit <name>')
  .description('Edit an existing configuration')
  .option('-e, --use-editor', 'Open configuration in editor')
  .action(async (name, options) =>
    (await import('../commands/edit')).handleEditCommand(name, options),
  )

program
  .command('remove <name>')
  .description('Remove a configuration')
  .action(async name =>
    (await import('../commands/config')).handleRemoveCommand(name),
  )

program
  .command('list')
  .description('List all configurations')
  .action(async () => (await import('../commands/config')).handleListCommand())

program
  .command('duplicate <original-name> [new-name]')
  .description('Duplicate an existing configuration with a new name')
  .action(async (originalName, newName) =>
    (await import('../commands/duplicate')).handleDuplicateCommand(originalName, newName),
  )

program
  .command('default <name>')
  .description('Set a configuration as default')
  .action(async name => (await import('../commands/config')).handleDefaultCommand(name))
program
  .command('set <name> <property> <value>')
  .description('Set a configuration property (e.g., authToken, apiKey, baseUrl)')
  .action(async (name, property, value) => (await import('../commands/config')).handleSetCommand(name, property, value))
program
  .command('get <name> [property]')
  .description('Get configuration property value or display all properties')
  .action(async (name, property) => (await import('../commands/config')).handleGetCommand(name, property))

program
  .command('switch <name>')
  .description('Switch Claude Code provider settings without starting Claude')
  .option('--verbose', 'Enable verbose output')
  .option('-p, --port <number>', 'Proxy server port (default: 2333)', '2333')
  .action(async (name, options) =>
    (await import('../commands/switch')).handleSwitchCommand(name, options),
  )

const overrideCmd = program
  .command('override')
  .description(
    'Enable Claude command override (alias "claude" to "start-claude")',
  )
  .action(async () =>
    (await import('../commands/override')).handleOverrideCommand(),
  )

overrideCmd
  .command('disable')
  .description('Disable Claude command override')
  .action(async () =>
    (await import('../commands/override')).handleOverrideDisableCommand(),
  )

overrideCmd
  .command('status')
  .description('View Claude command override status')
  .action(async () =>
    (await import('../commands/override')).handleOverrideStatusCommand(),
  )

overrideCmd
  .command('shells')
  .description('Show supported shells for override')
  .action(async () =>
    (await import('../commands/override')).handleOverrideShellsCommand(),
  )

// Setup command with subcommands
const setupCmd = program
  .command('setup')
  .description('Interactive setup wizard for start-claude configuration')
  .action(async () => (await import('../commands/setup')).handleSetupCommand())

setupCmd
  .command('statusline')
  .description('Setup statusline integration for Claude Code')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/setup')).handleSetupStatusLineCommand(options),
  )

setupCmd
  .command('s3')
  .description('Setup S3 sync configuration')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/setup')).handleSetupS3Command(options),
  )

// S3 command group with subcommands
const s3Cmd = program.command('s3').description('S3 sync operations')

s3Cmd
  .command('setup')
  .description('Setup S3 sync configuration')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/s3')).handleS3SetupCommand(options),
  )

s3Cmd
  .command('sync')
  .description('Sync configurations with S3')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/s3')).handleS3SyncCommand(options),
  )

s3Cmd
  .command('upload')
  .description('Upload local configurations to S3')
  .option('-f, --force', 'Force overwrite remote configurations')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/s3')).handleS3UploadCommand(options),
  )

s3Cmd
  .command('download')
  .description('Download configurations from S3')
  .option('-f, --force', 'Force overwrite local configurations')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/s3')).handleS3DownloadCommand(options),
  )

s3Cmd
  .command('status')
  .description('Show S3 sync status')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/s3')).handleS3StatusCommand(options),
  )

// MCP command group with subcommands
const mcpCmd = program.command('mcp').description('Manage MCP servers')

mcpCmd
  .command('add <name> [args...]')
  .description('Add a new MCP server')
  .option('--transport <type>', 'Transport type: stdio, http, or sse', 'stdio')
  .option('--scope <scope>', 'Configuration scope: local or user', 'user')
  .option('--env <key=value>', 'Environment variable (stdio only)', (value, previous: string[] = []) => [...previous, value])
  .option('--header <header>', 'HTTP header (http/sse only)', (value, previous: string[] = []) => [...previous, value])
  .option('--verbose', 'Enable verbose output')
  .allowUnknownOption()
  .action(async (name, args, options) =>
    (await import('../commands/mcp')).handleMcpAddCommand(name, args, options),
  )

mcpCmd
  .command('remove <name>')
  .description('Remove an MCP server')
  .option('--verbose', 'Enable verbose output')
  .action(async (name, options) =>
    (await import('../commands/mcp')).handleMcpRemoveCommand(name, options),
  )

mcpCmd
  .command('list')
  .description('List all MCP servers')
  .option('--verbose', 'Show detailed information')
  .action(async options =>
    (await import('../commands/mcp')).handleMcpListCommand(options),
  )

mcpCmd
  .command('get <name>')
  .description('Get details of a specific MCP server')
  .option('--verbose', 'Enable verbose output')
  .action(async (name, options) =>
    (await import('../commands/mcp')).handleMcpGetCommand(name, options),
  )

mcpCmd
  .command('add-json <name> <json>')
  .description('Add MCP server from JSON string')
  .option('--scope <scope>', 'Configuration scope: local or user', 'user')
  .option('--verbose', 'Enable verbose output')
  .action(async (name, json, options) =>
    (await import('../commands/mcp')).handleMcpAddJsonCommand(name, json, options),
  )

// Skill command group with subcommands
const skillCmd = program.command('skill').description('Manage skills')

skillCmd
  .command('list')
  .description('List all skills')
  .option('--verbose', 'Show detailed information')
  .action(async options =>
    (await import('../commands/skill')).handleSkillListCommand(options),
  )

skillCmd
  .command('show <skill-id>')
  .description('Show details of a specific skill')
  .option('--verbose', 'Enable verbose output')
  .action(async (skillId, options) =>
    (await import('../commands/skill')).handleSkillShowCommand(skillId, options),
  )

skillCmd
  .command('add')
  .description('Add a new skill')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/skill')).handleSkillAddCommand(options),
  )

skillCmd
  .command('edit <skill-id>')
  .description('Edit an existing skill')
  .option('--verbose', 'Enable verbose output')
  .action(async (skillId, options) =>
    (await import('../commands/skill')).handleSkillEditCommand(skillId, options),
  )

skillCmd
  .command('delete <skill-id>')
  .description('Delete a skill')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--verbose', 'Enable verbose output')
  .action(async (skillId, options) =>
    (await import('../commands/skill')).handleSkillDeleteCommand(skillId, options),
  )

// Agent command group with subcommands
const agentCmd = program.command('agent').description('Manage subagents')

agentCmd
  .command('list')
  .description('List all subagents')
  .option('--verbose', 'Show detailed information')
  .action(async options =>
    (await import('../commands/agent')).handleAgentListCommand(options),
  )

agentCmd
  .command('show <agent-id>')
  .description('Show details of a specific subagent')
  .option('--verbose', 'Enable verbose output')
  .action(async (agentId, options) =>
    (await import('../commands/agent')).handleAgentShowCommand(agentId, options),
  )

agentCmd
  .command('add')
  .description('Add a new subagent')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/agent')).handleAgentAddCommand(options),
  )

agentCmd
  .command('edit <agent-id>')
  .description('Edit an existing subagent')
  .option('--verbose', 'Enable verbose output')
  .action(async (agentId, options) =>
    (await import('../commands/agent')).handleAgentEditCommand(agentId, options),
  )

agentCmd
  .command('delete <agent-id>')
  .description('Delete a subagent')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--verbose', 'Enable verbose output')
  .action(async (agentId, options) =>
    (await import('../commands/agent')).handleAgentDeleteCommand(agentId, options),
  )

// Statusline command group
const statuslineCmd = program
  .command('statusline')
  .description('Statusline integration management')

statuslineCmd
  .command('setup')
  .description('Setup statusline integration for Claude Code')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/statusline')).handleStatusLineSetupCommand(
      options,
    ),
  )

statuslineCmd
  .command('disable')
  .description('Disable statusline integration')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/statusline')).handleStatusLineDisableCommand(
      options,
    ),
  )

statuslineCmd
  .command('status')
  .description('Show statusline integration status')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/statusline')).handleStatusLineStatusCommand(
      options,
    ),
  )

program
  .command('edit-config')
  .description('Edit the configuration file directly in your editor')
  .action(async () =>
    (await import('../commands/edit-config')).handleEditConfigCommand(),
  )

program
  .command('migrate')
  .description('Run configuration migrations (e.g., extract S3 config)')
  .option('--dry-run', 'Show pending migrations without applying changes')
  .option('--verbose', 'Enable verbose output')
  .option('--use-legacy-version-check', 'Use old version-based detection instead of flag system')
  .option('--force', 'Force re-run migrations (skip flag check)')
  .action(async options => (await import('../commands/migrate')).handleMigrateCommand(options))

program
  .command('manage')
  .alias('manager')
  .description('Open the Claude Configuration Manager web interface')
  .option('-p, --port <number>', 'Port to run the manager on', '2334')
  .option('--verbose', 'Enable verbose output')
  .option('--debug', 'Enable debug mode')
  .action(async options =>
    (await import('../commands/manager')).handleManagerCommand(options),
  )

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
  .action(async (subcommand, options) =>
    (await import('../commands/usage')).handleUsageCommand(subcommand, options),
  )

// Cloud sync command group (iCloud / OneDrive / Custom)
const syncCmd = program
  .command('sync')
  .description('Cloud sync operations (iCloud, OneDrive, Custom)')

syncCmd
  .command('setup')
  .description('Interactive setup for cloud sync')
  .action(async () => (await import('../commands/sync')).setupSyncCommand())

syncCmd
  .command('status')
  .description('Show cloud sync status')
  .action(async () => (await import('../commands/sync')).syncStatusCommand())

syncCmd
  .command('disable')
  .description('Disable cloud sync and restore local config')
  .action(async () => (await import('../commands/sync')).disableSyncCommand())

// Proxy command for starting proxy server with specific configs
const proxyCmd = program
  .command('proxy [config-names...]')
  .description('Start proxy server with specified configuration(s)')
  .option('--strategy <strategy>', 'Load balancer strategy: fallback, polling, or speedfirst')
  .option('--all', 'Start proxy server with all configurations')
  .option('--skip-health-check', 'Skip health checks and force use specified configs')
  .option('--verbose', 'Enable verbose output')
  .option('--debug', 'Enable debug mode')
  .option('--proxy <url>', 'Set HTTPS proxy for requests')
  .action(async (configNames, options) => (await import('../commands/proxy')).handleProxyCommand(configNames, options))

// Proxy switch subcommand
proxyCmd
  .command('switch <config-names...>')
  .description('Switch running proxy server to new configuration(s)')
  .option('--verbose', 'Enable verbose output')
  .option('--debug', 'Enable debug mode')
  .option('-p, --port <number>', 'Proxy server port (default: 2333)', '2333')
  .action(async (configNames, options) => {
    const port = Number.parseInt(options.port, 10)
    await (await import('../commands/proxy')).handleProxySwitchCommand(configNames, options, port)
  })

// Cache command group
const cacheCmd = program
  .command('cache')
  .description('Manage start-claude cache')

cacheCmd
  .command('clear')
  .description('Clear all cache (force re-check everything on next startup)')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/cache')).handleCacheClearCommand(options),
  )

cacheCmd
  .command('clear-claude')
  .description('Clear Claude installation cache only')
  .option('--verbose', 'Enable verbose output')
  .action(async options =>
    (await import('../commands/cache')).handleCacheClearClaudeCommand(options),
  )

cacheCmd
  .command('status')
  .description('Show cache status')
  .option('--verbose', 'Enable verbose output (show all cache keys)')
  .action(async options =>
    (await import('../commands/cache')).handleCacheStatusCommand(options),
  )

async function main(): Promise<void> {
  if (isBackgroundUpgradeProcess()) {
    await runBackgroundUpgradeWorker()
    return
  }

  await ensureMigrationsRun()
  program.parse()
}

main().catch((error) => {
  const ui = new UILogger()
  ui.displayError(`Fatal error during initialization: ${error instanceof Error ? error.message : 'Unknown error'}`)
  process.exit(1)
})
