import type { ClaudeConfig } from './types'
import process from 'node:process'
import { Command } from 'commander'

import inquirer from 'inquirer'
import { name, version } from '../package.json'
import { startClaude } from './claude'
import { ConfigManager } from './config'
import { checkClaudeInstallation, promptClaudeInstallation } from './detection'
import { displayConfigList, displayError, displayInfo, displaySuccess, displayWarning, displayWelcome } from './ui'

const program = new Command()
const configManager = new ConfigManager()

interface ProgramOptions {
  config?: string
  list?: boolean
}

program
  .name(name)
  .version(version)
  .description('Start Claude Code with specified configuration')

program
  .option('-c, --config <name>', 'Use specific configuration')
  .option('--list', 'List all configurations')
  .action(async (options: ProgramOptions) => {
    if (options.list === true) {
      displayWelcome()
      const configs = configManager.listConfigs()
      displayConfigList(configs)
      return
    }

    const claudeCheck = await checkClaudeInstallation()
    if (!claudeCheck.isInstalled) {
      displayWelcome()
      await promptClaudeInstallation()
      process.exit(1)
    }

    let config: ClaudeConfig | undefined

    if (options.config !== undefined) {
      config = configManager.getConfig(options.config)
      if (!config) {
        displayError(`Configuration "${options.config}" not found`)
        process.exit(1)
      }
    }
    else {
      config = configManager.getDefaultConfig()

      if (!config) {
        const configs = configManager.listConfigs()

        if (configs.length === 0) {
          displayWelcome()
          displayWarning('No configurations found. Let\'s create your first one!')

          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'Configuration name:',
              validate: input => (input).trim() ? true : 'Name is required',
            },
            {
              type: 'input',
              name: 'description',
              message: 'Description (optional):',
            },
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
            {
              type: 'input',
              name: 'model',
              message: 'Model (optional):',
              default: 'claude-sonnet-4-20250514',
            },
            {
              type: 'confirm',
              name: 'isDefault',
              message: 'Set as default configuration?',
              default: true,
            },
          ])

          const newConfig: ClaudeConfig = {
            name: (answers.name as string).trim(),
            description: (answers.description as string)?.trim() || undefined,
            baseUrl: (answers.baseUrl as string)?.trim() || undefined,
            apiKey: (answers.apiKey as string)?.trim() || undefined,
            model: (answers.model as string)?.trim() || undefined,
            isDefault: answers.isDefault as boolean,
          }

          configManager.addConfig(newConfig)
          displaySuccess(`Configuration "${newConfig.name}" created successfully!`)
          config = newConfig
        }
        else {
          displayWelcome()
          displayInfo('Choose a configuration to use:')

          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedConfig',
              message: 'Select configuration:',
              choices: configs.map(c => ({
                name: `${c.name}${c.isDefault ? ' (default)' : ''} - ${c.description ?? 'No description'}`,
                value: c.name,
              })),
            },
          ])

          config = configManager.getConfig(answers.selectedConfig as string)
        }
      }
    }

    if (config) {
      displayInfo(`Using configuration: ${config.name}`)
      const args = process.argv.slice(2).filter(arg => !arg.startsWith('-c') && arg !== '--config' && arg !== options.config)
      const exitCode = await startClaude(config, args)
      process.exit(exitCode)
    }
  })

program
  .command('add')
  .description('Add a new configuration')
  .action(async () => {
    displayWelcome()

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Configuration name:',
        validate: (input) => {
          const name = (input).trim()
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
      {
        type: 'input',
        name: 'description',
        message: 'Description (optional):',
      },
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
      {
        type: 'input',
        name: 'model',
        message: 'Model (optional):',
        default: 'claude-sonnet-4-20250514',
      },
      {
        type: 'confirm',
        name: 'isDefault',
        message: 'Set as default configuration?',
        default: false,
      },
    ])

    const config: ClaudeConfig = {
      name: (answers.name as string).trim(),
      description: (answers.description as string)?.trim() || undefined,
      baseUrl: (answers.baseUrl as string)?.trim() || undefined,
      apiKey: (answers.apiKey as string)?.trim() || undefined,
      model: (answers.model as string)?.trim() || undefined,
      isDefault: answers.isDefault as boolean,
    }

    if (config.isDefault) {
      const configs = configManager.listConfigs()
      configs.forEach(c => c.isDefault = false)
    }

    configManager.addConfig(config)
    displaySuccess(`Configuration "${config.name}" added successfully!`)
  })

program
  .command('edit <name>')
  .description('Edit an existing configuration')
  .action(async (name: string) => {
    displayWelcome()

    const config = configManager.getConfig(name)
    if (!config) {
      displayError(`Configuration "${name}" not found`)
      process.exit(1)
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: config.description ?? '',
      },
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
      {
        type: 'input',
        name: 'model',
        message: 'Model:',
        default: (config.model ?? 'claude-sonnet-4-20250514') as string,
      },
      {
        type: 'confirm',
        name: 'isDefault',
        message: 'Set as default configuration?',
        default: config.isDefault ?? false,
      },
    ])

    const updatedConfig: ClaudeConfig = {
      ...config,
      description: (answers.description as string)?.trim() || undefined,
      baseUrl: (answers.baseUrl as string)?.trim() || undefined,
      apiKey: (answers.apiKey as string)?.trim() || undefined,
      model: (answers.model as string)?.trim() || undefined,
      isDefault: answers.isDefault as boolean,
    }

    if (updatedConfig.isDefault && !config.isDefault) {
      const configs = configManager.listConfigs()
      configs.forEach(c => c.isDefault = false)
    }

    configManager.addConfig(updatedConfig)
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

    if (answers.confirm as boolean) {
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

    const settings = configManager.getSettings()

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: `${settings.overrideClaudeCommand ? 'Disable' : 'Enable'} Claude command override`, value: 'toggle' },
          { name: 'View current status', value: 'view' },
        ],
      },
    ])

    if (answers.action === 'toggle') {
      const newValue = !settings.overrideClaudeCommand
      configManager.updateSettings({ overrideClaudeCommand: newValue })

      if (newValue) {
        displaySuccess('Claude command override enabled')
        displayInfo('You can now use "claude" to run start-claude')
        displayWarning('Note: You may need to restart your shell or run "hash -r" for changes to take effect')
      }
      else {
        displaySuccess('Claude command override disabled')
        displayInfo('The original "claude" command will be used')
      }
    }
    else {
      displayInfo(`Claude command override is currently ${settings.overrideClaudeCommand ? 'enabled' : 'disabled'}`)
    }
  })

program.parse()
