import { SyncManager } from '../../sync/manager';
import { UILogger } from '../cli/ui';
import { detectExistingCloudStorageConfigs } from '../cloud-storage/detector';
import { isWSL } from '../system/path-utils';
function getProviderDisplayName(provider) {
    switch (provider) {
        case 'icloud':
            return 'iCloud Drive';
        case 'onedrive':
            return 'OneDrive';
        case 'wsl-host':
            return 'Windows Host';
        case 'custom':
            return 'Custom Folder';
        default:
            return provider;
    }
}
export async function handleSyncVerification(options = {}) {
    const ui = new UILogger(options.verbose);
    try {
        ui.verbose('🔍 Verifying configuration sync status...');
        const syncManager = new SyncManager();
        const syncStatus = await syncManager.getSyncStatus();
        if (syncStatus.isConfigured) {
            ui.verbose(`📊 Sync provider: ${syncStatus.provider}`);
            if (!syncStatus.isValid) {
                ui.displayWarning('⚠️  Configuration sync issues detected');
                syncStatus.issues.forEach((issue) => {
                    ui.verbose(`  • ${issue}`);
                });
                await syncManager.verifySync();
            }
            else {
                ui.verbose('✅ Configuration sync is working properly');
            }
        }
        else {
            ui.verbose('ℹ️  Configuration sync is not configured');
            if (isWSL()) {
                ui.verbose('WSL environment detected, skipping cloud storage detection (handled by WSL config detection)');
                return;
            }
            const existingConfigs = detectExistingCloudStorageConfigs();
            const validConfigs = existingConfigs.filter(config => config.hasValidConfig);
            if (validConfigs.length > 0) {
                ui.verbose(`🔍 Found ${validConfigs.length} existing cloud storage configuration(s)`);
                const selectedConfig = validConfigs.find(c => c.provider === 'icloud') || validConfigs[0];
                const providerName = getProviderDisplayName(selectedConfig.provider);
                ui.displayInfo(`📱 Found existing Start Claude configuration in ${providerName}`);
                ui.displayInfo(`📂 Location: ${selectedConfig.configPath}`);
                const inquirer = await import('inquirer');
                const { autoSetup } = await inquirer.default.prompt([{
                        type: 'confirm',
                        name: 'autoSetup',
                        message: `Would you like to automatically sync with this ${providerName} configuration?`,
                        default: true,
                    }]);
                if (autoSetup) {
                    const success = await syncManager.autoSetupFromCloudConfig(selectedConfig.provider, selectedConfig.path, selectedConfig.configPath);
                    if (success) {
                        ui.displaySuccess('✅ Automatic sync setup completed successfully');
                    }
                    else {
                        ui.verbose('❌ Automatic sync setup failed');
                    }
                }
                else {
                    ui.verbose('ℹ️  Automatic sync setup skipped by user');
                }
            }
        }
    }
    catch (error) {
        ui.verbose(`⚠️ Sync verification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
