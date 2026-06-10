import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import inquirer from 'inquirer';
import { SyncManager } from '../../sync/manager';
import { UILogger } from '../cli/ui';
import { getWindowsHostActualConfigPath } from '../cloud-storage/detector';
import { getWindowsUserPath, isWSL } from '../system/path-utils';
const CONFIG_DIR = join(homedir(), '.start-claude');
const LOCAL_CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const SYNC_CONFIG_FILE = join(CONFIG_DIR, 'sync.json');
export function detectWSLConfigs() {
    if (!isWSL()) {
        return {
            hasLocalConfig: false,
            hasWindowsConfig: false,
            shouldPrompt: false,
        };
    }
    if (existsSync(SYNC_CONFIG_FILE)) {
        return {
            hasLocalConfig: hasConfigContent(LOCAL_CONFIG_FILE),
            hasWindowsConfig: false,
            shouldPrompt: false,
        };
    }
    const hasLocalConfigContent = hasConfigContent(LOCAL_CONFIG_FILE);
    const windowsUserPath = getWindowsUserPath();
    if (!windowsUserPath) {
        return {
            hasLocalConfig: hasLocalConfigContent,
            hasWindowsConfig: false,
            shouldPrompt: false,
        };
    }
    const windowsConfigPath = join(windowsUserPath, '.start-claude', 'config.json');
    const hasWindowsConfigContent = hasConfigContent(windowsConfigPath);
    const shouldPrompt = hasLocalConfigContent && hasWindowsConfigContent;
    return {
        hasLocalConfig: hasLocalConfigContent,
        hasWindowsConfig: hasWindowsConfigContent,
        windowsConfigPath,
        shouldPrompt,
    };
}
function isValidConfigFile(configPath) {
    try {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        return (config
            && typeof config.version === 'number'
            && Array.isArray(config.configs)
            && config.configs.length > 0);
    }
    catch {
        return false;
    }
}
function hasConfigContent(configPath) {
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
function getConfigInfo(configPath) {
    try {
        if (!existsSync(configPath)) {
            return 'Not found';
        }
        if (!isValidConfigFile(configPath)) {
            return 'Invalid config file';
        }
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        const configCount = config.configs?.length || 0;
        return `${configCount} configuration${configCount !== 1 ? 's' : ''}`;
    }
    catch {
        return 'Error reading file';
    }
}
export async function promptWSLConfigChoice(detection) {
    const ui = new UILogger();
    ui.displayInfo('\n🪟 WSL Configuration Detected');
    ui.displayInfo('Found configuration files in both WSL and Windows host.');
    ui.displayInfo('');
    ui.displayInfo(`WSL local config:     ${getConfigInfo(LOCAL_CONFIG_FILE)}`);
    if (detection.windowsConfigPath) {
        ui.displayInfo(`Windows host config:  ${getConfigInfo(detection.windowsConfigPath)}`);
    }
    ui.displayInfo('');
    const { choice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'choice',
            message: 'Which configuration would you like to use?',
            choices: [
                {
                    name: '🪟 Windows Host - Use Windows config (recommended for shared setup)',
                    value: 'windows',
                },
                {
                    name: '🐧 WSL Local - Use WSL-only config (independent setup)',
                    value: 'local',
                },
                {
                    name: '❌ Skip - I will configure this later',
                    value: 'skip',
                },
            ],
        },
    ]);
    if (choice === 'skip') {
        ui.displayInfo('\nℹ️  You can configure sync later with: start-claude sync setup');
        return null;
    }
    return choice;
}
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
export async function handleWSLConfigDetection(options = {}) {
    const ui = new UILogger(options.verbose);
    if (!isWSL()) {
        return;
    }
    try {
        if (existsSync(SYNC_CONFIG_FILE)) {
            ui.verbose('WSL config detection: Sync already configured, skipping');
            return;
        }
        const detection = detectWSLConfigs();
        if (detection.shouldPrompt) {
            ui.verbose('WSL config detection: Both local and Windows configs found with content');
            const choice = await promptWSLConfigChoice(detection);
            if (!choice) {
                return;
            }
            const syncManager = new SyncManager();
            if (choice === 'windows') {
                const windowsUserPath = getWindowsUserPath();
                if (!windowsUserPath || !detection.windowsConfigPath) {
                    ui.displayError('❌ Failed to detect Windows user directory');
                    return;
                }
                ui.displayInfo('\n🔄 Configuring Windows host sync...');
                const syncConfig = {
                    enabled: true,
                    provider: 'wsl-host',
                    cloudPath: windowsUserPath,
                    linkedAt: new Date().toISOString(),
                };
                syncManager.saveSyncConfig(syncConfig);
                ui.displaySuccess('✅ Successfully configured Windows host sync!');
                ui.displayInfo(`📂 Config path: ${detection.windowsConfigPath}`);
                ui.displayInfo(`🔗 WSL will now use Windows host configuration`);
                ui.displayInfo('\n💡 Changes in Windows will be reflected in WSL automatically\n');
            }
            else if (choice === 'local') {
                ui.displayInfo('\n🐧 Using WSL local configuration...');
                const syncConfig = {
                    enabled: false,
                    provider: 'custom',
                    linkedAt: new Date().toISOString(),
                };
                syncManager.saveSyncConfig(syncConfig);
                ui.displaySuccess('✅ WSL will use local configuration');
                ui.displayInfo(`📂 Config path: ${LOCAL_CONFIG_FILE}`);
                ui.displayInfo('\n💡 You can enable sync later with: start-claude sync setup\n');
            }
            return;
        }
        if (!detection.hasLocalConfig && detection.hasWindowsConfig) {
            ui.verbose('WSL config detection: Only Windows has config content, offering auto-setup');
            const windowsActualConfig = getWindowsHostActualConfigPath();
            if (windowsActualConfig) {
                const providerName = windowsActualConfig.syncProvider
                    ? getProviderDisplayName(windowsActualConfig.syncProvider)
                    : 'Windows Host';
                ui.displayInfo('🪟 Running in WSL with no local configuration');
                ui.displayInfo(`📱 Found existing configuration from ${providerName}`);
                ui.displayInfo(`📂 Location: ${windowsActualConfig.configPath}`);
                const { autoSetup } = await inquirer.prompt([{
                        type: 'confirm',
                        name: 'autoSetup',
                        message: `Would you like to use the ${providerName} configuration? (Recommended)`,
                        default: true,
                    }]);
                if (autoSetup) {
                    const syncManager = new SyncManager();
                    let provider;
                    let syncPath;
                    if (windowsActualConfig.syncProvider && windowsActualConfig.cloudPath) {
                        provider = windowsActualConfig.syncProvider;
                        syncPath = windowsActualConfig.cloudPath;
                    }
                    else {
                        provider = 'wsl-host';
                        const windowsUserPath = getWindowsUserPath();
                        syncPath = windowsUserPath || '';
                    }
                    if (syncPath) {
                        const success = await syncManager.autoSetupFromCloudConfig(provider, syncPath, windowsActualConfig.configPath);
                        if (success) {
                            ui.displaySuccess('✅ Automatic sync setup completed successfully');
                        }
                        else {
                            ui.verbose('❌ Automatic sync setup failed');
                        }
                    }
                }
                else {
                    ui.verbose('ℹ️  Automatic sync setup skipped by user');
                }
            }
            return;
        }
        ui.verbose('WSL config detection: No action needed');
    }
    catch (error) {
        ui.verbose(`⚠️ WSL config detection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export function shouldRunWSLConfigDetection() {
    if (!isWSL()) {
        return false;
    }
    if (existsSync(SYNC_CONFIG_FILE)) {
        return false;
    }
    const detection = detectWSLConfigs();
    return detection.shouldPrompt;
}
