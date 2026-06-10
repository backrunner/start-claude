import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import inquirer from 'inquirer';
import { S3SyncManager } from '../storage/s3-sync';
import { UILogger } from '../utils/cli/ui';
import { detectWindowsCloudSync, getAvailableCloudServices, getCloudStorageStatus } from '../utils/cloud-storage/detector';
import { isWSL } from '../utils/system/path-utils';
export class SyncManager {
    s3SyncManager;
    configDir;
    configFile;
    syncConfigFile;
    ui;
    constructor() {
        this.s3SyncManager = new S3SyncManager();
        this.configDir = join(homedir(), '.start-claude');
        this.configFile = join(this.configDir, 'config.json');
        this.syncConfigFile = join(this.configDir, 'sync.json');
        this.ui = new UILogger();
    }
    hasConfigContent(configPath) {
        try {
            if (!existsSync(configPath)) {
                return false;
            }
            const content = readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);
            return Array.isArray(config.configs) && config.configs.length > 0;
        }
        catch {
            return false;
        }
    }
    async verifyDirectoryPermission(dirPath, providerName) {
        const testFileName = `.start-claude-permission-test-${Date.now()}`;
        const testFilePath = join(dirPath, testFileName);
        try {
            writeFileSync(testFilePath, 'permission-test', 'utf-8');
            const content = readFileSync(testFilePath, 'utf-8');
            if (content !== 'permission-test') {
                this.ui.displayError(`❌ Permission verification failed: Could not verify written content`);
                return false;
            }
            unlinkSync(testFilePath);
            return true;
        }
        catch (error) {
            try {
                if (existsSync(testFilePath)) {
                    unlinkSync(testFilePath);
                }
            }
            catch {
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (errorMessage.includes('EPERM') || errorMessage.includes('EACCES')) {
                this.ui.displayError(`❌ Permission denied when accessing ${providerName}`);
                if (process.platform === 'darwin') {
                    this.ui.displayInfo('💡 On macOS, you may need to grant Full Disk Access to your terminal app:');
                    this.ui.displayInfo('   System Settings → Privacy & Security → Full Disk Access');
                    this.ui.displayInfo('   Add your terminal application (Terminal.app, iTerm2, etc.)');
                }
            }
            else {
                this.ui.displayError(`❌ Failed to verify ${providerName} permission: ${errorMessage}`);
            }
            return false;
        }
    }
    async setupSync() {
        try {
            this.ui.displayInfo('🔄 Setting up configuration synchronization...\n');
            if (isWSL()) {
                const windowsSync = detectWindowsCloudSync();
                if (windowsSync.hasSync) {
                    this.ui.displayInfo(`🪟 Detected that Windows is using ${windowsSync.provider} sync`);
                    const { useWindowsSync } = await inquirer.prompt([{
                            type: 'confirm',
                            name: 'useWindowsSync',
                            message: `Would you like to use the same ${windowsSync.provider} sync in WSL?`,
                            default: true,
                        }]);
                    if (useWindowsSync) {
                        if (windowsSync.provider === 'icloud' || windowsSync.provider === 'onedrive') {
                            return await this.setupCloudSync(windowsSync.provider);
                        }
                        else if (windowsSync.provider === 'custom' && windowsSync.cloudPath) {
                            const syncConfig = {
                                enabled: true,
                                provider: 'custom',
                                customPath: windowsSync.cloudPath,
                                linkedAt: new Date().toISOString(),
                            };
                            this.saveSyncConfig(syncConfig);
                            await this.updateS3Settings(true);
                            this.ui.displaySuccess(`✅ Successfully configured custom folder sync (same as Windows)!`);
                            this.ui.displayInfo(`📂 Custom path: ${windowsSync.cloudPath}`);
                            return true;
                        }
                    }
                    this.ui.displayInfo('Continuing with sync setup...\n');
                }
            }
            const currentStatus = await this.getSyncStatus();
            if (currentStatus.isConfigured) {
                this.ui.displayWarning('⚠️  Sync is already configured!');
                this.ui.displayInfo(`Current provider: ${currentStatus.provider}`);
                if (currentStatus.cloudPath) {
                    this.ui.displayInfo(`Current path: ${currentStatus.cloudPath}`);
                }
                const { reconfigure } = await inquirer.prompt([{
                        type: 'confirm',
                        name: 'reconfigure',
                        message: 'Do you want to reconfigure sync?',
                        default: false,
                    }]);
                if (!reconfigure) {
                    return false;
                }
                const disableResult = await this.disableSync();
                if (!disableResult) {
                    this.ui.displayError('❌ Failed to disable existing sync configuration');
                    return false;
                }
            }
            const options = await this.getSyncOptions();
            if (options.length === 0) {
                this.ui.displayError('❌ No sync options available');
                return false;
            }
            const { provider } = await inquirer.prompt([{
                    type: 'list',
                    name: 'provider',
                    message: 'Choose a sync provider:',
                    choices: options,
                }]);
            switch (provider) {
                case 'icloud':
                    return await this.setupCloudSync('icloud');
                case 'onedrive':
                    return await this.setupCloudSync('onedrive');
                case 'wsl-host':
                    return await this.setupWSLHostSync();
                case 'custom':
                    return await this.setupCustomSync();
                case 's3':
                    return await this.setupS3Sync();
                default:
                    this.ui.displayError(`❌ Unknown provider: ${provider}`);
                    return false;
            }
        }
        catch (error) {
            this.ui.displayError(`❌ Failed to setup sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async getSyncOptions() {
        const options = [];
        const cloudServices = getAvailableCloudServices();
        for (const service of cloudServices) {
            if (service.isEnabled) {
                if (service.name === 'Windows Host') {
                    options.push({
                        name: '🪟 Windows Host - Sync with Windows host config (WSL)',
                        value: 'wsl-host',
                    });
                }
                else if (service.name === 'iCloud') {
                    options.push({
                        name: '☁️  iCloud Drive - Sync via iCloud Drive',
                        value: 'icloud',
                    });
                }
                else if (service.name === 'OneDrive') {
                    options.push({
                        name: '📁 OneDrive - Sync via Microsoft OneDrive',
                        value: 'onedrive',
                    });
                }
            }
        }
        options.push({
            name: '📂 Custom Folder - Sync to a custom directory',
            value: 'custom',
        });
        try {
            const s3Status = await this.s3SyncManager.getS3Status();
            if (s3Status.includes('Not configured')) {
                options.push({
                    name: '🗄️  S3 Storage - Configure S3 sync',
                    value: 's3',
                });
            }
            else {
                options.push({
                    name: `🗄️  S3 Storage - ${s3Status}`,
                    value: 's3',
                });
            }
        }
        catch (error) {
            this.ui.displayVerbose(`S3 config error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            options.push({
                name: '🗄️  S3 Storage - Configure S3 sync (invalid config detected)',
                value: 's3',
            });
        }
        return options;
    }
    async setupCloudSync(provider) {
        try {
            const cloudStatus = getCloudStorageStatus();
            const serviceInfo = provider === 'icloud' ? cloudStatus.iCloud : cloudStatus.oneDrive;
            const providerName = provider === 'icloud' ? 'iCloud' : 'OneDrive';
            if (!serviceInfo.isEnabled || !serviceInfo.path) {
                this.ui.displayError(`❌ ${providerName} is not properly configured`);
                return false;
            }
            this.ui.displayInfo(`📁 Setting up sync with ${providerName}...`);
            this.ui.displayInfo(`Cloud path: ${serviceInfo.path}`);
            this.ui.displayInfo(`🔐 Verifying ${providerName} access permission...`);
            const hasPermission = await this.verifyDirectoryPermission(serviceInfo.path, providerName);
            if (!hasPermission) {
                this.ui.displayError(`❌ Cannot access ${providerName}. Please grant the necessary permissions and try again.`);
                return false;
            }
            this.ui.displaySuccess(`✅ ${providerName} access verified`);
            const cloudConfigDir = join(serviceInfo.path, '.start-claude');
            const cloudConfigFile = join(cloudConfigDir, 'config.json');
            if (!existsSync(cloudConfigDir)) {
                mkdirSync(cloudConfigDir, { recursive: true });
                this.ui.displayInfo(`📁 Created directory: ${cloudConfigDir}`);
            }
            const localHasContent = this.hasConfigContent(this.configFile);
            const remoteExists = existsSync(cloudConfigFile);
            const remoteHasContent = this.hasConfigContent(cloudConfigFile);
            if (!localHasContent && !remoteHasContent) {
                this.ui.displayWarning(`⚠️  No configuration content found in ${providerName}`);
                if (remoteExists) {
                    this.ui.displayInfo(`(The config file exists in ${providerName} but contains no configurations)`);
                }
                this.ui.displayInfo('This could mean:');
                this.ui.displayInfo('  1. This is a new setup and no config exists yet');
                this.ui.displayInfo(`  2. ${providerName} sync hasn't finished downloading files yet`);
                const { action } = await inquirer.prompt([{
                        type: 'list',
                        name: 'action',
                        message: 'What would you like to do?',
                        choices: [
                            {
                                name: '📄 Create/use empty configuration and continue setup',
                                value: 'create',
                            },
                            {
                                name: `⏳ Wait for ${providerName} to sync (cancel and try again later)`,
                                value: 'wait',
                            },
                        ],
                    }]);
                if (action === 'wait') {
                    this.ui.displayInfo(`Please wait for ${providerName} to finish syncing, then run this command again.`);
                    return false;
                }
                if (!remoteExists) {
                    const emptyConfig = { version: 1, configs: [], settings: { overrideClaudeCommand: false } };
                    writeFileSync(cloudConfigFile, JSON.stringify(emptyConfig, null, 2));
                    this.ui.displayInfo('📄 Created new config in cloud folder');
                }
            }
            else if (localHasContent && !remoteHasContent) {
                this.ui.displayWarning(`⚠️  No configuration content in ${providerName}, but you have local configurations`);
                if (remoteExists) {
                    this.ui.displayInfo(`(The config file exists in ${providerName} but contains no configurations)`);
                }
                this.ui.displayInfo('This could mean:');
                this.ui.displayInfo(`  1. ${providerName} sync hasn't finished downloading your existing cloud config`);
                this.ui.displayInfo('  2. This is a new cloud setup and your local config should be uploaded');
                const { action } = await inquirer.prompt([{
                        type: 'list',
                        name: 'action',
                        message: 'What would you like to do?',
                        choices: [
                            {
                                name: `📤 Upload local config to ${providerName} (overwrites any pending cloud data)`,
                                value: 'upload',
                            },
                            {
                                name: `⏳ Wait for ${providerName} to sync (cancel and try again later)`,
                                value: 'wait',
                            },
                        ],
                    }]);
                if (action === 'wait') {
                    this.ui.displayInfo(`Please wait for ${providerName} to finish syncing, then run this command again.`);
                    return false;
                }
                await this.moveConfigToCloud(this.configFile, cloudConfigFile);
            }
            else if (!localHasContent && remoteHasContent) {
                this.ui.displaySuccess('📥 Found existing configuration in cloud');
                this.ui.displayInfo('Will use cloud configuration');
            }
            else {
                const resolved = await this.resolveConfigConflict(this.configFile, cloudConfigFile);
                if (!resolved) {
                    return false;
                }
            }
            await this.syncAllConfigFilesToCloud(serviceInfo.path);
            const syncConfig = {
                enabled: true,
                provider,
                cloudPath: serviceInfo.path,
                linkedAt: new Date().toISOString(),
            };
            this.saveSyncConfig(syncConfig);
            await this.updateS3Settings(true);
            this.ui.displaySuccess(`✅ Successfully configured ${provider} sync!`);
            this.ui.displayInfo(`📂 Config file: ${cloudConfigFile}`);
            this.ui.displayInfo(`🔗 Config is now synced via ${provider}`);
            return true;
        }
        catch (error) {
            this.ui.displayError(`❌ Failed to setup ${provider} sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async setupWSLHostSync() {
        try {
            const cloudStatus = getCloudStorageStatus();
            const windowsHostInfo = cloudStatus.windowsHost;
            if (!windowsHostInfo || !windowsHostInfo.isEnabled || !windowsHostInfo.path) {
                this.ui.displayError('❌ Windows host config is not accessible');
                return false;
            }
            const windowsConfigDir = join(windowsHostInfo.path, '.start-claude');
            const windowsConfigFile = join(windowsConfigDir, 'config.json');
            this.ui.displayInfo('🪟 Setting up sync with Windows host...');
            this.ui.displayInfo(`Windows path: ${windowsHostInfo.path}`);
            this.ui.displayInfo(`Config path: ${windowsConfigFile}`);
            const localHasContent = this.hasConfigContent(this.configFile);
            const windowsExists = existsSync(windowsConfigFile);
            const windowsHasContent = this.hasConfigContent(windowsConfigFile);
            if (!localHasContent && windowsHasContent) {
                this.ui.displaySuccess('📥 Found existing configuration on Windows host');
                this.ui.displayInfo('Will use Windows host configuration');
            }
            else if (localHasContent && !windowsHasContent) {
                this.ui.displayWarning('⚠️  WSL has configurations but Windows host does not');
                if (windowsExists) {
                    this.ui.displayInfo('(The config file exists on Windows but contains no configurations)');
                }
                const { action } = await inquirer.prompt([{
                        type: 'list',
                        name: 'action',
                        message: 'What would you like to do?',
                        choices: [
                            {
                                name: '📤 Copy WSL config to Windows host',
                                value: 'copy',
                            },
                            {
                                name: '⏳ Wait for Windows sync to complete (cancel and try again later)',
                                value: 'wait',
                            },
                            {
                                name: '❌ Cancel setup',
                                value: 'cancel',
                            },
                        ],
                    }]);
                if (action === 'cancel' || action === 'wait') {
                    if (action === 'wait') {
                        this.ui.displayInfo('Please wait for Windows sync to finish, then run this command again.');
                    }
                    else {
                        this.ui.displayInfo('Setup cancelled');
                    }
                    return false;
                }
                if (!existsSync(windowsConfigDir)) {
                    mkdirSync(windowsConfigDir, { recursive: true });
                    this.ui.displayInfo(`📁 Created directory: ${windowsConfigDir}`);
                }
                copyFileSync(this.configFile, windowsConfigFile);
                this.ui.displaySuccess('📤 Copied WSL config to Windows host');
            }
            else if (localHasContent && windowsHasContent) {
                const resolved = await this.resolveConfigConflict(this.configFile, windowsConfigFile);
                if (!resolved) {
                    return false;
                }
            }
            else {
                this.ui.displayWarning('⚠️  No configuration content found on Windows host or in WSL');
                if (windowsExists) {
                    this.ui.displayInfo('(The config file exists on Windows but contains no configurations)');
                }
                this.ui.displayInfo('This could mean:');
                this.ui.displayInfo('  1. This is a new setup and no config exists yet');
                this.ui.displayInfo('  2. Windows sync hasn\'t finished downloading files yet');
                const { action } = await inquirer.prompt([{
                        type: 'list',
                        name: 'action',
                        message: 'What would you like to do?',
                        choices: [
                            {
                                name: '📄 Create/use empty configuration and continue setup',
                                value: 'create',
                            },
                            {
                                name: '⏳ Wait for sync to complete (cancel and try again later)',
                                value: 'wait',
                            },
                        ],
                    }]);
                if (action === 'wait') {
                    this.ui.displayInfo('Please wait for Windows sync to finish, then run this command again.');
                    return false;
                }
                if (!windowsExists) {
                    if (!existsSync(windowsConfigDir)) {
                        mkdirSync(windowsConfigDir, { recursive: true });
                        this.ui.displayInfo(`📁 Created directory: ${windowsConfigDir}`);
                    }
                    const emptyConfig = { version: 1, configs: [], settings: { overrideClaudeCommand: false } };
                    writeFileSync(windowsConfigFile, JSON.stringify(emptyConfig, null, 2));
                    this.ui.displayInfo('📄 Created new config on Windows host');
                }
            }
            const syncConfig = {
                enabled: true,
                provider: 'wsl-host',
                cloudPath: windowsHostInfo.path,
                linkedAt: new Date().toISOString(),
            };
            this.saveSyncConfig(syncConfig);
            await this.updateS3Settings(true);
            this.ui.displaySuccess('✅ Successfully configured WSL host sync!');
            this.ui.displayInfo(`📂 Config file: ${windowsConfigFile}`);
            this.ui.displayInfo(`🔗 Config is now synced with Windows host`);
            this.ui.displayInfo(`💡 Changes on Windows will be reflected in WSL automatically`);
            return true;
        }
        catch (error) {
            this.ui.displayError(`❌ Failed to setup WSL host sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async setupCustomSync() {
        try {
            const { customPath } = await inquirer.prompt([{
                    type: 'input',
                    name: 'customPath',
                    message: 'Enter the custom sync folder path:',
                    validate: (input) => {
                        if (!input.trim())
                            return 'Path cannot be empty';
                        const fullPath = resolve(input.trim());
                        try {
                            if (existsSync(fullPath)) {
                                const stats = statSync(fullPath);
                                if (!stats.isDirectory()) {
                                    return 'Path must be a directory';
                                }
                            }
                            return true;
                        }
                        catch {
                            return 'Invalid path';
                        }
                    },
                }]);
            const resolvedPath = resolve(customPath.trim());
            const customConfigDir = join(resolvedPath, '.start-claude');
            const customConfigFile = join(customConfigDir, 'config.json');
            this.ui.displayInfo('📁 Setting up custom folder sync...');
            this.ui.displayInfo(`Custom path: ${resolvedPath}`);
            this.ui.displayInfo('🔐 Verifying folder access permission...');
            const hasPermission = await this.verifyDirectoryPermission(resolvedPath, 'custom folder');
            if (!hasPermission) {
                this.ui.displayError('❌ Cannot access the custom folder. Please check permissions and try again.');
                return false;
            }
            this.ui.displaySuccess('✅ Folder access verified');
            if (!existsSync(customConfigDir)) {
                mkdirSync(customConfigDir, { recursive: true });
                this.ui.displayInfo(`📁 Created directory: ${customConfigDir}`);
            }
            const localHasContent = this.hasConfigContent(this.configFile);
            const remoteExists = existsSync(customConfigFile);
            const remoteHasContent = this.hasConfigContent(customConfigFile);
            if (!localHasContent && !remoteHasContent) {
                this.ui.displayWarning('⚠️  No configuration content found in custom folder');
                if (remoteExists) {
                    this.ui.displayInfo('(The config file exists but contains no configurations)');
                }
                this.ui.displayInfo('This could mean:');
                this.ui.displayInfo('  1. This is a new setup and no config exists yet');
                this.ui.displayInfo('  2. If this is a cloud-synced folder, sync may not have completed');
                const { action } = await inquirer.prompt([{
                        type: 'list',
                        name: 'action',
                        message: 'What would you like to do?',
                        choices: [
                            {
                                name: '📄 Create/use empty configuration and continue setup',
                                value: 'create',
                            },
                            {
                                name: '⏳ Wait for sync to complete (cancel and try again later)',
                                value: 'wait',
                            },
                        ],
                    }]);
                if (action === 'wait') {
                    this.ui.displayInfo('Please wait for sync to finish, then run this command again.');
                    return false;
                }
                if (!remoteExists) {
                    const emptyConfig = { version: 1, configs: [], settings: { overrideClaudeCommand: false } };
                    writeFileSync(customConfigFile, JSON.stringify(emptyConfig, null, 2));
                    this.ui.displayInfo('📄 Created new config in custom folder');
                }
            }
            else if (localHasContent && !remoteHasContent) {
                this.ui.displayWarning('⚠️  No configuration content in custom folder, but you have local configurations');
                if (remoteExists) {
                    this.ui.displayInfo('(The config file exists but contains no configurations)');
                }
                this.ui.displayInfo('This could mean:');
                this.ui.displayInfo('  1. If this is a cloud-synced folder, sync may not have completed');
                this.ui.displayInfo('  2. This is a new setup and your local config should be uploaded');
                const { action } = await inquirer.prompt([{
                        type: 'list',
                        name: 'action',
                        message: 'What would you like to do?',
                        choices: [
                            {
                                name: '📤 Upload local config to custom folder (overwrites any pending data)',
                                value: 'upload',
                            },
                            {
                                name: '⏳ Wait for sync to complete (cancel and try again later)',
                                value: 'wait',
                            },
                        ],
                    }]);
                if (action === 'wait') {
                    this.ui.displayInfo('Please wait for sync to finish, then run this command again.');
                    return false;
                }
                await this.moveConfigToCloud(this.configFile, customConfigFile);
            }
            else if (!localHasContent && remoteHasContent) {
                this.ui.displaySuccess('📥 Found existing configuration in custom folder');
                this.ui.displayInfo('Will use custom folder configuration');
            }
            else {
                const resolved = await this.resolveConfigConflict(this.configFile, customConfigFile);
                if (!resolved) {
                    return false;
                }
            }
            const syncConfig = {
                enabled: true,
                provider: 'custom',
                customPath: resolvedPath,
                linkedAt: new Date().toISOString(),
            };
            this.saveSyncConfig(syncConfig);
            await this.updateS3Settings(true);
            this.ui.displaySuccess('✅ Successfully configured custom folder sync!');
            this.ui.displayInfo(`📂 Config file: ${customConfigFile}`);
            this.ui.displayInfo(`🔗 Config is now synced via custom folder`);
            return true;
        }
        catch (error) {
            this.ui.displayError(`❌ Failed to setup custom sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async setupS3Sync() {
        try {
            this.ui.displayInfo('🗄️  Setting up S3 sync...');
            const { handleS3SetupCommand } = await import('../commands/s3');
            await handleS3SetupCommand({ verbose: false });
            if (await this.s3SyncManager.isS3Configured()) {
                const syncConfig = {
                    enabled: true,
                    provider: 's3',
                    linkedAt: new Date().toISOString(),
                };
                this.saveSyncConfig(syncConfig);
                this.ui.displaySuccess('✅ Successfully configured S3 sync!');
            }
            return await this.s3SyncManager.isS3Configured();
        }
        catch (error) {
            this.ui.displayError(`❌ Failed to setup S3 sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async moveConfigToCloud(localPath, cloudPath) {
        try {
            const backupPath = `${localPath}.backup.${Date.now()}`;
            copyFileSync(localPath, backupPath);
            this.ui.displayInfo(`💾 Created backup: ${backupPath}`);
            copyFileSync(localPath, cloudPath);
            this.ui.displaySuccess(`📤 Moved configuration to cloud storage`);
            if (!existsSync(cloudPath)) {
                throw new Error('Failed to verify cloud config file');
            }
            this.ui.displayInfo(`✅ Configuration is now stored in cloud`);
            this.ui.displayInfo(`💾 Local backup available at: ${backupPath}`);
        }
        catch (error) {
            throw new Error(`Failed to move config to cloud: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async resolveConfigConflict(localPath, remotePath) {
        try {
            this.ui.displayWarning('⚠️  Configuration files exist in both locations');
            const localContent = readFileSync(localPath, 'utf-8');
            const remoteContent = readFileSync(remotePath, 'utf-8');
            const localConfig = JSON.parse(localContent);
            const remoteConfig = JSON.parse(remoteContent);
            const localStat = statSync(localPath);
            const remoteStat = statSync(remotePath);
            const localMtime = localStat.mtime.getTime();
            const remoteMtime = remoteStat.mtime.getTime();
            this.ui.displayInfo(`\n📊 Configuration comparison:`);
            this.ui.displayInfo(`  Local configs: ${localConfig.configs?.length || 0}`);
            this.ui.displayInfo(`  Remote configs: ${remoteConfig.configs?.length || 0}`);
            this.ui.displayInfo(`  Local modified: ${localStat.mtime.toISOString()}`);
            this.ui.displayInfo(`  Remote modified: ${remoteStat.mtime.toISOString()}`);
            const { resolution } = await inquirer.prompt([{
                    type: 'list',
                    name: 'resolution',
                    message: 'How would you like to resolve this conflict?',
                    choices: [
                        {
                            name: '📥 Use remote configuration (cloud version)',
                            value: 'remote',
                        },
                        {
                            name: '📤 Use local configuration (overwrite cloud)',
                            value: 'local',
                        },
                        {
                            name: '🔄 Smart merge (beta - combine both configurations)',
                            value: 'merge',
                        },
                        {
                            name: '❌ Cancel setup',
                            value: 'cancel',
                        },
                    ],
                }]);
            if (resolution === 'cancel') {
                this.ui.displayInfo('Setup cancelled');
                return false;
            }
            const backupPath = `${localPath}.backup.${Date.now()}`;
            copyFileSync(localPath, backupPath);
            this.ui.displayInfo(`💾 Created backup: ${backupPath}`);
            if (resolution === 'remote') {
                this.ui.displaySuccess('📥 Using remote configuration from cloud');
                return true;
            }
            else if (resolution === 'local') {
                copyFileSync(localPath, remotePath);
                this.ui.displaySuccess('📤 Local configuration copied to cloud (remote overwritten)');
                return true;
            }
            else if (resolution === 'merge') {
                return await this.smartMergeConfigs(localConfig, remoteConfig, localPath, remotePath, backupPath, localMtime, remoteMtime);
            }
            return false;
        }
        catch (error) {
            this.ui.displayError(`Failed to resolve conflict: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    mergeConfigsByUuid(localConfigs, remoteConfigs, localMtime, remoteMtime) {
        const localMap = new Map();
        const remoteMap = new Map();
        const noIdConfigs = [];
        localConfigs.forEach((config) => {
            if (config.id) {
                localMap.set(config.id, config);
            }
            else {
                noIdConfigs.push({ ...config, source: 'local' });
            }
        });
        remoteConfigs.forEach((config) => {
            if (config.id) {
                remoteMap.set(config.id, config);
            }
            else {
                noIdConfigs.push({ ...config, source: 'remote' });
            }
        });
        const mergedConfigs = [];
        const allUuids = new Set([...localMap.keys(), ...remoteMap.keys()]);
        allUuids.forEach((uuid) => {
            const localConfig = localMap.get(uuid);
            const remoteConfig = remoteMap.get(uuid);
            if (localConfig && remoteConfig) {
                if (localMtime > remoteMtime) {
                    mergedConfigs.push({ ...localConfig, _mergeReason: 'local-newer' });
                    this.ui.displayInfo(`  • Config "${localConfig.name}" (${uuid.substring(0, 8)}): using local (newer)`);
                }
                else if (remoteMtime > localMtime) {
                    mergedConfigs.push({ ...remoteConfig, _mergeReason: 'remote-newer' });
                    this.ui.displayInfo(`  • Config "${remoteConfig.name}" (${uuid.substring(0, 8)}): using remote (newer)`);
                }
                else {
                    mergedConfigs.push({ ...remoteConfig, _mergeReason: 'remote-same-time' });
                    this.ui.displayInfo(`  • Config "${remoteConfig.name}" (${uuid.substring(0, 8)}): using remote (same time)`);
                }
            }
            else if (localConfig) {
                mergedConfigs.push({ ...localConfig, _mergeReason: 'local-only' });
                this.ui.displayInfo(`  • Config "${localConfig.name}" (${uuid.substring(0, 8)}): from local only`);
            }
            else if (remoteConfig) {
                mergedConfigs.push({ ...remoteConfig, _mergeReason: 'remote-only' });
                this.ui.displayInfo(`  • Config "${remoteConfig.name}" (${uuid.substring(0, 8)}): from remote only`);
            }
        });
        noIdConfigs.forEach((config) => {
            const { source, ...configWithoutSource } = config;
            mergedConfigs.push({ ...configWithoutSource, _mergeReason: `${source}-no-id` });
            this.ui.displayInfo(`  • Config "${config.name}" (no ID): from ${source}`);
        });
        return mergedConfigs.map(({ _mergeReason, ...config }) => config);
    }
    async smartMergeConfigs(localConfig, remoteConfig, localPath, remotePath, backupPath, localMtime, remoteMtime) {
        try {
            this.ui.displayInfo('🔄 Performing UUID-aware smart merge...');
            const mergedConfigs = this.mergeConfigsByUuid(localConfig.configs || [], remoteConfig.configs || [], localMtime, remoteMtime);
            const { resolveConfigConflicts } = await import('../utils/config/conflict-resolver');
            const mergedConfigFile = {
                ...remoteConfig,
                configs: mergedConfigs,
                version: Math.max(localConfig.version || 1, remoteConfig.version || 1),
            };
            const resolution = resolveConfigConflicts(localConfig, mergedConfigFile, {
                autoResolve: true,
                preferLocal: false,
            });
            if (resolution.hasConflicts) {
                this.ui.displayInfo(`\n📋 Merge details:`);
                this.ui.displayInfo(`  Conflicts found: ${resolution.conflicts.length}`);
                this.ui.displayInfo(`  Resolution strategy: ${resolution.resolutionStrategy}`);
                if (resolution.resolutionDetails.length > 0) {
                    this.ui.displayInfo(`\n🔍 Resolution details:`);
                    resolution.resolutionDetails.slice(0, 5).forEach((detail) => {
                        this.ui.displayInfo(`  • ${detail}`);
                    });
                    if (resolution.resolutionDetails.length > 5) {
                        this.ui.displayInfo(`  ... and ${resolution.resolutionDetails.length - 5} more`);
                    }
                }
            }
            const { confirmMerge } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirmMerge',
                    message: 'Apply the merged configuration?',
                    default: true,
                }]);
            if (!confirmMerge) {
                this.ui.displayInfo('❌ Merge cancelled');
                return false;
            }
            const mergedContent = JSON.stringify(resolution.resolvedConfig, null, 2);
            writeFileSync(remotePath, mergedContent);
            this.ui.displaySuccess('✅ Configurations merged successfully!');
            this.ui.displayInfo(`📊 Merged result: ${resolution.resolvedConfig.configs?.length || 0} configurations`);
            this.ui.displayInfo(`💾 Original local backup: ${backupPath}`);
            return true;
        }
        catch (error) {
            this.ui.displayError(`Smart merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.ui.displayInfo('You can manually resolve the conflict by choosing "Use remote" or "Use local"');
            return false;
        }
    }
    async syncAllConfigFilesToCloud(cloudPath) {
        try {
            const cloudConfigDir = join(cloudPath, '.start-claude');
            const localS3Config = join(this.configDir, 's3-config.json');
            const cloudS3Config = join(cloudConfigDir, 's3-config.json');
            if (existsSync(localS3Config)) {
                const backupPath = `${localS3Config}.backup.${Date.now()}`;
                copyFileSync(localS3Config, backupPath);
                copyFileSync(localS3Config, cloudS3Config);
                this.ui.displayInfo(`📤 Synced S3 config to cloud (backup: ${backupPath})`);
            }
            const localMigrationFlags = join(this.configDir, 'migration-flags.json');
            const cloudMigrationFlags = join(cloudConfigDir, 'migration-flags.json');
            if (existsSync(localMigrationFlags)) {
                const backupPath = `${localMigrationFlags}.backup.${Date.now()}`;
                copyFileSync(localMigrationFlags, backupPath);
                copyFileSync(localMigrationFlags, cloudMigrationFlags);
                this.ui.displayInfo(`📤 Synced migration flags to cloud (backup: ${backupPath})`);
            }
        }
        catch (error) {
            this.ui.displayWarning(`⚠️  Failed to sync additional config files: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async updateS3Settings(cloudSyncEnabled) {
        if (await this.s3SyncManager.isS3Configured()) {
            this.ui.displayInfo(cloudSyncEnabled
                ? '📤 S3 will be used for backup (upload only) when cloud sync is enabled'
                : '🔄 S3 sync restored to full sync mode');
        }
    }
    async disableSync() {
        try {
            const syncConfig = this.getSyncConfig();
            if (!syncConfig?.enabled) {
                this.ui.displayInfo('ℹ️  Sync is not currently enabled');
                return true;
            }
            const cloudPath = syncConfig.cloudPath || syncConfig.customPath;
            const providerName = syncConfig.provider === 'icloud'
                ? 'iCloud'
                : syncConfig.provider === 'onedrive'
                    ? 'OneDrive'
                    : syncConfig.provider === 'wsl-host'
                        ? 'Windows Host'
                        : syncConfig.provider === 's3'
                            ? 'S3'
                            : 'Custom Folder';
            this.ui.displayInfo(`📋 Current sync configuration:`);
            this.ui.displayInfo(`   Provider: ${providerName}`);
            if (cloudPath) {
                this.ui.displayInfo(`   Cloud path: ${cloudPath}`);
            }
            const localExists = existsSync(this.configFile);
            const localHasContent = this.hasConfigContent(this.configFile);
            const cloudConfigFile = cloudPath ? join(cloudPath, '.start-claude', 'config.json') : null;
            const cloudExists = cloudConfigFile ? existsSync(cloudConfigFile) : false;
            const cloudHasContent = cloudConfigFile ? this.hasConfigContent(cloudConfigFile) : false;
            if (localHasContent && !cloudHasContent) {
                this.ui.displayInfo('');
                this.ui.displayWarning('⚠️  WARNING: The cloud config is empty but you have local configurations!');
                this.ui.displayInfo('   This could mean cloud sync hasn\'t finished downloading your data.');
                this.ui.displayInfo('   If you proceed with "Copy cloud config to local", you may lose your configurations.');
            }
            this.ui.displayInfo('');
            this.ui.displayWarning('⚠️  Disabling sync will:');
            this.ui.displayInfo('   • Remove the sync link');
            if (cloudHasContent) {
                this.ui.displayInfo('   • Copy current cloud config to local storage');
            }
            else if (cloudExists) {
                this.ui.displayInfo('   • Note: Cloud config exists but contains no configurations');
            }
            this.ui.displayInfo('   • Your local config will no longer sync with the cloud');
            const { action } = await inquirer.prompt([{
                    type: 'list',
                    name: 'action',
                    message: 'How would you like to handle your configuration?',
                    choices: [
                        ...(cloudHasContent
                            ? [{
                                    name: '📥 Copy cloud config to local and disable sync',
                                    value: 'copy-cloud',
                                }]
                            : []),
                        ...(localHasContent
                            ? [{
                                    name: `📄 Keep existing local config and disable sync${!cloudHasContent ? ' (RECOMMENDED)' : ''}`,
                                    value: 'keep-local',
                                }]
                            : []),
                        ...(cloudExists && !cloudHasContent && localHasContent
                            ? [{
                                    name: '⚠️  Copy empty cloud config to local (will lose local configurations)',
                                    value: 'copy-cloud-empty',
                                }]
                            : []),
                        {
                            name: '📄 Create new empty local config and disable sync',
                            value: 'create-new',
                        },
                        {
                            name: '❌ Cancel (keep sync enabled)',
                            value: 'cancel',
                        },
                    ],
                }]);
            if (action === 'cancel') {
                this.ui.displayInfo('Operation cancelled. Sync remains enabled.');
                return false;
            }
            this.ui.displayInfo('🔄 Disabling sync...');
            if ((action === 'copy-cloud' || action === 'copy-cloud-empty') && cloudConfigFile && cloudExists) {
                if (localExists) {
                    const backupPath = `${this.configFile}.backup.${Date.now()}`;
                    copyFileSync(this.configFile, backupPath);
                    this.ui.displayInfo(`💾 Backed up local config to: ${backupPath}`);
                }
                copyFileSync(cloudConfigFile, this.configFile);
                this.ui.displayInfo('📥 Copied cloud config to local location');
                if (cloudPath) {
                    const cloudS3Config = join(cloudPath, '.start-claude', 's3-config.json');
                    const localS3Config = join(this.configDir, 's3-config.json');
                    if (existsSync(cloudS3Config)) {
                        try {
                            const s3ConfigContent = readFileSync(cloudS3Config, 'utf-8');
                            const s3Config = JSON.parse(s3ConfigContent);
                            if (s3Config.bucket && s3Config.region && s3Config.accessKeyId && s3Config.secretAccessKey && s3Config.key) {
                                copyFileSync(cloudS3Config, localS3Config);
                                this.ui.displayInfo('📥 Copied S3 config to local location');
                            }
                            else {
                                this.ui.displayWarning('⚠️  Cloud S3 config is incomplete, skipping copy');
                            }
                        }
                        catch (error) {
                            this.ui.displayWarning(`⚠️  Failed to validate/copy S3 config: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                    }
                    const cloudMigrationFlags = join(cloudPath, '.start-claude', 'migration-flags.json');
                    const localMigrationFlags = join(this.configDir, 'migration-flags.json');
                    if (existsSync(cloudMigrationFlags)) {
                        try {
                            copyFileSync(cloudMigrationFlags, localMigrationFlags);
                            this.ui.displayInfo('📥 Copied migration flags to local location');
                        }
                        catch (error) {
                            this.ui.displayWarning(`⚠️  Failed to copy migration flags: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                    }
                }
            }
            else if (action === 'keep-local') {
                this.ui.displayInfo('📄 Keeping existing local config');
            }
            else if (action === 'create-new') {
                const emptyConfig = { version: 1, configs: [], settings: { overrideClaudeCommand: false } };
                writeFileSync(this.configFile, JSON.stringify(emptyConfig, null, 2));
                this.ui.displayInfo('📄 Created new local config file');
            }
            if (existsSync(this.syncConfigFile)) {
                unlinkSync(this.syncConfigFile);
            }
            if (await this.s3SyncManager.isS3Configured()) {
                this.ui.displayInfo('🔄 Re-enabling S3 auto-sync...');
                await this.updateS3Settings(false);
            }
            this.ui.displaySuccess('✅ Sync disabled successfully');
            return true;
        }
        catch (error) {
            this.ui.displayError(`❌ Failed to disable sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async getSyncStatus() {
        const issues = [];
        let isConfigured = false;
        let isValid = false;
        let cloudPath;
        const syncConfig = this.getSyncConfig();
        if (!syncConfig?.enabled) {
            return {
                isConfigured: false,
                isValid: false,
                configPath: this.configFile,
                issues: ['Sync is not configured'],
            };
        }
        isConfigured = true;
        const syncProvider = syncConfig.provider;
        if (syncProvider !== 's3') {
            if (syncProvider === 'icloud' || syncProvider === 'onedrive' || syncProvider === 'wsl-host') {
                cloudPath = syncConfig.cloudPath;
            }
            else if (syncProvider === 'custom') {
                cloudPath = syncConfig.customPath;
            }
            if (cloudPath) {
                const cloudConfigFile = join(cloudPath, '.start-claude', 'config.json');
                if (!existsSync(cloudConfigFile)) {
                    issues.push('Cloud config file does not exist');
                }
                else {
                    isValid = true;
                }
            }
            else {
                issues.push('Cloud path is not configured');
            }
        }
        else {
            isValid = await this.s3SyncManager.isS3Configured();
            if (!isValid) {
                issues.push('S3 is not properly configured');
            }
        }
        return {
            isConfigured,
            isValid,
            provider: syncProvider,
            cloudPath,
            configPath: this.configFile,
            issues,
        };
    }
    async verifySync() {
        const status = await this.getSyncStatus();
        if (!status.isConfigured) {
            return true;
        }
        if (status.isValid) {
            const syncConfig = this.getSyncConfig();
            if (syncConfig) {
                syncConfig.lastVerified = new Date().toISOString();
                this.saveSyncConfig(syncConfig);
            }
            return true;
        }
        this.ui.displayWarning('⚠️  Sync configuration issues detected:');
        status.issues.forEach((issue) => {
            this.ui.displayWarning(`  • ${issue}`);
        });
        const { fix } = await inquirer.prompt([{
                type: 'confirm',
                name: 'fix',
                message: 'Would you like to fix sync configuration now?',
                default: true,
            }]);
        if (fix) {
            return this.setupSync();
        }
        return false;
    }
    saveSyncConfig(config) {
        try {
            if (!existsSync(this.configDir)) {
                mkdirSync(this.configDir, { recursive: true });
            }
            const configData = JSON.stringify(config, null, 2);
            writeFileSync(this.syncConfigFile, configData, 'utf-8');
        }
        catch (error) {
            throw new Error(`Failed to save sync config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getSyncConfig() {
        try {
            if (!existsSync(this.syncConfigFile)) {
                return null;
            }
            const configData = readFileSync(this.syncConfigFile, 'utf-8');
            return JSON.parse(configData);
        }
        catch {
            return null;
        }
    }
    removeSyncConfig() {
        try {
            if (existsSync(this.syncConfigFile)) {
                unlinkSync(this.syncConfigFile);
            }
        }
        catch (error) {
            throw new Error(`Failed to remove sync config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async autoSetupFromCloudConfig(provider, cloudPath, configPath) {
        try {
            const providerName = provider === 'wsl-host' ? 'Windows host' : provider === 'icloud' ? 'iCloud' : 'OneDrive';
            this.ui.displayInfo(`🔍 Found existing configuration in ${providerName} - Setting up automatic sync...`);
            if (provider === 'icloud' || provider === 'onedrive') {
                this.ui.displayInfo(`🔐 Verifying ${providerName} access permission...`);
                const hasPermission = await this.verifyDirectoryPermission(cloudPath, providerName);
                if (!hasPermission) {
                    this.ui.displayError(`❌ Cannot access ${providerName}. Please grant the necessary permissions and try again.`);
                    return false;
                }
                this.ui.displaySuccess(`✅ ${providerName} access verified`);
            }
            const syncConfig = {
                enabled: true,
                provider,
                cloudPath,
                linkedAt: new Date().toISOString(),
                lastVerified: new Date().toISOString(),
            };
            this.saveSyncConfig(syncConfig);
            await this.updateS3Settings(true);
            this.ui.displaySuccess(`✅ Automatically configured ${providerName} sync!`);
            this.ui.displayInfo(`📂 Config file: ${configPath}`);
            this.ui.displayInfo(`🔗 Linked to: ${this.configFile}`);
            return true;
        }
        catch (error) {
            this.ui.displayError(`❌ Failed to auto-setup ${provider} sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
}
