import { execSync, spawn } from 'node:child_process';
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
const BACKGROUND_RUNNING_TTL_MS = 5 * 60 * 1000;
export const BACKGROUND_UPGRADE_ARG = '--start-claude-background-upgrade';
export const BACKGROUND_UPGRADE_ENV = 'START_CLAUDE_BACKGROUND_UPGRADE';
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
function detectPackageManagerFromInstallPath(installPath) {
    if (!installPath) {
        return null;
    }
    const normalizedPath = path.normalize(installPath).toLowerCase().replace(/\\/g, '/');
    if (normalizedPath.includes('/.pnpm/') || normalizedPath.includes('pnpm')) {
        return 'pnpm';
    }
    if (normalizedPath.includes('/.bun/') || normalizedPath.includes('bun')) {
        return 'bun';
    }
    if (normalizedPath.includes('/yarn/') || normalizedPath.includes('/.config/yarn/')) {
        return 'yarn';
    }
    if (normalizedPath.includes('/node_modules/start-claude')) {
        return 'npm';
    }
    return null;
}
function detectPackageManager() {
    const installedPackageManager = detectPackageManagerFromInstallPath(getGlobalInstallPath());
    if (installedPackageManager) {
        return installedPackageManager;
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
function pathExists(filePath) {
    try {
        accessSync(filePath, constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
function resolveCliEntryPath() {
    const argvEntry = process.argv[1];
    if (argvEntry) {
        const resolvedArgvEntry = path.resolve(argvEntry);
        if (pathExists(resolvedArgvEntry)) {
            return resolvedArgvEntry;
        }
    }
    const bundledEntryName = path.basename(__filename).toLowerCase();
    if (!['cli.js', 'cli.cjs', 'cli.mjs'].includes(bundledEntryName)) {
        return null;
    }
    const bundledEntryPath = path.resolve(__filename);
    if (pathExists(bundledEntryPath)) {
        return bundledEntryPath;
    }
    return null;
}
function isNodeRunnableEntryPath(entryPath) {
    const ext = path.extname(entryPath).toLowerCase();
    return ext === '.js' || ext === '.cjs' || ext === '.mjs' || ext === '.ts';
}
function buildCliInvocation(args) {
    const entryPath = resolveCliEntryPath();
    if (entryPath) {
        if (isNodeRunnableEntryPath(entryPath)) {
            return {
                command: process.execPath,
                args: [...process.execArgv, entryPath, ...args],
                shell: false,
            };
        }
        return {
            command: entryPath,
            args,
            shell: process.platform === 'win32',
        };
    }
    const binaryName = process.argv[1] ? path.basename(process.argv[1]) : 'start-claude';
    return {
        command: binaryName,
        args,
        shell: process.platform === 'win32',
    };
}
async function downloadLatestTarball(destPath, version) {
    return new Promise((resolve, reject) => {
        const timeout = 30000;
        const metadataReq = https.get('https://registry.npmjs.org/start-claude', {
            timeout,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'start-claude-cli',
            },
        }, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`npm registry returned ${res.statusCode}`));
                res.resume?.();
                return;
            }
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
                    const tarballReq = https.get(tarballUrl, {
                        timeout,
                        headers: {
                            'User-Agent': 'start-claude-cli',
                        },
                    }, (tarRes) => {
                        if (tarRes.statusCode && tarRes.statusCode >= 400) {
                            reject(new Error(`tarball download returned ${tarRes.statusCode}`));
                            tarRes.resume?.();
                            return;
                        }
                        const fileStream = createWriteStream(destPath);
                        pipeline(tarRes, fileStream)
                            .then(() => resolve())
                            .catch(reject);
                    });
                    tarballReq.on('error', reject);
                    tarballReq.on('timeout', () => {
                        tarballReq.destroy();
                        reject(new Error('Tarball download timeout'));
                    });
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        metadataReq.on('error', reject);
        metadataReq.on('timeout', () => {
            metadataReq.destroy();
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
    const updateCommand = getPackageManagerUpdateCommand(packageManager);
    const command = useSudo ? 'sudo' : updateCommand.command;
    const args = useSudo ? [updateCommand.command, ...updateCommand.args] : updateCommand.args;
    try {
        const result = await runPackageManagerCommand(command, args, useSudo);
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
            shouldRetryWithPackageManager: !useSudo && isPermissionError && process.platform !== 'win32',
        };
    }
}
function getPackageManagerUpdateCommand(packageManager) {
    if (packageManager === 'npm') {
        return { command: 'npm', args: ['install', '-g', 'start-claude@latest'] };
    }
    if (packageManager === 'yarn') {
        return { command: 'yarn', args: ['global', 'add', 'start-claude@latest'] };
    }
    if (packageManager === 'bun') {
        return { command: 'bun', args: ['add', '-g', 'start-claude@latest'] };
    }
    return { command: 'pnpm', args: ['add', '-g', 'start-claude@latest'] };
}
function runPackageManagerCommand(command, args, inheritStdio) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            shell: process.platform === 'win32' && command !== 'sudo',
            stdio: inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Package manager update timed out'));
        }, 60000);
        child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }
            reject(new Error(stderr.trim() || `Package manager update failed with exit code ${code ?? 'unknown'}`));
        });
    });
}
export async function performAutoUpdate(usePackageManager = false, useSudo = false) {
    const cache = CacheManager.getInstance();
    const silentUpgradeFailed = cache.get('upgrade.silentFailed');
    if (usePackageManager || silentUpgradeFailed) {
        return performPackageManagerUpdate(useSudo);
    }
    return performSilentUpgrade();
}
function recordBackgroundUpgradeResult(result) {
    const cache = CacheManager.getInstance();
    cache.set('upgrade.backgroundResult', {
        ...result,
        timestamp: Date.now(),
    });
    if (result.success) {
        cache.set(CACHE_KEY_FAILURE_COUNT, 0);
        cache.delete(CACHE_KEY_USER_DISMISSED);
        return;
    }
    const failures = cache.get(CACHE_KEY_FAILURE_COUNT) || 0;
    cache.set(CACHE_KEY_FAILURE_COUNT, failures + 1);
}
function recordBackgroundUpgradeError(error) {
    recordBackgroundUpgradeResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        shouldRetryWithPackageManager: true,
    });
}
export function isBackgroundUpgradeProcess() {
    return process.argv.includes(BACKGROUND_UPGRADE_ARG) && process.env[BACKGROUND_UPGRADE_ENV] === '1';
}
export async function runBackgroundUpgradeWorker() {
    const cache = CacheManager.getInstance();
    try {
        const result = await performSilentUpgrade();
        recordBackgroundUpgradeResult(result);
    }
    catch (error) {
        recordBackgroundUpgradeError(error);
    }
    finally {
        cache.delete('upgrade.backgroundRunning');
    }
}
export async function performBackgroundUpgrade() {
    try {
        const cache = CacheManager.getInstance();
        if (cache.get('upgrade.backgroundRunning')) {
            return;
        }
        cache.set('upgrade.backgroundRunning', true, BACKGROUND_RUNNING_TTL_MS);
        const invocation = buildCliInvocation([BACKGROUND_UPGRADE_ARG]);
        if (!invocation) {
            recordBackgroundUpgradeResult({
                success: false,
                error: 'Could not determine CLI entry point for background upgrade',
                shouldRetryWithPackageManager: true,
            });
            cache.delete('upgrade.backgroundRunning');
            return;
        }
        const child = spawn(invocation.command, invocation.args, {
            detached: true,
            stdio: 'ignore',
            shell: invocation.shell,
            windowsHide: true,
            env: {
                ...process.env,
                [BACKGROUND_UPGRADE_ENV]: '1',
            },
        });
        child.once('error', (error) => {
            recordBackgroundUpgradeError(error);
            cache.delete('upgrade.backgroundRunning');
        });
        child.unref();
    }
    catch {
        try {
            const cache = CacheManager.getInstance();
            cache.delete('upgrade.backgroundRunning');
        }
        catch {
        }
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
export function relaunchCLI() {
    const args = process.argv.slice(2);
    const invocation = buildCliInvocation(args);
    if (!invocation) {
        process.exit(1);
        return;
    }
    const child = spawn(invocation.command, invocation.args, {
        detached: true,
        stdio: 'inherit',
        shell: invocation.shell,
    });
    child.unref();
    process.exit(0);
}
function checkNeedsSudo() {
    if (process.platform !== 'darwin')
        return false;
    try {
        const installPath = getGlobalInstallPath();
        if (installPath && hasWritePermission(installPath)) {
            return false;
        }
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
