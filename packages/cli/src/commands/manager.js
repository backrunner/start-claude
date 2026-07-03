import process from 'node:process';
import { ManagerServer } from '../core/manager-server';
import { S3SyncManager } from '../storage/s3-sync';
import { UILogger } from '../utils/cli/ui';
import { getProductDefinition, isExternalProductId } from '../products/registry';
export async function handleManagerCommand(options = {}) {
    const ui = new UILogger(options.verbose || options.debug);
    ui.displayWelcome();
    ui.displayVerbose('Verbose mode enabled for manager startup');
    const { ConfigManager } = await import('../config/manager');
    const configManager = ConfigManager.getInstance();
    ui.displayVerbose('🔄 Checking for pending migrations...');
    await configManager.load();
    ui.displayVerbose('✅ Migration check completed');
    await configManager.initializeS3Sync();
    const s3SyncManager = S3SyncManager.getInstance();
    if (await s3SyncManager.isS3Configured()) {
        ui.displayVerbose('🔄 Checking for remote S3 configuration updates...');
        await s3SyncManager.checkAutoSync({ verbose: options.verbose || options.debug });
        ui.displayVerbose('✅ S3 config check completed');
    }
    else {
        ui.displayVerbose('S3 not configured, skipping config check');
    }
    const port = options.port ? Number.parseInt(options.port) : 2334;
    const startupPath = options.defaultMode && isExternalProductId(options.defaultMode)
        ? getProductDefinition(options.defaultMode).managerPath
        : '/';
    const managerServer = new ManagerServer(port, options.debug, startupPath);
    try {
        await managerServer.start();
        process.stdin.resume();
        const cleanup = () => {
            void managerServer.stop();
        };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    }
    catch (error) {
        ui.displayError(`Failed to start manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}
