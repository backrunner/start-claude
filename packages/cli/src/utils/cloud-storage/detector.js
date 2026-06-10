import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { getWindowsUserPath, isWSL } from '../system/path-utils';
export function detectOneDrive() {
    const isWindows = process.platform === 'win32';
    const isMacOS = process.platform === 'darwin';
    const isWSLEnv = isWSL();
    if (isWindows) {
        return detectOneDriveWindows();
    }
    else if (isMacOS) {
        return detectOneDriveMacOS();
    }
    else if (isWSLEnv) {
        return detectOneDriveWSL();
    }
    else {
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'OneDrive is not supported on this platform',
        };
    }
}
function detectOneDriveWindows() {
    try {
        const oneDrivePath = process.env.OneDrive || join(homedir(), 'OneDrive');
        if (existsSync(oneDrivePath)) {
            const stats = statSync(oneDrivePath);
            if (stats.isDirectory()) {
                const oneDriveSettingsPath = join(oneDrivePath, '.849C9593-D756-4E56-8D6E-42412F2A707B');
                const hasOneDriveSettings = existsSync(oneDriveSettingsPath);
                const oneDriveExePaths = [
                    'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe',
                    'C:\\Program Files (x86)\\Microsoft OneDrive\\OneDrive.exe',
                    join(process.env.LOCALAPPDATA || '', 'Microsoft', 'OneDrive', 'OneDrive.exe'),
                ];
                const hasOneDriveExecutable = oneDriveExePaths.some(path => existsSync(path));
                return {
                    isAvailable: hasOneDriveExecutable,
                    isEnabled: hasOneDriveSettings || hasOneDriveExecutable,
                    path: oneDrivePath,
                };
            }
        }
        const localAppData = process.env.LOCALAPPDATA;
        if (localAppData) {
            const oneDriveLocalPath = join(localAppData, 'Microsoft', 'OneDrive');
            if (existsSync(oneDriveLocalPath)) {
                return {
                    isAvailable: true,
                    isEnabled: false,
                    path: oneDrivePath,
                    error: 'OneDrive is installed but may not be configured',
                };
            }
        }
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'OneDrive is not installed',
        };
    }
    catch (error) {
        return {
            isAvailable: false,
            isEnabled: false,
            error: `Error detecting OneDrive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
function detectOneDriveMacOS() {
    try {
        const oneDriveAppPaths = [
            '/Applications/OneDrive.app',
            join(homedir(), 'Applications', 'OneDrive.app'),
        ];
        const hasOneDriveApp = oneDriveAppPaths.some(path => existsSync(path));
        const oneDrivePaths = [
            join(homedir(), 'OneDrive'),
            join(homedir(), 'OneDrive - Personal'),
            join(homedir(), 'OneDrive - Business'),
            ...(() => {
                try {
                    return readdirSync(homedir(), { withFileTypes: true })
                        .filter(d => d.isDirectory() && d.name.startsWith('OneDrive'))
                        .map(d => join(homedir(), d.name));
                }
                catch {
                    return [];
                }
            })(),
        ];
        let oneDrivePath;
        let hasOneDriveFolder = false;
        for (const path of oneDrivePaths) {
            if (existsSync(path)) {
                const stats = statSync(path);
                if (stats.isDirectory()) {
                    hasOneDriveFolder = true;
                    oneDrivePath = path;
                    break;
                }
            }
        }
        const oneDriveConfigPaths = [
            join(homedir(), 'Library', 'Group Containers', 'UBF8T346G9.OneDriveSyncClientSuite'),
            join(homedir(), 'Library', 'Application Support', 'OneDrive'),
        ];
        const hasOneDriveConfig = oneDriveConfigPaths.some(path => existsSync(path));
        if (hasOneDriveApp || hasOneDriveFolder || hasOneDriveConfig) {
            return {
                isAvailable: hasOneDriveApp,
                isEnabled: hasOneDriveFolder || hasOneDriveConfig,
                path: oneDrivePath,
            };
        }
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'OneDrive is not installed',
        };
    }
    catch (error) {
        return {
            isAvailable: false,
            isEnabled: false,
            error: `Error detecting OneDrive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
function detectOneDriveWSL() {
    try {
        const windowsUserPath = getWindowsUserPath();
        if (!windowsUserPath) {
            return {
                isAvailable: false,
                isEnabled: false,
                error: 'Could not detect Windows user directory',
            };
        }
        const oneDrivePaths = [
            join(windowsUserPath, 'OneDrive'),
            join(windowsUserPath, 'OneDrive - Personal'),
            join(windowsUserPath, 'OneDrive - Business'),
        ];
        try {
            const dirs = readdirSync(windowsUserPath, { withFileTypes: true })
                .filter(d => d.isDirectory() && d.name.startsWith('OneDrive'))
                .map(d => join(windowsUserPath, d.name));
            oneDrivePaths.push(...dirs);
        }
        catch {
        }
        for (const path of oneDrivePaths) {
            if (existsSync(path)) {
                const stats = statSync(path);
                if (stats.isDirectory()) {
                    return {
                        isAvailable: true,
                        isEnabled: true,
                        path,
                    };
                }
            }
        }
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'OneDrive folder not found in Windows user directory',
        };
    }
    catch (error) {
        return {
            isAvailable: false,
            isEnabled: false,
            error: `Error detecting OneDrive in WSL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
export function detectiCloud() {
    const isWindows = process.platform === 'win32';
    const isMacOS = process.platform === 'darwin';
    const isWSLEnv = isWSL();
    if (isMacOS) {
        return detectiCloudMacOS();
    }
    else if (isWindows) {
        return detectiCloudWindows();
    }
    else if (isWSLEnv) {
        return detectiCloudWSL();
    }
    else {
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'iCloud is not supported on this platform',
        };
    }
}
function detectiCloudMacOS() {
    try {
        const iCloudPaths = [
            join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
            join(homedir(), 'iCloud Drive (Archive)'),
            join(homedir(), 'iCloud Drive'),
        ];
        let iCloudPath;
        let hasiCloudFolder = false;
        for (const path of iCloudPaths) {
            if (existsSync(path)) {
                const stats = statSync(path);
                if (stats.isDirectory()) {
                    hasiCloudFolder = true;
                    iCloudPath = path;
                    break;
                }
            }
        }
        const iCloudConfigPaths = [
            join(homedir(), 'Library', 'Application Support', 'CloudDocs'),
            join(homedir(), 'Library', 'Preferences', 'com.apple.bird.plist'),
        ];
        const hasiCloudConfig = iCloudConfigPaths.some(path => existsSync(path));
        const cloudDocsExists = existsSync(iCloudPaths[0]);
        if (hasiCloudFolder || hasiCloudConfig || cloudDocsExists) {
            return {
                isAvailable: true,
                isEnabled: cloudDocsExists || hasiCloudFolder,
                path: iCloudPath || iCloudPaths[0],
            };
        }
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'iCloud Drive is not enabled',
        };
    }
    catch (error) {
        return {
            isAvailable: false,
            isEnabled: false,
            error: `Error detecting iCloud: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
function detectiCloudWindows() {
    try {
        const iCloudPaths = [
            'C:\\Program Files\\Common Files\\Apple\\Internet Services\\iCloudServices.exe',
            'C:\\Program Files (x86)\\Common Files\\Apple\\Internet Services\\iCloudServices.exe',
        ];
        const hasiCloudApp = iCloudPaths.some(path => existsSync(path));
        const iCloudDrivePaths = [
            join(homedir(), 'iCloudDrive'),
            join(homedir(), 'iCloud Drive'),
            process.env.iCloudDrive || '',
        ].filter(Boolean);
        let iCloudDrivePath;
        let hasiCloudDriveFolder = false;
        for (const path of iCloudDrivePaths) {
            if (existsSync(path)) {
                const stats = statSync(path);
                if (stats.isDirectory()) {
                    hasiCloudDriveFolder = true;
                    iCloudDrivePath = path;
                    break;
                }
            }
        }
        const appData = process.env.APPDATA;
        let hasiCloudConfig = false;
        if (appData) {
            const iCloudConfigPaths = [
                join(appData, 'Apple Computer', 'MobileSync'),
                join(appData, 'Apple Computer', 'iCloud'),
            ];
            hasiCloudConfig = iCloudConfigPaths.some(path => existsSync(path));
        }
        if (hasiCloudApp || hasiCloudDriveFolder || hasiCloudConfig) {
            return {
                isAvailable: hasiCloudApp || hasiCloudDriveFolder,
                isEnabled: hasiCloudDriveFolder || hasiCloudConfig,
                path: iCloudDrivePath,
            };
        }
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'iCloud for Windows is not installed',
        };
    }
    catch (error) {
        return {
            isAvailable: false,
            isEnabled: false,
            error: `Error detecting iCloud: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
function detectiCloudWSL() {
    try {
        const windowsUserPath = getWindowsUserPath();
        if (!windowsUserPath) {
            return {
                isAvailable: false,
                isEnabled: false,
                error: 'Could not detect Windows user directory',
            };
        }
        const iCloudDrivePaths = [
            join(windowsUserPath, 'iCloudDrive'),
            join(windowsUserPath, 'iCloud Drive'),
        ];
        for (const path of iCloudDrivePaths) {
            if (existsSync(path)) {
                const stats = statSync(path);
                if (stats.isDirectory()) {
                    return {
                        isAvailable: true,
                        isEnabled: true,
                        path,
                    };
                }
            }
        }
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'iCloud Drive folder not found in Windows user directory',
        };
    }
    catch (error) {
        return {
            isAvailable: false,
            isEnabled: false,
            error: `Error detecting iCloud in WSL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
export function getWindowsHostActualConfigPath() {
    if (!isWSL()) {
        return null;
    }
    const windowsUserPath = getWindowsUserPath();
    if (!windowsUserPath) {
        return null;
    }
    const windowsConfigDir = join(windowsUserPath, '.start-claude');
    const windowsSyncFile = join(windowsConfigDir, 'sync.json');
    const windowsConfigFile = join(windowsConfigDir, 'config.json');
    if (existsSync(windowsSyncFile)) {
        try {
            const syncData = readFileSync(windowsSyncFile, 'utf-8');
            const syncConfig = JSON.parse(syncData);
            if (syncConfig.enabled && syncConfig.provider !== 'wsl-host' && syncConfig.provider !== 's3') {
                const cloudPath = syncConfig.cloudPath || syncConfig.customPath;
                if (cloudPath) {
                    const cloudConfigDir = join(cloudPath, '.start-claude');
                    const cloudConfigFile = join(cloudConfigDir, 'config.json');
                    if (existsSync(cloudConfigFile)) {
                        return {
                            configPath: cloudConfigFile,
                            syncProvider: syncConfig.provider,
                            cloudPath,
                        };
                    }
                }
            }
        }
        catch {
        }
    }
    if (existsSync(windowsConfigFile)) {
        return {
            configPath: windowsConfigFile,
        };
    }
    return null;
}
export function detectWindowsHostFromWSL() {
    if (!isWSL()) {
        return {
            isAvailable: false,
            isEnabled: false,
            error: 'Not running in WSL',
        };
    }
    try {
        const windowsUserPath = getWindowsUserPath();
        if (!windowsUserPath) {
            return {
                isAvailable: false,
                isEnabled: false,
                error: 'Could not detect Windows user directory',
            };
        }
        const windowsConfigDir = join(windowsUserPath, '.start-claude');
        const windowsConfigFile = join(windowsConfigDir, 'config.json');
        const windowsSyncFile = join(windowsConfigDir, 'sync.json');
        if (existsSync(windowsSyncFile)) {
            try {
                const syncData = readFileSync(windowsSyncFile, 'utf-8');
                const syncConfig = JSON.parse(syncData);
                if (syncConfig.enabled && syncConfig.provider !== 'wsl-host' && syncConfig.provider !== 's3') {
                    const cloudPath = syncConfig.cloudPath || syncConfig.customPath;
                    if (cloudPath) {
                        const cloudConfigDir = join(cloudPath, '.start-claude');
                        const cloudConfigFile = join(cloudConfigDir, 'config.json');
                        if (existsSync(cloudConfigFile)) {
                            return {
                                isAvailable: true,
                                isEnabled: true,
                                path: cloudPath,
                                error: `Windows is using ${syncConfig.provider} sync. WSL can access the same cloud folder.`,
                            };
                        }
                        else {
                            return {
                                isAvailable: false,
                                isEnabled: false,
                                path: windowsUserPath,
                                error: `Windows is using ${syncConfig.provider} sync but cloud config is not accessible from WSL.`,
                            };
                        }
                    }
                }
            }
            catch {
            }
        }
        if (existsSync(windowsConfigFile)) {
            try {
                const configData = readFileSync(windowsConfigFile, 'utf-8');
                const config = JSON.parse(configData);
                const hasValidConfig = config
                    && typeof config.version === 'number'
                    && Array.isArray(config.configs);
                if (hasValidConfig) {
                    return {
                        isAvailable: true,
                        isEnabled: true,
                        path: windowsUserPath,
                    };
                }
                else {
                    return {
                        isAvailable: true,
                        isEnabled: false,
                        path: windowsUserPath,
                        error: 'Windows config file exists but is invalid',
                    };
                }
            }
            catch {
                return {
                    isAvailable: true,
                    isEnabled: false,
                    path: windowsUserPath,
                    error: 'Windows config file exists but could not be parsed',
                };
            }
        }
        return {
            isAvailable: true,
            isEnabled: false,
            path: windowsUserPath,
            error: 'Windows user directory found but no config exists',
        };
    }
    catch (error) {
        return {
            isAvailable: false,
            isEnabled: false,
            error: `Error detecting Windows host: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
export function detectWindowsCloudSync() {
    if (!isWSL()) {
        return { hasSync: false };
    }
    try {
        const windowsUserPath = getWindowsUserPath();
        if (!windowsUserPath) {
            return { hasSync: false };
        }
        const windowsSyncFile = join(windowsUserPath, '.start-claude', 'sync.json');
        if (existsSync(windowsSyncFile)) {
            try {
                const syncData = readFileSync(windowsSyncFile, 'utf-8');
                const syncConfig = JSON.parse(syncData);
                if (syncConfig.enabled && syncConfig.provider !== 'wsl-host') {
                    return {
                        hasSync: true,
                        provider: syncConfig.provider,
                        cloudPath: syncConfig.cloudPath || syncConfig.customPath,
                    };
                }
            }
            catch {
            }
        }
        return { hasSync: false };
    }
    catch {
        return { hasSync: false };
    }
}
export function getCloudStorageStatus() {
    const status = {
        oneDrive: detectOneDrive(),
        iCloud: detectiCloud(),
    };
    if (isWSL()) {
        status.windowsHost = detectWindowsHostFromWSL();
    }
    return status;
}
export function getAvailableCloudServices() {
    const status = getCloudStorageStatus();
    const services = [];
    if (status.windowsHost && status.windowsHost.isEnabled) {
        services.push({
            name: 'Windows Host',
            path: status.windowsHost.path,
            isEnabled: status.windowsHost.isEnabled,
        });
    }
    if (status.oneDrive.isAvailable || status.oneDrive.isEnabled) {
        services.push({
            name: 'OneDrive',
            path: status.oneDrive.path,
            isEnabled: status.oneDrive.isEnabled,
        });
    }
    if (status.iCloud.isAvailable || status.iCloud.isEnabled) {
        services.push({
            name: 'iCloud',
            path: status.iCloud.path,
            isEnabled: status.iCloud.isEnabled,
        });
    }
    return services;
}
export function detectExistingCloudStorageConfigs() {
    const results = [];
    const cloudStatus = getCloudStorageStatus();
    if (isWSL()) {
        const windowsActualConfig = getWindowsHostActualConfigPath();
        if (windowsActualConfig) {
            try {
                const configData = readFileSync(windowsActualConfig.configPath, 'utf-8');
                const config = JSON.parse(configData);
                const hasValidConfig = config
                    && typeof config.version === 'number'
                    && Array.isArray(config.configs)
                    && config.configs.length > 0;
                if (windowsActualConfig.syncProvider && windowsActualConfig.cloudPath) {
                    results.push({
                        provider: windowsActualConfig.syncProvider,
                        path: windowsActualConfig.cloudPath,
                        configPath: windowsActualConfig.configPath,
                        hasValidConfig,
                    });
                }
                else {
                    const windowsUserPath = getWindowsUserPath();
                    if (windowsUserPath) {
                        results.push({
                            provider: 'wsl-host',
                            path: windowsUserPath,
                            configPath: windowsActualConfig.configPath,
                            hasValidConfig,
                        });
                    }
                }
            }
            catch {
                const windowsUserPath = getWindowsUserPath();
                if (windowsUserPath) {
                    results.push({
                        provider: 'wsl-host',
                        path: windowsUserPath,
                        configPath: windowsActualConfig.configPath,
                        hasValidConfig: false,
                    });
                }
            }
        }
    }
    else if (cloudStatus.windowsHost && cloudStatus.windowsHost.isEnabled && cloudStatus.windowsHost.path) {
        const windowsConfigDir = join(cloudStatus.windowsHost.path, '.start-claude');
        const windowsConfigFile = join(windowsConfigDir, 'config.json');
        if (existsSync(windowsConfigFile)) {
            try {
                const configData = readFileSync(windowsConfigFile, 'utf-8');
                const config = JSON.parse(configData);
                const hasValidConfig = config
                    && typeof config.version === 'number'
                    && Array.isArray(config.configs)
                    && config.configs.length > 0;
                results.push({
                    provider: 'wsl-host',
                    path: cloudStatus.windowsHost.path,
                    configPath: windowsConfigFile,
                    hasValidConfig,
                });
            }
            catch {
                results.push({
                    provider: 'wsl-host',
                    path: cloudStatus.windowsHost.path,
                    configPath: windowsConfigFile,
                    hasValidConfig: false,
                });
            }
        }
    }
    if (cloudStatus.iCloud.isEnabled && cloudStatus.iCloud.path) {
        const iCloudConfigDir = join(cloudStatus.iCloud.path, '.start-claude');
        const iCloudConfigFile = join(iCloudConfigDir, 'config.json');
        if (existsSync(iCloudConfigFile)) {
            try {
                const configData = readFileSync(iCloudConfigFile, 'utf-8');
                const config = JSON.parse(configData);
                const hasValidConfig = config
                    && typeof config.version === 'number'
                    && Array.isArray(config.configs)
                    && config.configs.length > 0;
                results.push({
                    provider: 'icloud',
                    path: cloudStatus.iCloud.path,
                    configPath: iCloudConfigFile,
                    hasValidConfig,
                });
            }
            catch {
                results.push({
                    provider: 'icloud',
                    path: cloudStatus.iCloud.path,
                    configPath: iCloudConfigFile,
                    hasValidConfig: false,
                });
            }
        }
    }
    if (cloudStatus.oneDrive.isEnabled && cloudStatus.oneDrive.path) {
        const oneDriveConfigDir = join(cloudStatus.oneDrive.path, '.start-claude');
        const oneDriveConfigFile = join(oneDriveConfigDir, 'config.json');
        if (existsSync(oneDriveConfigFile)) {
            try {
                const configData = readFileSync(oneDriveConfigFile, 'utf-8');
                const config = JSON.parse(configData);
                const hasValidConfig = config
                    && typeof config.version === 'number'
                    && Array.isArray(config.configs)
                    && config.configs.length > 0;
                results.push({
                    provider: 'onedrive',
                    path: cloudStatus.oneDrive.path,
                    configPath: oneDriveConfigFile,
                    hasValidConfig,
                });
            }
            catch {
                results.push({
                    provider: 'onedrive',
                    path: cloudStatus.oneDrive.path,
                    configPath: oneDriveConfigFile,
                    hasValidConfig: false,
                });
            }
        }
    }
    return results;
}
