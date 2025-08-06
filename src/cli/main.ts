import type { ClaudeConfig } from '../core/types'
import type { ProgramOptions } from './common'
import process from 'node:process'

import { Command } from 'commander'
import inquirer from 'inquirer'
import { name, version } from '../../package.json'
import { ConfigManager } from '../core/config'
import { S3SyncManager } from '../storage/s3-sync'
import { checkClaudeInstallation, promptClaudeInstallation } from '../utils/detection'
import { createConfigInEditor, editConfigFileInEditor, editConfigInEditor } from '../utils/editor'
import { displayBoxedConfig, displayConfigList, displayError, displayInfo, displaySuccess, displayWarning, displayWelcome } from '../utils/ui'
import { checkForUpdates, performAutoUpdate } from '../utils/update-checker'
import { handleBalanceMode } from './balance'
import { startClaude } from './claude'
import { buildClaudeArgs, buildCliOverrides, filterProcessArgs, resolveConfig } from './common'
import { OverrideManager } from './override'

const program = new Command()
const configManager = new ConfigManager()
const s3SyncManager = new S3SyncManager()
const overrideManager = new OverrideManager()

program
  .name(name)
  .version(version)
  .description('Start Claude Code with specified configuration')

program
  .option('--config <name>', 'Use specific configuration')
  .option('--list', 'List all configurations')
  .option('--balance', 'Start a load balancer proxy server on port 2333')
  .option('--add-dir <dir>', 'Add directory to search path', (value, previous: string[] = []) => [...previous, value])
  .option('--allowedTools <tools>', 'Comma-separated list of allowed tools', value => value.split(','))
  .option('--disallowedTools <tools>', 'Comma-separated list of disallowed tools', value => value.split(','))
  .option('-p, --print', 'Print output to stdout')
  .option('--output-format <format>', 'Output format')
  .option('--input-format <format>', 'Input format')
  .option('--verbose', 'Enable verbose output')
  .option('--max-turns <number>', 'Maximum number of turns', Number.parseInt)
  .option('--model <model>', 'Override model for this session')
  .option('--permission-mode <mode>', 'Permission mode')
  .option('--permission-prompt-tool', 'Enable permission prompt tool')
  .option('--resume', 'Resume previous session')
  .option('--continue', 'Continue previous session')
  .option('--dangerously-skip-permissions', 'Skip permission checks (dangerous)')
  .option('-e, --env <key=value>', 'Set environment variable', (value, previous: string[] = []) => [...previous, value])
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

    if (options.balance === true) {
      displayWelcome()
      await handleBalanceMode(configManager, options, configArg)
      return
    }

    // Always show welcome at the start
    displayWelcome()

    // Check for updates (non-blocking)
    const updateInfo = await checkForUpdates()
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
          displayInfo('🔄 Please restart the command to use the new version.')
          process.exit(0)
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
  .action(async (options: { useEditor?: boolean }) => {
    displayWelcome()

    if (options.useEditor) {
      const newConfig = await createConfigInEditor()
      if (newConfig) {
        // Check if config name already exists
        const existing = configManager.getConfig(newConfig.name)
        if (existing) {
          displayError('Configuration with this name already exists')
          return
        }

        if (newConfig.isDefault) {
          const configs = configManager.listConfigs()
          configs.forEach(c => c.isDefault = false)
        }

        configManager.addConfig(newConfig)
        displaySuccess(`Configuration "${newConfig.name}" added successfully!`)
      }
      return
    }

    // First ask for profile type
    const profileTypeAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'profileType',
        message: 'Profile type:',
        choices: [
          { name: 'Default (custom API settings)', value: 'default' },
          { name: 'Official (use official Claude login with proxy support)', value: 'official' },
        ],
        default: 'default',
      },
    ])

    const questions: any[] = [
      {
        type: 'input',
        name: 'name',
        message: 'Configuration name:',
        validate: (input: string) => {
          const name = input.trim()
          if (!name) {
            return 'Name is required'
          }

          const existing = configManager.getConfig(name)
          if (existing) {
            return 'Configuration with this name already exists'
          }

          return true
        },
      },
    ]

    // Add profile-specific questions
    if (profileTypeAnswer.profileType === 'default') {
      questions.push(
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Base URL (optional):',
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API Key (optional):',
          mask: '*',
        },
      )
    }
    else if (profileTypeAnswer.profileType === 'official') {
      questions.push(
        {
          type: 'input',
          name: 'httpProxy',
          message: 'HTTP Proxy (optional):',
        },
        {
          type: 'input',
          name: 'httpsProxy',
          message: 'HTTPS Proxy (optional):',
        },
      )
    }

    // Add common questions
    questions.push(
      {
        type: 'input',
        name: 'model',
        message: 'Model (optional):',
        default: '',
      },
      {
        type: 'list',
        name: 'permissionMode',
        message: 'Permission mode (optional):',
        choices: [
          { name: 'Default (ask for permissions)', value: 'default' },
          { name: 'Accept Edits (auto-accept file edits)', value: 'acceptEdits' },
          { name: 'Plan (planning mode)', value: 'plan' },
          { name: 'Bypass Permissions (dangerous)', value: 'bypassPermissions' },
          { name: 'None (use Claude default)', value: null },
        ],
        default: null,
      },
      {
        type: 'confirm',
        name: 'isDefault',
        message: 'Set as default configuration?',
        default: false,
      },
    )

    const answers = await inquirer.prompt(questions)

    const config: ClaudeConfig = {
      name: answers.name.trim(),
      profileType: profileTypeAnswer.profileType,
      baseUrl: profileTypeAnswer.profileType === 'default' ? (answers.baseUrl?.trim() || undefined) : undefined,
      apiKey: profileTypeAnswer.profileType === 'default' ? (answers.apiKey?.trim() || undefined) : undefined,
      httpProxy: profileTypeAnswer.profileType === 'official' ? (answers.httpProxy?.trim() || undefined) : undefined,
      httpsProxy: profileTypeAnswer.profileType === 'official' ? (answers.httpsProxy?.trim() || undefined) : undefined,
      model: answers.model?.trim() || undefined,
      permissionMode: answers.permissionMode || undefined,
      isDefault: answers.isDefault,
    }

    configManager.addConfig(config)

    if (config.isDefault) {
      configManager.setDefaultConfig(config.name)
    }

    displaySuccess(`Configuration "${config.name}" added successfully!`)
  })

