import { accessSync, constants } from 'node:fs';
import process from 'node:process';
import { CacheManager } from '../config/cache-manager';
import { findExecutable } from '../system/path-utils';
const INSTALL_METHODS = [
    {
        method: 'pnpm',
        name: 'pnpm',
        command: 'pnpm',
        installCmd: 'pnpm add -g @anthropic-ai/claude-code',
        updateCmd: 'pnpm update -g @anthropic-ai/claude-code',
        priority: 10,
    },
    {
        method: 'npm',
        name: 'npm',
        command: 'npm',
        installCmd: 'npm install -g @anthropic-ai/claude-code',
        updateCmd: 'npm update -g @anthropic-ai/claude-code',
        priority: 15,
    },
    {
        method: 'yarn',
        name: 'yarn',
        command: 'yarn',
        installCmd: 'yarn global add @anthropic-ai/claude-code',
        updateCmd: 'yarn global upgrade @anthropic-ai/claude-code',
        priority: 20,
    },
    {
        method: 'bun',
        name: 'bun',
        command: 'bun',
        installCmd: 'bun add -g @anthropic-ai/claude-code',
        updateCmd: 'bun update -g @anthropic-ai/claude-code',
        priority: 25,
    },
    {
        method: 'homebrew',
        name: 'Homebrew',
        command: 'brew',
        installCmd: 'brew install claude-code',
        updateCmd: 'brew upgrade claude-code',
        priority: 30,
    },
    {
        method: 'winget',
        name: 'winget',
        command: 'winget',
        installCmd: 'winget install Anthropic.ClaudeCode',
        updateCmd: 'winget upgrade Anthropic.ClaudeCode',
        priority: 30,
    },
    {
        method: 'official-script',
        name: 'Official Installer',
        command: 'curl',
        installCmd: getOfficialInstallCommand(),
        updateCmd: 'claude update',
        priority: 40,
    },
];
function getOfficialInstallCommand() {
    if (process.platform === 'win32') {
        return 'irm https://claude.ai/install.ps1 | iex';
    }
    return 'curl -fsSL https://claude.ai/install.sh | sh';
}
function isCommandInPath(command) {
    return findExecutable(command) !== null;
}
export async function detectAvailableInstallMethods() {
    const methods = [];
    for (const method of INSTALL_METHODS) {
        if (method.method === 'homebrew' && process.platform !== 'darwin') {
            continue;
        }
        if (method.method === 'winget' && process.platform !== 'win32') {
            continue;
        }
        let available = false;
        if (method.method === 'official-script') {
            available = isCommandInPath('curl') || isCommandInPath('wget');
        }
        else {
            available = isCommandInPath(method.command);
        }
        methods.push({ ...method, available });
    }
    return methods.sort((a, b) => a.priority - b.priority);
}
export function detectInstallMethodFromPath(claudePath) {
    const normalizedPath = claudePath.toLowerCase();
    if (normalizedPath.includes('pnpm')) {
        return 'pnpm';
    }
    if (normalizedPath.includes('node_modules') || normalizedPath.includes('/npm/') || normalizedPath.includes('\\npm\\')) {
        return 'npm';
    }
    if (normalizedPath.includes('.bun/bin') || normalizedPath.includes('.bun\\bin')) {
        return 'bun';
    }
    if (normalizedPath.includes('/homebrew/') || normalizedPath.includes('/opt/homebrew/') || normalizedPath.includes('/cellar/')) {
        return 'homebrew';
    }
    if (normalizedPath.includes('winget') || normalizedPath.includes('microsoft\\winget') || normalizedPath.includes('programs\\claude')) {
        return 'winget';
    }
    if (normalizedPath.includes('.claude/bin') || normalizedPath.includes('.claude\\bin')) {
        return 'official-script';
    }
    return 'unknown';
}
export function getUpdateCommand(method) {
    const methodInfo = INSTALL_METHODS.find(m => m.method === method);
    if (methodInfo) {
        return methodInfo.updateCmd;
    }
    return 'npm update -g @anthropic-ai/claude-code';
}
export function getInstallCommand(method) {
    const methodInfo = INSTALL_METHODS.find(m => m.method === method);
    if (methodInfo) {
        return methodInfo.installCmd;
    }
    return 'npm install -g @anthropic-ai/claude-code';
}
export function findClaudeExecutable(env = process.env) {
    const cache = CacheManager.getInstance();
    const cachedPath = cache.getClaudePath();
    if (cachedPath) {
        try {
            accessSync(cachedPath, constants.F_OK | constants.X_OK);
            const cachedMethod = cache.getClaudeInstallMethod() || 'unknown';
            return { path: cachedPath, method: cachedMethod };
        }
        catch {
            cache.clearClaudePathCache();
        }
    }
    const claudePath = findExecutable('claude', { env, skipDirs: ['.start-claude'] });
    if (!claudePath) {
        return null;
    }
    const method = detectInstallMethodFromPath(claudePath);
    cache.setClaudePath(claudePath, method);
    return { path: claudePath, method };
}
