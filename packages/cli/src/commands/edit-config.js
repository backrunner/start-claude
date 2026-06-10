import { ConfigFileManager } from '../config/file-operations';
import { S3SyncManager } from '../storage/s3-sync';
import { editConfigFileInEditor } from '../utils/cli/editor';
import { UILogger } from '../utils/cli/ui';
export async function handleEditConfigCommand() {
    const ui = new UILogger();
    ui.displayWelcome();
    const configFileManager = ConfigFileManager.getInstance();
    ui.displayInfo('🔄 Checking for pending migrations...');
    try {
        await configFileManager.load();
        ui.displayInfo('✅ Migration check completed');
    }
    catch (error) {
        ui.displayError(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        ui.displayInfo('You may need to fix the configuration file manually.');
    }
    const configFilePath = configFileManager.getActualConfigPath();
    const fs = await import('node:fs');
    if (!fs.existsSync(configFilePath)) {
        ui.displayError('Configuration file does not exist. Create a configuration first using "start-claude add".');
        return;
    }
    ui.displayInfo('Opening configuration file in editor with live reload...');
    ui.displayInfo('Any changes you save will be automatically reloaded and synced.');
    const s3SyncManager = S3SyncManager.getInstance();
    const onConfigReload = (config) => {
        try {
            if (!config || typeof config !== 'object') {
                ui.displayError('Invalid configuration format');
                return;
            }
            s3SyncManager.autoUploadAfterChange().catch((error) => {
                ui.displayError(`Auto-sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            });
            ui.displaySuccess('✅ Configuration changes detected, validated, and synced!');
        }
        catch (error) {
            ui.displayError(`❌ Failed to process config changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };
    await editConfigFileInEditor(configFilePath, onConfigReload);
}