program
  .command('edit <name>')
  .description('Edit an existing configuration')
  .option('-e, --use-editor', 'Open configuration in editor')
  .action(async (name: string, options: { useEditor?: boolean }) => {
    displayWelcome()

    const config = configManager.getConfig(name)
    if (!config) {
      displayError(`Configuration "${name}" not found`)
      process.exit(1)
    }

    if (options.useEditor) {
      const updatedConfig = await editConfigInEditor(config)
      if (updatedConfig) {
        if (updatedConfig.isDefault && !config.isDefault) {
          const configs = configManager.listConfigs()
          configs.forEach(c => c.isDefault = false)
        }

        configManager.addConfig(updatedConfig)
        displaySuccess(`Configuration "${name}" updated successfully!`)
      }
      return
    }

    // Ask for profile type (with current value as default)
    const profileTypeAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'profileType',
        message: 'Profile type:',
        choices: [
          { name: 'Default (custom API settings)', value: 'default' },
          { name: 'Official (use official Claude login with proxy support)', value: 'official' },
        ],
        default: config.profileType || 'default',
      },
    ])

    const questions: any[] = []

    // Add profile-specific questions
    if (profileTypeAnswer.profileType === 'default') {
      questions.push(
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Base URL:',
          default: config.baseUrl ?? '',
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API Key:',
          default: config.apiKey ?? '',
          mask: '*',
        },
      )
    }
    else if (profileTypeAnswer.profileType === 'official') {
      questions.push(
        {
          type: 'input',
          name: 'httpProxy',
          message: 'HTTP Proxy:',
          default: config.httpProxy ?? '',
        },
        {
          type: 'input',
          name: 'httpsProxy',
          message: 'HTTPS Proxy:',
          default: config.httpsProxy ?? '',
        },
      )
    }

    // Add common questions
    questions.push(
      {
        type: 'input',
        name: 'model',
        message: 'Model:',
        default: config.model || '',
      },
      {
        type: 'list',
        name: 'permissionMode',
        message: 'Permission mode:',
        choices: [
          { name: 'Default (ask for permissions)', value: 'default' },
          { name: 'Accept Edits (auto-accept file edits)', value: 'acceptEdits' },
          { name: 'Plan (planning mode)', value: 'plan' },
          { name: 'Bypass Permissions (dangerous)', value: 'bypassPermissions' },
          { name: 'None (use Claude default)', value: null },
        ],
        default: config.permissionMode || null,
      },
      {
        type: 'confirm',
        name: 'isDefault',
        message: 'Set as default configuration?',
        default: config.isDefault ?? false,
      },
    )

    const answers = await inquirer.prompt(questions)

    const updatedConfig: ClaudeConfig = {
      ...config,
      profileType: profileTypeAnswer.profileType,
      baseUrl: profileTypeAnswer.profileType === 'default' ? (answers.baseUrl?.trim() || undefined) : undefined,
      apiKey: profileTypeAnswer.profileType === 'default' ? (answers.apiKey?.trim() || undefined) : undefined,
      httpProxy: profileTypeAnswer.profileType === 'official' ? (answers.httpProxy?.trim() || undefined) : undefined,
      httpsProxy: profileTypeAnswer.profileType === 'official' ? (answers.httpsProxy?.trim() || undefined) : undefined,
      model: answers.model?.trim() || undefined,
      permissionMode: answers.permissionMode || undefined,
      isDefault: answers.isDefault,
    }

    configManager.addConfig(updatedConfig)

    if (updatedConfig.isDefault && !config.isDefault) {
      configManager.setDefaultConfig(updatedConfig.name)
    }

    displaySuccess(`Configuration "${name}" updated successfully!`)
  })

