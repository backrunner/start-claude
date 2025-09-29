import inquirer from 'inquirer'
import { UILogger } from '../utils/cli/ui'
import { handleS3SetupCommand } from './s3'
import { handleStatusLineSetupCommand } from './statusline'

/**
 * Handle the main setup command with interactive prompts
 */
export async function handleSetupCommand(): Promise<void> {
  const ui = new UILogger()
  ui.displayInfo('🛠️  Start-Claude Setup Wizard')
  ui.displayInfo('This wizard will help you configure your start-claude environment')

  const setupOptions = await inquirer.prompt({
    type: 'checkbox',
    name: 'setupItems',
    message: 'What would you like to set up?',
    choices: [
      {
        name: 'S3 Sync - Configure AWS S3 for configuration synchronization',
        value: 's3',
        checked: false,
      },
      {
        name: 'Status Line - Configure ccstatusline integration for Claude Code',
        value: 'statusline',
        checked: false,
      },
      {
        name: 'System Settings - Configure global system preferences',
        value: 'system',
        checked: false,
      },
    ],
    validate: (choices) => {
      if (choices.length === 0) {
        return 'Please select at least one setup option'
      }
      return true
    },
  })

  if (setupOptions.setupItems.length === 0) {
    ui.displayWarning('No setup options selected. Exiting...')
    return
  }

  // Process selected setup items
  for (const item of setupOptions.setupItems) {
    switch (item) {
      case 's3':
        ui.displayInfo('\n📦 Setting up S3 Sync...')
        await handleS3SetupCommand({ verbose: true })
        break

      case 'statusline':
        ui.displayInfo('\n📊 Setting up Status Line...')
        await handleStatusLineSetupCommand({ verbose: true })
        break

      case 'system':
        ui.displayInfo('\n⚙️  Setting up System Settings...')
        await handleSystemSetup()
        break

      default:
        ui.displayError(`Unknown setup option: ${item}`)
    }
  }

  ui.displaySuccess('\n✅ Setup completed!')
  ui.displayInfo('💡 Tip: You can run specific setup commands directly:')
  ui.displayInfo('   • start-claude setup s3         - S3 sync setup')
  ui.displayInfo('   • start-claude setup statusline - Status line setup')
  ui.displayInfo('   • start-claude s3 setup         - S3 sync setup (alternative)')
}

/**
 * Handle S3 setup as a subcommand
 */
export async function handleSetupS3Command(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayInfo('📦 Starting S3 Sync Setup...')
  await handleS3SetupCommand(options)
}

/**
 * Handle statusline setup as a subcommand
 */
export async function handleSetupStatusLineCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayInfo('📊 Starting Status Line Setup...')
  await handleStatusLineSetupCommand(options)
}

/**
 * Handle system settings setup
 */
async function handleSystemSetup(): Promise<void> {
  const ui = new UILogger()
  ui.displayInfo('Configuring system settings...')

  const systemOptions = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableLoadBalancer',
      message: 'Enable load balancer by default for all configurations?',
      default: false,
    },
    {
      type: 'list',
      name: 'defaultStrategy',
      message: 'Default load balancer strategy:',
      choices: [
        { name: 'Fallback - Priority-based with failover (recommended)', value: 'Fallback' },
        { name: 'Polling - Round-robin across all endpoints', value: 'Polling' },
        { name: 'Speed First - Route to fastest responding endpoint', value: 'Speed First' },
      ],
      default: 'Fallback',
      when: answers => answers.enableLoadBalancer,
    },
    {
      type: 'confirm',
      name: 'autoCheckUpdates',
      message: 'Automatically check for updates on startup?',
      default: true,
    },
  ])

  // Here you would typically save these settings to a system config file
  // For now, we'll just show what would be configured
  ui.displayInfo('\n📋 System configuration summary:')
  ui.displayInfo(`   Load Balancer: ${systemOptions.enableLoadBalancer ? 'Enabled' : 'Disabled'}`)

  if (systemOptions.enableLoadBalancer) {
    ui.displayInfo(`   Default Strategy: ${systemOptions.defaultStrategy}`)
  }

  ui.displayInfo(`   Auto-check Updates: ${systemOptions.autoCheckUpdates ? 'Enabled' : 'Disabled'}`)

  // TODO: Implement actual system settings persistence
  ui.displayWarning('💡 Note: System settings persistence will be implemented in a future version')
  ui.displaySuccess('✅ System settings configured!')
}
