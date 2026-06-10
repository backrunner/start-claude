import { exec, execSync, spawn } from 'node:child_process';
import { accessSync, constants, cpSync, createWriteStream, mkdirSync, rmSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { extract } from 'tar';
import { version } from '../../../package.json';
import { findExecutable, isGlobalNodePath } from '../system/path-utils';
import { CacheManager } from './cache-manager';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_KEY_FAILURE_COUNT = 'upgrade.consecutiveFailures';
const CACHE_KEY_USER_DISMISSED = 'upgrade.userDismissedPrompt';
const FAILURE_THRESHOLD = 10;
function isPrereleaseVersion(version) {
    return version.includes('-') || version.includes('beta') || version.includes('alpha') || version.includes('rc');
}
async function fetchLatestVersionFromNpm() {
    return new Promise((resolve, reject) => {
        const timeout = 3000;
        const req = https.get('https://registry.npmjs.org/start-claude', {
            timeout,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'start-claude-cli',
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk.toString();
            });
            res.on('end', () => {
                try {
                    const pkg = JSON.parse(data);
                    const latestTagVersion = pkg['dist-tags']?.latest;
                    if (latestTagVersion && !isPrereleaseVersion(latestTagVersion)) {
                        resolve(latestTagVersion);
                        return;
                    }
                    const allVersions = Object.keys(pkg.versions || {});
                    const stableVersions = allVersions.filter(v => !isPrereleaseVersion(v));
                    if (stableVersions.length === 0) {
                        reject(new Error('No stable versions found'));
                        return;
                    }
                    stableVersions.sort((a, b) => compareVersions(a, b));
                    const latestStable = stableVersions[stableVersions.length - 1];
                    resolve(latestStable);
                }
                catch {
                    reject(new Error('Failed to parse npm registry response'));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.on('error', (error) => {
            reject(error);
        });
    });
}
export async function checkForUpdates(forceCheck = false) {
    try {
        const cache = CacheManager.getInstance();
        if (!forceCheck && !cache.shouldCheckForUpdates()) {
            return null;
        }
        const latestVersion = await fetchLatestVersionFromNpm();
        const hasUpdate = compareVersions(version, latestVersion) < 0;
        cache.setUpdateCheckTimestamp(Date.now(), latestVersion);
        return {
            currentVersion: version,
            latestVersion,
            hasUpdate,
            updateCommand: 'pnpm add -g start-claude@latest',
        };
    }
    catch {
        return null;
    }
}
function compareVersions(current, latest) {
    const [currentMain, currentPre] = current.split('-');
    const [latestMain, latestPre] = latest.split('-');
    const currentParts = currentMain.split('.').map(Number);
    const latestParts = latestMain.split('.').map(Number);
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const currentPart = currentParts[i] || 0;
        const latestPart = latestParts[i] || 0;
        if (currentPart < latestPart)
            return -1;
        if (currentPart > latestPart)
            return 1;
    }
    if (currentPre && !latestPre) {
        return -1;
    }
    if (!currentPre && latestPre) {
        return 1;
    }
    return 0;
}
function getGlobalInstallPath() {
    try {
        let currentPath = __dirname;
        while (currentPath !== path.dirname(currentPath)) {
            const packageJsonPath = path.join(currentPath, 'package.json');
            try {
                accessSync(packageJsonPath, constants.F_OK);
                const normalizedPath = path.normalize(currentPath);
                const nodeModulesPattern = path.normalize(path.join('node_modules', 'start-claude'));
                if (normalizedPath.includes(nodeModulesPattern)) {
                    return currentPath;
                }
                if (path.basename(currentPath) === 'start-claude') {
                    const parentDir = path.dirname(currentPath);
                    if (path.basename(parentDir) === 'node_modules') {
                        return currentPath;
                    }
                }
            }
            catch {
            }
            currentPath = path.dirname(currentPath);
        }
        if (isGlobalNodePath(__filename)) {
            currentPath = path.dirname(__filename);
            while (currentPath !== path.dirname(currentPath)) {
                const modulePath = path.join(currentPath, 'node_modules', 'start-claude');
                try {
                    accessSync(modulePath, constants.F_OK);
                    return modulePath;
                }
                catch {
                }
                if (path.basename(currentPath) === 'start-claude') {
                    const parentDir = path.dirname(currentPath);
                    if (path.basename(parentDir) === 'node_modules') {
                        return currentPath;
                    }
                }
                currentPath = path.dirname(currentPath);
            }
        }
    }
    catch {
    }
    return null;
}
function hasWritePermission(dirPath) {
    try {
        accessSync(dirPath, constants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}
function detectPackageManager() {
    const cache = CacheManager.getInstance();
    const cachedMethod = cache.getClaudeInstallMethod();
    if (cachedMethod && ['npm', 'pnpm', 'yarn', 'bun'].includes(cachedMethod)) {
        return cachedMethod;
    }
    if (findExecutable('pnpm')) {
        return 'pnpm';
    }
    if (findExecutable('bun')) {
        return 'bun';
    }
    if (findExecutable('yarn')) {
        return 'yarn';
    }
    return 'npm';
}
async function downloadLatestTarball(destPath, version) {
    return new Promise((resolve, reject) => {
        const timeout = 30000;
        https.get('https://registry.npmjs.org/start-claude', {
            timeout,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'start-claude-cli',
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk.toString();
            });
            res.on('end', () => {
                try {
                    const pkg = JSON.parse(data);
                    let targetVersion = version;
                    if (!targetVersion) {
                        const latestTagVersion = pkg['dist-tags']?.latest;
                        if (latestTagVersion && !isPrereleaseVersion(latestTagVersion)) {
                            targetVersion = latestTagVersion;
                        }
                        else {
                            const allVersions = Object.keys(pkg.versions || {});
                            const stableVersions = allVersions.filter(v => !isPrereleaseVersion(v));
                            if (stableVersions.length === 0) {
                                reject(new Error('No stable versions available'));
                                return;
                            }
                            stableVersions.sort((a, b) => compareVersions(a, b));
                            targetVersion = stableVersions[stableVersions.length - 1];
                        }
                    }
                    if (!targetVersion) {
                        reject(new Error('Could not determine target version'));
                        return;
                    }
                    if (isPrereleaseVersion(targetVersion)) {
                        reject(new Error(`Cannot download prerelease version: ${targetVersion}`));
                        return;
                    }
                    const versionData = pkg.versions?.[targetVersion];
                    const tarballUrl = versionData?.dist?.tarball;
                    if (!tarballUrl) {
                        reject(new Error(`No tarball URL found for version ${targetVersion}`));
                        return;
                    }
                    https.get(tarballUrl, {
                        timeout,
                        headers: {
                            'User-Agent': 'start-claude-cli',
                        },
                    }, (tarRes) => {
                        const fileStream = createWriteStream(destPath);
                        pipeline(tarRes, fileStream)
                            .then(() => resolve())
                            .catch(reject);
                    }).on('error', reject);
                }
                catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject).on('timeout', () => {
            reject(new Error('Download timeout'));
        });
    });
}
function verifyCLIInstallation(installPath) {
    const criticalFiles = [
        'package.json',
        path.join('bin', 'cli.mjs'),
        path.join('bin', 'cli.cjs'),
    ];
    const missingFiles = [];
    for (const file of criticalFiles) {
        const filePath = path.join(installPath, file);
        try {
            accessSync(filePath, constants.F_OK);
        }
        catch {
            missingFiles.push(file);
        }
    }
    return {
        valid: missingFiles.length === 0,
        missingFiles,
    };
}
export function safeCopy(sourcePath, destPath) {
    try {
        const normalizedSource = path.normalize(sourcePath);
        const normalizedDest = path.normalize(destPath);
        cpSync(normalizedSource, normalizedDest, {
            recursive: true,
            force: true,
        });
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown copy error',
        };
    }
}
async function performSilentUpgrade() {
    const cache = CacheManager.getInstance();
    const tmpDir = path.join(os.tmpdir(), `start-claude-upgrade-${Date.now()}`);
    let backupPath = null;
    let needsRollback = false;
    let installPath = null;
    try {
        installPath = getGlobalInstallPath();
        if (!installPath) {
            cache.set('upgrade.silentFailed', true);
            return {
                success: false,
                error: 'Could not determine installation path',
                shouldRetryWithPackageManager: true,
            };
        }
        if (!hasWritePermission(installPath)) {
            cache.set('upgrade.silentFailed', true);
            return {
                success: false,
                error: 'No write permission to installation directory',
                shouldRetryWithPackageManager: true,
            };
        }
        const preUpgradeCheck = verifyCLIInstallation(installPath);
        if (!preUpgradeCheck.valid) {
            cache.set('upgrade.silentFailed', true);
            return {
                success: false,
                error: `Current installation is invalid (missing: ${preUpgradeCheck.missingFiles.join(', ')}). Please reinstall manually.`,
                shouldRetryWithPackageManager: true,
            };
        }
        mkdirSync(tmpDir, { recursive: true });
        const tarballPath = path.join(tmpDir, 'start-claude.tgz');
        await downloadLatestTarball(tarballPath);
        const extractPath = path.join(tmpDir, 'package');
        mkdirSync(extractPath, { recursive: true });
        await extract({
            file: tarballPath,
            cwd: tmpDir,
        });
        const extractedCheck = verifyCLIInstallation(extractPath);
        if (!extractedCheck.valid) {
            cache.set('upgrade.silentFailed', true);
            return {
                success: false,
                error: `Downloaded package is invalid (missing: ${extractedCheck.missingFiles.join(', ')}). Aborting upgrade.`,
                shouldRetryWithPackageManager: true,
            };
        }
        backupPath = path.join(tmpDir, 'backup');
        mkdirSync(backupPath, { recursive: true });
        const backupResult = safeCopy(installPath, backupPath);
        if (!backupResult.success) {
            cache.set('upgrade.silentFailed', true);
            return {
                success: false,
                error: `Failed to create backup: ${backupResult.error}`,
                shouldRetryWithPackageManager: true,
            };
        }
        const backupCheck = verifyCLIInstallation(backupPath);
        if (!backupCheck.valid) {
            cache.set('upgrade.silentFailed', true);
            return {
                success: false,
                error: `Backup verification failed (missing: ${backupCheck.missingFiles.join(', ')}). Aborting upgrade.`,
                shouldRetryWithPackageManager: true,
            };
        }
        const upgradeResult = safeCopy(extractPath, installPath);
        if (!upgradeResult.success) {
            needsRollback = true;
            throw new Error(`File copy failed: ${upgradeResult.error}`);
        }
        const postUpgradeCheck = verifyCLIInstallation(installPath);
        if (!postUpgradeCheck.valid) {
            needsRollback = true;
            throw new Error(`Post-upgrade verification failed - installation incomplete (missing: ${postUpgradeCheck.missingFiles.join(', ')})`);
        }
        cache.delete('upgrade.silentFailed');
        return {
            success: true,
            method: 'silent-upgrade',
        };
    }
    catch (error) {
        if (needsRollback && backupPath && installPath) {
            try {
                const rollbackResult = safeCopy(backupPath, installPath);
                if (!rollbackResult.success) {
                    throw new Error(`Rollback copy failed: ${rollbackResult.error}`);
                }
                const rollbackCheck = verifyCLIInstallation(installPath);
                if (!rollbackCheck.valid) {
                    throw new Error(`Rollback verification failed (missing: ${rollbackCheck.missingFiles.join(', ')})`);
                }
                cache.set('upgrade.silentFailed', true);
                return {
                    success: false,
                    error: `Upgrade failed, successfully rolled back to previous version: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    shouldRetryWithPackageManager: true,
                };
            }
            catch (rollbackError) {
                cache.set('upgrade.silentFailed', true);
                return {
                    success: false,
                    error: `CRITICAL: Upgrade and rollback both failed. Backup preserved at: ${backupPath}. Please restore manually. Original error: ${error instanceof Error ? error.message : 'Unknown error'}. Rollback error: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown'}`,
                    shouldRetryWithPackageManager: true,
                };
            }
        }
        cache.set('upgrade.silentFailed', true);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during silent upgrade',
            shouldRetryWithPackageManager: true,
        };
    }
    finally {
        try {
            if (tmpDir && !needsRollback) {
                rmSync(tmpDir, { recursive: true, force: true });
            }
        }
        catch {
        }
    }
}
async function performPackageManagerUpdate(useSudo = false) {
    const packageManager = detectPackageManager();
    const updateCommand = packageManager === 'npm'
        ? 'npm install -g start-claude@latest'
        : packageManager === 'yarn'
            ? 'yarn global add start-claude@latest'
            : packageManager === 'bun'
                ? 'bun add -g start-claude@latest'
                : 'pnpm add -g start-claude@latest';
    const finalCommand = useSudo ? `sudo ${updateCommand}` : updateCommand;
    try {
        const result = await new Promise((resolve, reject) => {
            exec(finalCommand, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve({ stdout, stderr });
                }
            });
        });
        if (result.stderr && (result.stderr.includes('error') || result.stderr.includes('failed'))) {
            throw new Error(result.stderr.trim());
        }
        const cache = CacheManager.getInstance();
        cache.delete('upgrade.silentFailed');
        return {
            success: true,
            usedSudo: useSudo,
            method: 'package-manager',
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isPermissionError = errorMessage.includes('EACCES')
            || errorMessage.includes('EPERM')
            || errorMessage.includes('permission denied')
            || errorMessage.includes('Permission denied');
        return {
            success: false,
            error: errorMessage,
            usedSudo: useSudo,
            method: 'package-manager',
            shouldRetryWithPackageManager: !useSudo && isPermissionError && process.platform === 'darwin',
        };
    }
}
export async function performAutoUpdate(usePackageManager = false, useSudo = false) {
    const cache = CacheManager.getInstance();
    const silentUpgradeFailed = cache.get('upgrade.silentFailed');
    if (usePackageManager || silentUpgradeFailed) {
        return performPackageManagerUpdate(useSudo);
    }
    return performSilentUpgrade();
}
export async function performBackgroundUpgrade() {
    try {
        const cache = CacheManager.getInstance();
        if (cache.get('upgrade.backgroundRunning')) {
            return;
        }
        cache.set('upgrade.backgroundRunning', true, 5 * 60 * 1000);
        setTimeout(() => {
            void (async () => {
                try {
                    const result = await performSilentUpgrade();
                    cache.set('upgrade.backgroundResult', {
                        ...result,
                        timestamp: Date.now(),
                    });
                    if (result.success) {
                        cache.set(CACHE_KEY_FAILURE_COUNT, 0);
                        cache.delete(CACHE_KEY_USER_DISMISSED);
                    }
                    else {
                        const failures = cache.get(CACHE_KEY_FAILURE_COUNT) || 0;
                        cache.set(CACHE_KEY_FAILURE_COUNT, failures + 1);
                    }
                }
                catch (error) {
                    cache.set('upgrade.backgroundResult', {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: Date.now(),
                    });
                    const failures = cache.get(CACHE_KEY_FAILURE_COUNT) || 0;
                    cache.set(CACHE_KEY_FAILURE_COUNT, failures + 1);
                }
                finally {
                    cache.delete('upgrade.backgroundRunning');
                }
            })();
        }, 100);
    }
    catch {
    }
}
export function checkBackgroundUpgradeResult() {
    try {
        const cache = CacheManager.getInstance();
        const result = cache.get('upgrade.backgroundResult');
        if (result) {
            const latestVersion = cache.get('updateCheck.lastVersion');
            cache.delete('upgrade.backgroundResult');
            return {
                result,
                latestVersion,
            };
        }
        return null;
    }
    catch {
        return null;
    }
}
function isGlobalInstall() {
    if (!process.argv[1]) {
        return false;
    }
    const scriptPath = process.argv[1];
    if (scriptPath.endsWith('.js') || scriptPath.endsWith('.cjs') || scriptPath.endsWith('.mjs')) {
        return isGlobalNodePath(scriptPath);
    }
    return true;
}
export function relaunchCLI() {
    const args = process.argv.slice(2);
    const executable = process.argv[0];
    let commandToRun;
    if (isGlobalInstall()) {
        const binaryName = process.argv[1] && !process.argv[1].includes('/')
            ? process.argv[1]
            : 'start-claude';
        commandToRun = [binaryName, ...args];
    }
    else {
        const scriptPath = process.argv[1];
        commandToRun = [scriptPath, ...args];
    }
    const child = spawn(executable, commandToRun, {
        detached: true,
        stdio: 'inherit',
    });
    child.unref();
    process.exit(0);
}
function checkNeedsSudo() {
    if (process.platform !== 'darwin')
        return false;
    try {
        const globalDir = execSync('npm root -g', { encoding: 'utf-8' }).trim();
        accessSync(globalDir, constants.W_OK);
        return false;
    }
    catch {
        return true;
    }
}
async function performInteractiveUpgrade(ui) {
    const needsSudo = checkNeedsSudo();
    const pm = detectPackageManager();
    if (needsSudo) {
        ui.info(`Admin privileges required for global install, using sudo ${pm}...`);
    }
    ui.info('Upgrading start-claude...');
    const result = await performPackageManagerUpdate(needsSudo);
    if (result.success) {
        ui.success('Upgrade successful! The new version will be used on next startup.');
        const cache = CacheManager.getInstance();
        cache.set(CACHE_KEY_FAILURE_COUNT, 0);
        cache.delete(CACHE_KEY_USER_DISMISSED);
    }
    else {
        ui.error(`Upgrade failed: ${result.error}`);
        if (!needsSudo && result.shouldRetryWithPackageManager) {
            ui.info('Permission issue detected, retrying with sudo...');
            const retryResult = await performPackageManagerUpdate(true);
            if (retryResult.success) {
                ui.success('Upgrade successful!');
                const cache = CacheManager.getInstance();
                cache.set(CACHE_KEY_FAILURE_COUNT, 0);
                cache.delete(CACHE_KEY_USER_DISMISSED);
            }
            else {
                ui.error(`Upgrade still failed: ${retryResult.error}`);
            }
        }
    }
}
async function promptUserForUpgrade(ui) {
    const inquirer = await import('inquirer');
    const { choice } = await inquirer.default.prompt([{
            type: 'list',
            name: 'choice',
            message: 'Background upgrade has failed multiple times. Would you like to upgrade now for the best experience?',
            choices: [
                { name: 'Upgrade now', value: 'upgrade' },
                { name: 'Skip (don\'t ask again)', value: 'dismiss' },
            ],
        }]);
    const cache = CacheManager.getInstance();
    if (choice === 'upgrade') {
        await performInteractiveUpgrade(ui);
    }
    else {
        cache.set(CACHE_KEY_USER_DISMISSED, true);
    }
}
export async function handleBackgroundUpgradeResult(ui) {
    const result = checkBackgroundUpgradeResult();
    if (!result)
        return;
    const cache = CacheManager.getInstance();
    const failures = cache.get(CACHE_KEY_FAILURE_COUNT) || 0;
    const dismissed = cache.get(CACHE_KEY_USER_DISMISSED);
    if (failures >= FAILURE_THRESHOLD && !dismissed) {
        await promptUserForUpgrade(ui);
    }
}
