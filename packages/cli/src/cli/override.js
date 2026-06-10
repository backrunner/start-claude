import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';
const UNIX_SHELLS = {
    bash: {
        path: path.join(os.homedir(), '.bashrc'),
        aliasPrefix: 'alias',
        aliasFormat: 'export PATH="$HOME/.start-claude/bin:$PATH"\nalias claude="start-claude"',
        comment: '# start-claude override',
    },
    zsh: {
        path: path.join(os.homedir(), '.zshrc'),
        aliasPrefix: 'alias',
        aliasFormat: 'export PATH="$HOME/.start-claude/bin:$PATH"\nalias claude="start-claude"',
        comment: '# start-claude override',
    },
    fish: {
        path: path.join(os.homedir(), '.config/fish/config.fish'),
        aliasPrefix: 'alias',
        aliasFormat: 'set -x PATH "$HOME/.start-claude/bin" $PATH\nalias claude="start-claude"',
        comment: '# start-claude override',
    },
};
const WINDOWS_SHELLS = {
    'powershell': {
        path: path.join(os.homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
        aliasPrefix: 'Set-Alias',
        aliasFormat: 'Set-Alias -Name claude -Value start-claude',
        comment: '# start-claude override',
    },
    'pwsh': {
        path: path.join(os.homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
        aliasPrefix: 'Set-Alias',
        aliasFormat: 'Set-Alias -Name claude -Value start-claude',
        comment: '# start-claude override',
    },
    'cmd': {
        path: path.join(os.homedir(), 'claude-alias.bat'),
        aliasPrefix: '@echo off',
        aliasFormat: '@echo off\nstart-claude %*',
        comment: 'REM start-claude override',
    },
    'git-bash': {
        path: path.join(os.homedir(), '.bashrc'),
        aliasPrefix: 'alias',
        aliasFormat: 'alias claude="start-claude"',
        comment: '# start-claude override',
    },
};
export class OverrideManager {
    static instance;
    static getInstance() {
        if (!OverrideManager.instance) {
            OverrideManager.instance = new OverrideManager();
        }
        return OverrideManager.instance;
    }
    isWindows() {
        return process.platform === 'win32';
    }
    getCurrentUnixShell() {
        return process.env.SHELL?.split('/').pop() ?? null;
    }
    detectWindowsShell() {
        if (process.env.PSModulePath) {
            return 'powershell';
        }
        if (process.env.SHELL && process.env.SHELL.includes('bash')) {
            return 'git-bash';
        }
        if (process.env.COMSPEC && process.env.COMSPEC.includes('cmd')) {
            return 'cmd';
        }
        return 'powershell';
    }
    getShellConfig() {
        if (this.isWindows()) {
            const shell = this.detectWindowsShell();
            if (shell && WINDOWS_SHELLS[shell]) {
                return WINDOWS_SHELLS[shell];
            }
            return null;
        }
        const shell = this.getCurrentUnixShell();
        if (shell && UNIX_SHELLS[shell]) {
            return UNIX_SHELLS[shell];
        }
        return null;
    }
    ensureDirectoryExists(filePath) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    setupScriptDirectory() {
        try {
            const scriptDir = path.join(os.homedir(), '.start-claude', 'bin');
            const scriptPath = path.join(scriptDir, 'claude');
            if (!fs.existsSync(scriptDir)) {
                fs.mkdirSync(scriptDir, { recursive: true });
            }
            const scriptContent = this.isWindows()
                ? `@echo off\nstart-claude %*`
                : `#!/bin/bash\nexec start-claude "$@"`;
            fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
            if (!this.isWindows()) {
                fs.chmodSync(scriptPath, 0o755);
            }
            return true;
        }
        catch {
            return false;
        }
    }
    removeScriptDirectory() {
        try {
            const scriptDir = path.join(os.homedir(), '.start-claude', 'bin');
            if (fs.existsSync(scriptDir)) {
                fs.rmSync(scriptDir, { recursive: true, force: true });
            }
            return true;
        }
        catch {
            return false;
        }
    }
    setupWindowsCmdAlias(shellConfig) {
        try {
            this.ensureDirectoryExists(shellConfig.path);
            const batchContent = `${shellConfig.comment}\n${shellConfig.aliasFormat}`;
            fs.writeFileSync(shellConfig.path, batchContent, 'utf-8');
            const userPath = process.env.PATH || '';
            const batchDir = path.dirname(shellConfig.path);
            if (!userPath.includes(batchDir)) {
                console.log(`\nTo complete the setup for Command Prompt:`);
                console.log(`1. The alias file has been created at: ${shellConfig.path}`);
                console.log(`2. Add ${batchDir} to your system PATH environment variable`);
                console.log(`3. Or move the file to a directory already in your PATH`);
            }
            return true;
        }
        catch {
            return false;
        }
    }
    isOverrideActive() {
        const shellConfig = this.getShellConfig();
        if (!shellConfig) {
            return false;
        }
        const scriptPath = path.join(os.homedir(), '.start-claude', 'bin', 'claude');
        const scriptExists = fs.existsSync(scriptPath);
        try {
            if (!fs.existsSync(shellConfig.path)) {
                return scriptExists;
            }
            const content = fs.readFileSync(shellConfig.path, 'utf-8');
            if (this.isWindows() && this.detectWindowsShell() === 'cmd') {
                return scriptExists || content.includes('start-claude %*');
            }
            const hasPathExport = content.includes('export PATH="$HOME/.start-claude/bin:$PATH"')
                || content.includes('set -x PATH "$HOME/.start-claude/bin" $PATH');
            const hasAlias = content.includes('alias claude="start-claude"');
            return scriptExists || hasPathExport || hasAlias;
        }
        catch {
            return scriptExists;
        }
    }
    enableOverride() {
        const shellConfig = this.getShellConfig();
        if (!shellConfig) {
            return false;
        }
        if (this.isWindows() && this.detectWindowsShell() === 'cmd') {
            return this.setupWindowsCmdAlias(shellConfig);
        }
        try {
            const scriptSetup = this.setupScriptDirectory();
            if (!scriptSetup) {
                return false;
            }
            this.ensureDirectoryExists(shellConfig.path);
            let content = '';
            if (fs.existsSync(shellConfig.path)) {
                content = fs.readFileSync(shellConfig.path, 'utf-8');
                const lines = content.split('\n');
                const filteredLines = lines.filter(line => !line.includes(shellConfig.comment)
                    && !line.includes('alias claude="start-claude"')
                    && !line.includes('Set-Alias -Name claude -Value start-claude')
                    && !line.includes('export PATH="$HOME/.start-claude/bin:$PATH"')
                    && !line.includes('set -x PATH "$HOME/.start-claude/bin" $PATH'));
                content = filteredLines.join('\n');
            }
            const overrideLines = [shellConfig.comment, shellConfig.aliasFormat];
            const newContent = `${content.trim()}\n\n${overrideLines.join('\n')}\n`;
            fs.writeFileSync(shellConfig.path, newContent, 'utf-8');
            return true;
        }
        catch {
            return false;
        }
    }
    disableOverride() {
        const shellConfig = this.getShellConfig();
        if (!shellConfig) {
            return { success: false };
        }
        try {
            this.removeScriptDirectory();
            let cleanupCommand;
            if (!this.isWindows()) {
                cleanupCommand = this.cleanupCurrentSessionPath() || undefined;
            }
            if (!fs.existsSync(shellConfig.path)) {
                return { success: true, cleanupCommand };
            }
            if (this.isWindows() && this.detectWindowsShell() === 'cmd') {
                if (fs.existsSync(shellConfig.path)) {
                    fs.unlinkSync(shellConfig.path);
                }
                return { success: true, cleanupCommand };
            }
            const content = fs.readFileSync(shellConfig.path, 'utf-8');
            const lines = content.split('\n');
            const filteredLines = lines.filter(line => !line.includes(shellConfig.comment)
                && !line.includes('alias claude="start-claude"')
                && !line.includes('Set-Alias -Name claude -Value start-claude')
                && !line.includes('export PATH="$HOME/.start-claude/bin:$PATH"')
                && !line.includes('set -x PATH "$HOME/.start-claude/bin" $PATH'));
            const newContent = filteredLines.join('\n');
            fs.writeFileSync(shellConfig.path, newContent, 'utf-8');
            return { success: true, cleanupCommand };
        }
        catch {
            return { success: false };
        }
    }
    cleanupCurrentSessionPath() {
        try {
            const currentPath = process.env.PATH || '';
            const overridePath = path.join(os.homedir(), '.start-claude', 'bin');
            const pathSeparator = this.isWindows() ? ';' : ':';
            const pathParts = currentPath.split(pathSeparator);
            const cleanedParts = pathParts.filter((part) => {
                const normalizedPart = path.normalize(part);
                const normalizedOverride = path.normalize(overridePath);
                return normalizedPart !== normalizedOverride;
            });
            const cleanedPath = cleanedParts.join(pathSeparator);
            const shell = this.getCurrentUnixShell();
            if (shell === 'fish') {
                return `set -x PATH ${cleanedParts.map(p => `"${p}"`).join(' ')}`;
            }
            else {
                return `export PATH="${cleanedPath}"`;
            }
        }
        catch {
            return null;
        }
    }
    getShellInfo() {
        const platform = this.isWindows() ? 'windows' : 'unix';
        if (this.isWindows()) {
            const shell = this.detectWindowsShell();
            const shellConfig = shell ? WINDOWS_SHELLS[shell] : null;
            let instructions = '';
            if (shell === 'cmd') {
                instructions = 'For Command Prompt, you may need to add the alias file directory to your PATH';
            }
            else if (shell === 'powershell') {
                instructions = 'For PowerShell, you may need to set execution policy: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser';
            }
            return {
                shell,
                configFile: shellConfig?.path || null,
                platform,
                instructions,
            };
        }
        const shell = this.getCurrentUnixShell();
        const shellConfig = this.getShellConfig();
        return {
            shell,
            configFile: shellConfig?.path || null,
            platform,
        };
    }
    getSupportedShells() {
        if (this.isWindows()) {
            return Object.keys(WINDOWS_SHELLS);
        }
        return Object.keys(UNIX_SHELLS);
    }
}
