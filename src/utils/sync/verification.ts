import inquirer from 'inquirer'
import { SyncManager } from '../../sync/manager'
import { displayInfo, displayVerbose, displayWarning } from '../cli/ui'
import { detectExistingCloudStorageConfigs } from '../cloud-storage/detector'

/**
 * Handle configuration sync verification on startup
 */
export async function handleSyncVerification(options: { verbose?: boolean } = {}): Promise<void> {
  try {
    displayVerbose('🔍 Verifying configuration sync status...', options.verbose)

    const syncManager = new SyncManager()
    const syncStatus = syncManager.getSyncStatus()

    if (syncStatus.isConfigured) {
      displayVerbose(`📊 Sync provider: ${syncStatus.provider}`, options.verbose)

      if (!syncStatus.isValid) {
        displayWarning('⚠️  Configuration sync issues detected')
        syncStatus.issues.forEach((issue) => {
          displayVerbose(`  • ${issue}`, options.verbose)
        })

        // Try to verify/fix sync in non-interactive mode
        await syncManager.verifySync()
      }
      else {
        displayVerbose('✅ Configuration sync is working properly', options.verbose)
      }
    }
    else {
      displayVerbose('ℹ️  Configuration sync is not configured', options.verbose)

      // Check if there are existing cloud storage configurations that we can auto-setup
      const existingConfigs = detectExistingCloudStorageConfigs()
      const validConfigs = existingConfigs.filter(config => config.hasValidConfig)

      if (validConfigs.length > 0) {
        displayVerbose(`🔍 Found ${validConfigs.length} existing cloud storage configuration(s)`, options.verbose)

        // Show the first valid config (prioritize iCloud over OneDrive if both exist)
        const selectedConfig = validConfigs.find(c => c.provider === 'icloud') || validConfigs[0]

        displayInfo(`📱 Found existing Start Claude configuration in ${selectedConfig.provider === 'icloud' ? 'iCloud Drive' : 'OneDrive'}`)
        displayInfo(`📂 Location: ${selectedConfig.configPath}`)

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
            displayVerbose('✅ Automatic sync setup completed successfully', options.verbose)
          }
          else {
            displayVerbose('❌ Automatic sync setup failed', options.verbose)
          }
        }
        else {
          displayVerbose('ℹ️  Automatic sync setup skipped by user', options.verbose)
        }
      }
    }
  }
  catch (error) {
    // Don't fail the entire startup for sync issues
    displayVerbose(`⚠️ Sync verification error: ${error instanceof Error ? error.message : 'Unknown error'}`, options.verbose)
  }
}
