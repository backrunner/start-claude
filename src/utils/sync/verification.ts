import inquirer from 'inquirer'
import { SyncManager } from '../../sync/manager'
import { UILogger } from '../cli/ui'
import { detectExistingCloudStorageConfigs } from '../cloud-storage/detector'

/**
 * Handle configuration sync verification on startup
 */
export async function handleSyncVerification(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  try {
    ui.verbose('🔍 Verifying configuration sync status...')

    const syncManager = new SyncManager()
    const syncStatus = await syncManager.getSyncStatus()

    if (syncStatus.isConfigured) {
      ui.verbose(`📊 Sync provider: ${syncStatus.provider}`)

      if (!syncStatus.isValid) {
        ui.displayWarning('⚠️  Configuration sync issues detected')
        syncStatus.issues.forEach((issue) => {
          ui.verbose(`  • ${issue}`)
        })

        // Try to verify/fix sync in non-interactive mode
        await syncManager.verifySync()
      }
      else {
        ui.verbose('✅ Configuration sync is working properly')
      }
    }
    else {
      ui.verbose('ℹ️  Configuration sync is not configured')

      // Check if there are existing cloud storage configurations that we can auto-setup
      const existingConfigs = detectExistingCloudStorageConfigs()
      const validConfigs = existingConfigs.filter(config => config.hasValidConfig)

      if (validConfigs.length > 0) {
        ui.verbose(`🔍 Found ${validConfigs.length} existing cloud storage configuration(s)`)

        // Show the first valid config (prioritize iCloud over OneDrive if both exist)
        const selectedConfig = validConfigs.find(c => c.provider === 'icloud') || validConfigs[0]

        ui.displayInfo(`📱 Found existing Start Claude configuration in ${selectedConfig.provider === 'icloud' ? 'iCloud Drive' : 'OneDrive'}`)
        ui.displayInfo(`📂 Location: ${selectedConfig.configPath}`)

        // Ask user if they want to automatically setup sync
        const { autoSetup } = await inquirer.prompt([{
          type: 'confirm',
          name: 'autoSetup',
          message: `Would you like to automatically sync with this ${selectedConfig.provider === 'icloud' ? 'iCloud Drive' : 'OneDrive'} configuration?`,
          default: true,
        }])

        if (autoSetup) {
          const success = await syncManager.autoSetupFromCloudConfig(
            selectedConfig.provider,
            selectedConfig.path,
            selectedConfig.configPath,
          )

          if (success) {
            ui.verbose('✅ Automatic sync setup completed successfully')
          }
          else {
            ui.verbose('❌ Automatic sync setup failed')
          }
        }
        else {
          ui.verbose('ℹ️  Automatic sync setup skipped by user')
        }
      }
    }
  }
  catch (error) {
    // Don't fail the entire startup for sync issues
    ui.verbose(`⚠️ Sync verification error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