program
  .command('remove <name>')
  .description('Remove a configuration')
  .action(async (name: string) => {
    const config = configManager.getConfig(name)
    if (!config) {
      displayError(`Configuration "${name}" not found`)
      process.exit(1)
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to remove configuration "${name}"?`,
        default: false,
      },
    ])

    if (answers.confirm) {
      configManager.removeConfig(name)
      displaySuccess(`Configuration "${name}" removed successfully!`)
    }
    else {
      displayInfo('Operation cancelled')
    }
  })

program
  .command('list')
  .description('List all configurations')
  .action(() => {
    displayWelcome()
    const configs = configManager.listConfigs()
    displayConfigList(configs)
  })

program
  .command('default <name>')
  .description('Set a configuration as default')
  .action((name: string) => {
    const success = configManager.setDefaultConfig(name)
    if (success) {
      displaySuccess(`Configuration "${name}" set as default`)
    }
    else {
      displayError(`Configuration "${name}" not found`)
      process.exit(1)
    }
  })

program
  .command('override')
  .description('Manage Claude command override settings')
  .action(async () => {
    displayWelcome()

    const shellInfo = overrideManager.getShellInfo()
    const isActive = overrideManager.isOverrideActive()

    displayInfo(`Detected shell: ${shellInfo.shell || 'Unknown'}`)
    displayInfo(`Platform: ${shellInfo.platform}`)
    if (shellInfo.configFile) {
      displayInfo(`Config file: ${shellInfo.configFile}`)
    }
    if (shellInfo.instructions) {
      displayWarning(shellInfo.instructions)
    }

    const choices = [
      { name: `${isActive ? 'Disable' : 'Enable'} Claude command override`, value: 'toggle' },
      { name: 'View current status', value: 'view' },
      { name: 'Show supported shells', value: 'shells' },
    ]

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices,
      },
    ])

    if (answers.action === 'toggle') {
      if (isActive) {
        // Disable override
        const success = overrideManager.disableOverride()
        if (success) {
          displaySuccess('Claude command override disabled')
          displayInfo('The original "claude" command will be used')

          // Update settings
          configManager.updateSettings({ overrideClaudeCommand: false })
        }
        else {
          displayError('Failed to disable Claude command override')
        }
      }
      else {
        // Enable override
        const success = overrideManager.enableOverride()
        if (success) {
          displaySuccess('Claude command override enabled')
          displayInfo('You can now use "claude" to run start-claude')

          if (shellInfo.platform === 'windows') {
            if (shellInfo.shell === 'powershell') {
              displayWarning('Note: You may need to restart PowerShell for changes to take effect')
              displayInfo('If you get execution policy errors, run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser')
            }
            else if (shellInfo.shell === 'cmd') {
              displayWarning('Note: For Command Prompt, make sure the alias file directory is in your PATH')
            }
            else {
              displayWarning('Note: You may need to restart your shell for changes to take effect')
            }
          }
          else {
            displayWarning('Note: You may need to restart your shell or run "source ~/.bashrc" (or equivalent) for changes to take effect')
          }

          // Update settings
          configManager.updateSettings({ overrideClaudeCommand: true })
        }
        else {
          displayError('Failed to enable Claude command override')
          if (!shellInfo.shell) {
            displayError('Could not detect your shell. This feature may not be supported on your system.')
          }
        }
      }
    }
    else if (answers.action === 'view') {
      displayInfo(`Claude command override is currently ${isActive ? 'enabled' : 'disabled'}`)
      if (isActive && shellInfo.configFile) {
        displayInfo(`Override configured in: ${shellInfo.configFile}`)
      }
    }
    else if (answers.action === 'shells') {
      const supportedShells = overrideManager.getSupportedShells()
      displayInfo(`Supported shells on ${shellInfo.platform}:`)
      supportedShells.forEach((shell) => {
        displayInfo(`  - ${shell}`)
      })
    }
  })

program
  .command('s3-setup')
  .description('Setup S3 sync configuration')
  .action(async () => {
    displayWelcome()

    interface S3SetupAnswers {
      serviceType: 's3' | 'r2' | 'b2' | 'custom'
      bucket: string
      region: string
      accessKeyId: string
      secretAccessKey: string
      endpointUrl?: string
      key: string
    }

    const answers: S3SetupAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'serviceType',
        message: 'Select storage service:',
        choices: [
          { name: 'Amazon S3', value: 's3' },
          { name: 'Cloudflare R2', value: 'r2' },
          { name: 'Backblaze B2', value: 'b2' },
          { name: 'Other S3-compatible service', value: 'custom' },
        ],
        default: 's3',
      },
      {
        type: 'input',
        name: 'bucket',
        message: 'Bucket name:',
        validate: (input: string) => input.trim() ? true : 'Bucket name is required',
      },
      {
        type: 'input',
        name: 'region',
        message: (answers: Partial<S3SetupAnswers>) => {
          if (answers.serviceType === 'r2')
            return 'AWS Region (e.g., us-east-1):'
          if (answers.serviceType === 'b2')
            return 'Region (e.g., us-west-004):'
          return 'AWS Region:'
        },
        default: 'us-east-1',
        validate: (input: string) => input.trim() ? true : 'Region is required',
      },
      {
        type: 'input',
        name: 'accessKeyId',
        message: (answers: Partial<S3SetupAnswers>) => {
          if (answers.serviceType === 'r2')
            return 'R2 Token (Access Key ID):'
          if (answers.serviceType === 'b2')
            return 'Application Key ID:'
          return 'AWS Access Key ID:'
        },
        validate: (input: string) => input.trim() ? true : 'Access Key ID is required',
      },
      {
        type: 'password',
        name: 'secretAccessKey',
        message: (answers: Partial<S3SetupAnswers>) => {
          if (answers.serviceType === 'r2')
            return 'R2 Secret:'
          if (answers.serviceType === 'b2')
            return 'Application Key:'
          return 'AWS Secret Access Key:'
        },
        mask: '*',
        validate: (input: string) => input.trim() ? true : 'Secret Access Key is required',
      },
      {
        type: 'input',
        name: 'endpointUrl',
        message: (answers: Partial<S3SetupAnswers>) => {
          if (answers.serviceType === 'r2')
            return 'R2 Endpoint URL (e.g., https://abc123.r2.cloudflarestorage.com):'
          if (answers.serviceType === 'b2')
            return 'B2 Endpoint URL (optional):'
          return 'Custom endpoint URL (optional):'
        },
        when: (answers: Partial<S3SetupAnswers>) => answers.serviceType !== 's3',
        default: (answers: Partial<S3SetupAnswers>) => {
          if (answers.serviceType === 'b2') {
            return `https://s3.${answers.region}.backblazeb2.com`
          }
          return ''
        },
        validate: (input: string, answers?: Partial<S3SetupAnswers>) => {
          if ((answers?.serviceType === 'custom' || answers?.serviceType === 'r2') && !input.trim()) {
            return 'Endpoint URL is required'
          }
          return true
        },
      },
      {
        type: 'input',
        name: 'key',
        message: 'File path in bucket:',
        default: 'start-claude-config.json',
        validate: (input: string) => input.trim() ? true : 'File path is required',
      },
    ])

    const s3Config = {
      bucket: answers.bucket.trim(),
      region: answers.region.trim(),
      accessKeyId: answers.accessKeyId.trim(),
      secretAccessKey: answers.secretAccessKey.trim(),
      key: answers.key.trim(),
      endpointUrl: answers.endpointUrl?.trim() || undefined,
    }

    await s3SyncManager.setupS3Sync(s3Config)
  })

