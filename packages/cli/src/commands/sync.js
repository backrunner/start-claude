import process from 'node:process';
import { SyncManager } from '../sync/manager';
import { UILogger } from '../utils/cli/ui';
export async function setupSyncCommand() {
    const ui = new UILogger();
    try {
        const syncManager = new SyncManager();
        ui.displayInfo('🔄 Configuration Synchronization Setup');
        ui.displayInfo('=====================================\n');
        const result = await syncManager.setupSync();
        if (result) {
            ui.displayInfo('\n📋 Next Steps:');
            ui.displayInfo('• Your configuration is now synced across devices');
            ui.displayInfo('• Changes will be automatically synchronized');
            ui.displayInfo('• Run "start-claude sync status" to check sync health');
            ui.displayInfo('• Run "start-claude sync disable" to disable sync');
        }
    }
    catch (error) {
        ui.displayError(`❌ Failed to setup sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}
export async function syncStatusCommand() {
    const ui = new UILogger();
    try {
        const syncManager = new SyncManager();
        const status = await syncManager.getSyncStatus();
        ui.displayInfo('🔄 Sync Status');
        ui.displayInfo('==============\n');
        if (!status.isConfigured) {
            ui.displayInfo('❌ Sync is not configured');
            ui.displayInfo('Run "start-claude sync setup" to configure synchronization');
            return;
        }
        ui.displayInfo(`📊 Provider: ${status.provider}`);
        if (status.cloudPath) {
            ui.displayInfo(`📂 Cloud Path: ${status.cloudPath}`);
        }
        ui.displayInfo(`📄 Config Path: ${status.configPath}`);
        if (status.isValid) {
            ui.displayInfo('✅ Sync is working properly');
        }
        else {
            ui.displayError('❌ Sync configuration has issues:');
            status.issues.forEach((issue) => {
                ui.displayError(`  • ${issue}`);
            });
            ui.displayInfo('\nRun "start-claude sync setup" to fix these issues');
        }
    }
    catch (error) {
        ui.displayError(`❌ Failed to check sync status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}
export async function disableSyncCommand() {
    const ui = new UILogger();
    try {
        const syncManager = new SyncManager();
        ui.displayInfo('🔄 Disabling Configuration Synchronization');
        ui.displayInfo('=========================================\n');
        const result = await syncManager.disableSync();
        if (result) {
            ui.displayInfo('\n📋 Sync has been disabled:');
            ui.displayInfo('• Configuration is now stored locally only');
            ui.displayInfo('• Cloud sync link has been removed');
            ui.displayInfo('• You can re-enable sync anytime with "start-claude sync setup"');
        }
    }
    catch (error) {
        ui.displayError(`❌ Failed to disable sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}
