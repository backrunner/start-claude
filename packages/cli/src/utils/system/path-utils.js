import { execSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
export const START_CLAUDE_PROJECT_ROOT_ENV = 'START_CLAUDE_PROJECT_ROOT';
export function resolveClaudeProjectRoot(env = process.env, cwd = process.cwd()) {
    const configuredRoot = env[START_CLAUDE_PROJECT_ROOT_ENV]?.trim()
        || env.INIT_CWD?.trim()
        || env.PWD?.trim();
    return path.resolve(cwd, configuredRoot || '.');
}
export function findExecutable(command, options = {}) {
    const { env = process.env, extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.ps1', '.bat', ''] : [''], skipDirs = ['.start-claude'], } = options;
    const pathEnv = env.PATH || env.Path || '';
    let pathDirs = pathEnv.split(path.delimiter);
    const globalPaths = getGlobalNodePaths(env);
    pathDirs = [...globalPaths, ...pathDirs];
    for (const dir of pathDirs) {
        if (skipDirs.some(skipDir => dir.includes(skipDir))) {
            continue;
        }
        for (const ext of extensions) {
            const fullPath = path.join(dir, command + ext);
            try {
                accessSync(fullPath, constants.F_OK);
                return fullPath;
            }
            catch {
            }
        }
    }
    return null;
}
export function getGlobalNodePaths(env = process.env) {
    const paths = [];
    if (process.platform === 'win32') {
        if (env.APPDATA) {
            paths.push(path.join(env.APPDATA, 'npm'));
        }
        if (env.ProgramFiles) {
            paths.push(path.join(env.ProgramFiles, 'nodejs'));
        }
        if (env['ProgramFiles(x86)']) {
            paths.push(path.join(env['ProgramFiles(x86)'], 'nodejs'));
        }
        if (env.LOCALAPPDATA) {
            paths.push(path.join(env.LOCALAPPDATA, 'npm'));
            paths.push(path.join(env.LOCALAPPDATA, 'Programs', 'claude'));
            paths.push(path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages'));
        }
        if (env.USERPROFILE) {
            paths.push(path.join(env.USERPROFILE, '.bun', 'bin'));
            paths.push(path.join(env.USERPROFILE, '.claude', 'bin'));
        }
    }
    else {
        paths.push('/usr/local/bin');
        paths.push('/usr/bin');
        paths.push('/opt/homebrew/bin');
        paths.push('/usr/local/opt/node@16/bin');
        paths.push('/usr/local/opt/node@18/bin');
        paths.push('/usr/local/opt/node@20/bin');
        if (env.NVM_DIR) {
            paths.push(path.join(env.NVM_DIR, 'versions', 'node'));
            const currentNodeVersion = env.NVM_BIN;
            if (currentNodeVersion) {
                paths.push(currentNodeVersion);
            }
        }
        if (env.N_PREFIX) {
            paths.push(path.join(env.N_PREFIX, 'bin'));
        }
        if (env.HOME) {
            paths.push(path.join(env.HOME, '.npm-global', 'bin'));
            paths.push(path.join(env.HOME, '.nvm', 'versions', 'node'));
            paths.push(path.join(env.HOME, '.n', 'bin'));
            paths.push(path.join(env.HOME, '.bun', 'bin'));
            paths.push(path.join(env.HOME, '.claude', 'bin'));
            paths.push(path.join(env.HOME, '.local', 'bin'));
        }
        paths.push('/snap/bin');
    }
    return paths.filter(p => p && p !== 'npm' && p !== 'nodejs');
}
export function isGlobalNodePath(dirPath) {
    if (!dirPath)
        return false;
    if (process.platform === 'win32') {
        const windowsPatterns = [
            /[\\/]npm[\\/]?$/i,
            /[\\/]nodejs[\\/]?$/i,
            /AppData[\\/]Roaming[\\/]npm/i,
            /Program Files[\\/]nodejs/i,
            /\.bun[\\/]bin/i,
            /\.claude[\\/]bin/i,
            /WinGet[\\/]Packages/i,
            /Programs[\\/]claude/i,
        ];
        return windowsPatterns.some(pattern => pattern.test(dirPath));
    }
    else {
        const unixPatterns = [
            /\/usr\/local\/bin/,
            /\/usr\/bin/,
            /\/opt\/homebrew\/bin/,
            /\.npm-global\/bin/,
            /\.nvm\/versions\/node/,
            /\.n\/bin/,
            /\/usr\/local\/opt\/node@\d+\/bin/,
            /\.bun\/bin/,
            /\.claude\/bin/,
            /\.local\/bin/,
            /\/snap\/bin/,
        ];
        return unixPatterns.some(pattern => pattern.test(dirPath));
    }
}
export function isWSL() {
    if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
        return true;
    }
    try {
        if (existsSync('/proc/version')) {
            const versionContent = readFileSync('/proc/version', 'utf-8').toLowerCase();
            return versionContent.includes('microsoft') || versionContent.includes('wsl');
        }
    }
    catch {
    }
    try {
        if (existsSync('/etc/os-release')) {
            const osReleaseContent = readFileSync('/etc/os-release', 'utf-8').toLowerCase();
            return osReleaseContent.includes('microsoft') || osReleaseContent.includes('wsl');
        }
    }
    catch {
    }
    return false;
}
export function getWindowsUserPath() {
    if (!isWSL()) {
        return null;
    }
    try {
        try {
            const windowsHome = execSync('wslpath "$(cmd.exe /c "echo %USERPROFILE%" 2>/dev/null | tr -d \'\\r\')"', {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore'],
            }).trim();
            if (windowsHome && existsSync(windowsHome)) {
                return windowsHome;
            }
        }
        catch {
        }
        if (process.env.USERPROFILE) {
            const userProfile = process.env.USERPROFILE;
            const wslPath = userProfile
                .replace(/\\/g, '/')
                .replace(/^([A-Z]):/i, (_, drive) => `/mnt/${drive.toLowerCase()}`);
            if (existsSync(wslPath)) {
                return wslPath;
            }
        }
        const username = execSync('cmd.exe /c "echo %USERNAME%" 2>/dev/null', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        if (username) {
            const commonPaths = [
                `/mnt/c/Users/${username}`,
                `/mnt/c/Users/${username.toLowerCase()}`,
            ];
            for (const testPath of commonPaths) {
                if (existsSync(testPath)) {
                    return testPath;
                }
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
export function getWSLDistroName() {
    if (!isWSL()) {
        return null;
    }
    if (process.env.WSL_DISTRO_NAME) {
        return process.env.WSL_DISTRO_NAME;
    }
    try {
        if (existsSync('/etc/os-release')) {
            const osReleaseContent = readFileSync('/etc/os-release', 'utf-8');
            const nameMatch = osReleaseContent.match(/^NAME="?([^"\n]+)"?/m);
            if (nameMatch) {
                return nameMatch[1];
            }
        }
    }
    catch {
    }
    return null;
}
export function windowsPathToWSL(windowsPath) {
    if (!isWSL()) {
        return null;
    }
    try {
        const wslPath = execSync(`wslpath "${windowsPath}"`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        return wslPath || null;
    }
    catch {
        const normalized = windowsPath.replace(/\\/g, '/');
        const wslPath = normalized.replace(/^([A-Z]):/i, (_, drive) => `/mnt/${drive.toLowerCase()}`);
        return wslPath;
    }
}
export function wslPathToWindows(wslPath) {
    if (!isWSL()) {
        return null;
    }
    try {
        const windowsPath = execSync(`wslpath -w "${wslPath}"`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        return windowsPath || null;
    }
    catch {
        const match = wslPath.match(/^\/mnt\/([a-z])\/(.+)/);
        if (match) {
            const [, drive, rest] = match;
            return `${drive.toUpperCase()}:\\${rest.replace(/\//g, '\\')}`;
        }
        return null;
    }
}