program
  .command('s3-sync')
  .description('Sync configurations with S3')
  .action(async () => {
    displayWelcome()

    if (!s3SyncManager.isS3Configured()) {
      displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
      return
    }

    await s3SyncManager.syncConfigs()
  })

program
  .command('s3-upload')
  .description('Upload local configurations to S3')
  .action(async () => {
    displayWelcome()

    if (!s3SyncManager.isS3Configured()) {
      displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
      return
    }

    await s3SyncManager.uploadConfigs()
  })

program
  .command('s3-download')
  .description('Download configurations from S3')
  .option('-f, --force', 'Force overwrite local configurations')
  .action(async (options: { force?: boolean }) => {
    displayWelcome()

    if (!s3SyncManager.isS3Configured()) {
      displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
      return
    }

    if (!options.force) {
      const localConfigs = configManager.listConfigs()
      if (localConfigs.length > 0) {
        const overwriteAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Local configurations exist. Overwrite them with remote configurations?',
            default: false,
          },
        ])

        if (!overwriteAnswer.overwrite) {
          displayInfo('Download cancelled.')
          return
        }
      }
    }

    await s3SyncManager.downloadConfigs(true)
  })

program
  .command('s3-status')
  .description('Show S3 sync status')
  .action(() => {
    displayWelcome()
    displayInfo(`S3 Sync Status: ${s3SyncManager.getS3Status()}`)
  })

program
  .command('edit-config')
  .description('Edit the configuration file directly in your editor')
  .action(async () => {
    displayWelcome()

    // Get the config file path
    const path = await import('node:path')
    const os = await import('node:os')
    const configFilePath = path.default.join(os.default.homedir(), '.start-claude', 'config.json')

    // Check if config file exists
    const fs = await import('node:fs')
    if (!fs.existsSync(configFilePath)) {
      displayError('Configuration file does not exist. Create a configuration first using "start-claude add".')
      return
    }

    displayInfo('Opening configuration file in editor with live reload...')
    displayInfo('Any changes you save will be automatically reloaded.')

    // Set up the config reload handler
    const onConfigReload = (_config: any): void => {
      // Just notify that the config was reloaded - the actual config management is handled by ConfigManager
      displayInfo('Configuration changes detected and available for next session.')
    }

    await editConfigFileInEditor(configFilePath, onConfigReload)
  })

program.parse()
