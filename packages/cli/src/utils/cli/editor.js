import { exec, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, unlinkSync, unwatchFile, watchFile, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { UILogger } from './ui';
const tempFiles = new Set();
export function cleanupTempFiles() {
    tempFiles.forEach((file) => {
        try {
            if (existsSync(file)) {
                unlinkSync(file);
            }
        }
        catch {
        }
    });
    tempFiles.clear();
}
process.on('exit', cleanupTempFiles);
process.on('SIGINT', () => {
    cleanupTempFiles();
    process.exit(0);
});
process.on('SIGTERM', () => {
    cleanupTempFiles();
    process.exit(0);
});
function detectEditor() {
    const editors = [
        process.env.EDITOR,
        process.env.VISUAL,
    ].filter(Boolean);
    const platformEditors = process.platform === 'win32'
        ? [
            'code',
            'cursor',
            'windsurf',
            'trae',
            'notepad.exe',
            'notepad',
        ]
        : process.platform === 'darwin'
            ? [
                'code',
                'cursor',
                'windsurf',
                'trae',
                'open',
            ]
            : [
                'code',
                'cursor',
                'windsurf',
                'trae',
                'nano',
                'vim',
                'vi',
            ];
    const allEditors = [...editors, ...platformEditors];
    for (const editor of allEditors) {
        if (editor && isCommandAvailable(editor)) {
            return editor;
        }
    }
    if (process.platform === 'win32') {
        return 'notepad';
    }
    else if (process.platform === 'darwin') {
        return 'open';
    }
    return null;
}
function getWindowsEditorPath(editorName) {
    if (process.platform !== 'win32') {
        return editorName;
    }
    try {
        const result = execSync(`where "${editorName}"`, { encoding: 'utf8', stdio: 'pipe' });
        const paths = result.trim().split('\n').filter(Boolean);
        if (paths.length > 0) {
            return paths[0].trim();
        }
    }
    catch {
        const commonPaths = {
            code: [
                `${process.env.LOCALAPPDATA}\\Programs\\Microsoft VS Code\\Code.exe`,
                `${process.env.PROGRAMFILES}\\Microsoft VS Code\\Code.exe`,
                `${process.env['PROGRAMFILES(X86)']}\\Microsoft VS Code\\Code.exe`,
            ],
            cursor: [
                `${process.env.LOCALAPPDATA}\\Programs\\cursor\\Cursor.exe`,
                `${process.env.PROGRAMFILES}\\Cursor\\Cursor.exe`,
                `${process.env['PROGRAMFILES(X86)']}\\Cursor\\Cursor.exe`,
            ],
            windsurf: [
                `${process.env.LOCALAPPDATA}\\Programs\\Windsurf\\Windsurf.exe`,
                `${process.env.PROGRAMFILES}\\Windsurf\\Windsurf.exe`,
                `${process.env['PROGRAMFILES(X86)']}\\Windsurf\\Windsurf.exe`,
            ],
        };
        const paths = commonPaths[editorName.toLowerCase()];
        if (paths) {
            for (const path of paths) {
                if (path && existsSync(path)) {
                    return path;
                }
            }
        }
    }
    return null;
}
function isCommandAvailable(command) {
    try {
        if (process.platform === 'win32') {
            const fullPath = getWindowsEditorPath(command);
            if (fullPath && fullPath !== command && existsSync(fullPath)) {
                return true;
            }
            try {
                execSync(`where "${command}"`, { stdio: 'ignore' });
                return true;
            }
            catch {
                return false;
            }
        }
        else {
            try {
                execSync(`which "${command}"`, { stdio: 'ignore' });
                return true;
            }
            catch {
                return false;
            }
        }
    }
    catch {
        return false;
    }
}
function createTempConfigFile(config, prefix = 'start-claude-config') {
    const tempDir = mkdtempSync(path.join(tmpdir(), prefix));
    const tempFile = path.join(tempDir, 'config.json');
    const editableConfig = {
        ...config,
        name: config.name || '',
        baseUrl: config.baseUrl || '',
        apiKey: config.apiKey || '',
        model: config.model || '',
        permissionMode: config.permissionMode || null,
        isDefault: config.isDefault || false,
        order: config.order ?? null,
        authToken: config.authToken || '',
        authorization: config.authorization || '',
        claudeCodeDisableNonessentialTraffic: config.claudeCodeDisableNonessentialTraffic ?? true,
        claudeCodeDisableExperimentalBetas: config.claudeCodeDisableExperimentalBetas ?? true,
        claudeCodeAttributionHeader: config.claudeCodeAttributionHeader ?? false,
        claudeCodeMaxRetries: config.claudeCodeMaxRetries ?? null,
        claudeCodeRetryWatchdog: config.claudeCodeRetryWatchdog ?? null,
        customHeaders: config.customHeaders || '',
        smallFastModel: config.smallFastModel || '',
        smallFastModelAwsRegion: config.smallFastModelAwsRegion || '',
        awsBearerTokenBedrock: config.awsBearerTokenBedrock || '',
        bashDefaultTimeoutMs: config.bashDefaultTimeoutMs ?? null,
        bashMaxTimeoutMs: config.bashMaxTimeoutMs ?? null,
        bashMaxOutputLength: config.bashMaxOutputLength ?? null,
        maintainProjectWorkingDir: config.maintainProjectWorkingDir ?? null,
        apiKeyHelperTtlMs: config.apiKeyHelperTtlMs ?? null,
        ideSkipAutoInstall: config.ideSkipAutoInstall ?? null,
        maxOutputTokens: config.maxOutputTokens ?? null,
        useBedrock: config.useBedrock ?? null,
        useVertex: config.useVertex ?? null,
        skipBedrockAuth: config.skipBedrockAuth ?? null,
        skipVertexAuth: config.skipVertexAuth ?? null,
        disableNonessentialTraffic: config.disableNonessentialTraffic ?? null,
        disableTerminalTitle: config.disableTerminalTitle ?? null,
        disableAutoupdater: config.disableAutoupdater ?? null,
        disableBugCommand: config.disableBugCommand ?? null,
        disableCostWarnings: config.disableCostWarnings ?? null,
        disableErrorReporting: config.disableErrorReporting ?? null,
        disableNonEssentialModelCalls: config.disableNonEssentialModelCalls ?? null,
        disableTelemetry: config.disableTelemetry ?? true,
        httpProxy: config.httpProxy || '',
        httpsProxy: config.httpsProxy || '',
        maxThinkingTokens: config.maxThinkingTokens ?? null,
        mcpTimeout: config.mcpTimeout ?? null,
        mcpToolTimeout: config.mcpToolTimeout ?? null,
        maxMcpOutputTokens: config.maxMcpOutputTokens ?? null,
        vertexRegionHaiku: config.vertexRegionHaiku || '',
        vertexRegionSonnet: config.vertexRegionSonnet || '',
        vertexRegion37Sonnet: config.vertexRegion37Sonnet || '',
        vertexRegion40Opus: config.vertexRegion40Opus || '',
        vertexRegion40Sonnet: config.vertexRegion40Sonnet || '',
    };
    writeFileSync(tempFile, JSON.stringify(editableConfig, null, 2), 'utf8');
    tempFiles.add(tempFile);
    return tempFile;
}
async function openEditor(filePath, editor) {
    return new Promise((resolve, reject) => {
        const editorArgs = [];
        if (editor === 'code' || editor === 'cursor' || editor === 'windsurf') {
            editorArgs.push('--wait');
        }
        else if (editor === 'open' && process.platform === 'darwin') {
            editorArgs.push('-W', '-t');
        }
        let editorCommand = editor;
        if (process.platform === 'win32') {
            const fullPath = getWindowsEditorPath(editor);
            if (fullPath) {
                editorCommand = fullPath;
            }
        }
        const quotedEditor = editorCommand.includes(' ') ? `"${editorCommand}"` : editorCommand;
        const commandArgs = [...editorArgs, `"${filePath}"`].join(' ');
        const fullCommand = `${quotedEditor} ${commandArgs}`;
        const child = exec(fullCommand, (error) => {
            if (error) {
                reject(error);
            }
            else {
                resolve();
            }
        });
        if (child) {
            child.on('error', (error) => {
                reject(error);
            });
        }
    });
}
async function openEditorWithFallback(filePath, primaryEditor) {
    try {
        await openEditor(filePath, primaryEditor);
    }
    catch (error) {
        const logger = new UILogger();
        logger.displayWarning(`Failed to open ${primaryEditor}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        const fallbackEditors = process.platform === 'win32'
            ? ['notepad.exe', 'notepad']
            : process.platform === 'darwin'
                ? ['open']
                : ['nano', 'vim', 'vi'];
        for (const fallbackEditor of fallbackEditors) {
            try {
                logger.displayInfo(`Trying fallback editor: ${fallbackEditor}`);
                await openEditor(filePath, fallbackEditor);
                return;
            }
            catch (fallbackError) {
                logger.displayWarning(`Fallback editor ${fallbackEditor} also failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
            }
        }
        throw new Error(`All editors failed. Last error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
function parseConfigFromFile(filePath) {
    try {
        const content = readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
            const logger = new UILogger();
            logger.displayError('Configuration name is required');
            return null;
        }
        const config = {
            name: parsed.name.trim(),
            profileType: parsed.profileType && ['default', 'official'].includes(parsed.profileType)
                ? parsed.profileType
                : undefined,
            baseUrl: parsed.baseUrl?.trim() || undefined,
            apiKey: parsed.apiKey?.trim() || undefined,
            model: parsed.model?.trim() || undefined,
            permissionMode: parsed.permissionMode && ['default', 'acceptEdits', 'auto', 'dontAsk', 'plan', 'bypassPermissions'].includes(parsed.permissionMode)
                ? parsed.permissionMode
                : undefined,
            isDefault: Boolean(parsed.isDefault),
            order: typeof parsed.order === 'number' ? parsed.order : undefined,
            authToken: parsed.authToken?.trim() || undefined,
            authorization: parsed.authorization?.trim() || undefined,
            claudeCodeDisableNonessentialTraffic: typeof parsed.claudeCodeDisableNonessentialTraffic === 'boolean' ? parsed.claudeCodeDisableNonessentialTraffic : true,
            claudeCodeDisableExperimentalBetas: typeof parsed.claudeCodeDisableExperimentalBetas === 'boolean' ? parsed.claudeCodeDisableExperimentalBetas : true,
            claudeCodeAttributionHeader: typeof parsed.claudeCodeAttributionHeader === 'boolean' ? parsed.claudeCodeAttributionHeader : undefined,
            claudeCodeMaxRetries: typeof parsed.claudeCodeMaxRetries === 'number' ? parsed.claudeCodeMaxRetries : undefined,
            claudeCodeRetryWatchdog: typeof parsed.claudeCodeRetryWatchdog === 'boolean' ? parsed.claudeCodeRetryWatchdog : undefined,
            customHeaders: parsed.customHeaders?.trim() || undefined,
            smallFastModel: parsed.smallFastModel?.trim() || undefined,
            smallFastModelAwsRegion: parsed.smallFastModelAwsRegion?.trim() || undefined,
            awsBearerTokenBedrock: parsed.awsBearerTokenBedrock?.trim() || undefined,
            bashDefaultTimeoutMs: typeof parsed.bashDefaultTimeoutMs === 'number' ? parsed.bashDefaultTimeoutMs : undefined,
            bashMaxTimeoutMs: typeof parsed.bashMaxTimeoutMs === 'number' ? parsed.bashMaxTimeoutMs : undefined,
            bashMaxOutputLength: typeof parsed.bashMaxOutputLength === 'number' ? parsed.bashMaxOutputLength : undefined,
            maintainProjectWorkingDir: typeof parsed.maintainProjectWorkingDir === 'boolean' ? parsed.maintainProjectWorkingDir : undefined,
            apiKeyHelperTtlMs: typeof parsed.apiKeyHelperTtlMs === 'number' ? parsed.apiKeyHelperTtlMs : undefined,
            ideSkipAutoInstall: typeof parsed.ideSkipAutoInstall === 'boolean' ? parsed.ideSkipAutoInstall : undefined,
            maxOutputTokens: typeof parsed.maxOutputTokens === 'number' ? parsed.maxOutputTokens : undefined,
            useBedrock: typeof parsed.useBedrock === 'boolean' ? parsed.useBedrock : undefined,
            useVertex: typeof parsed.useVertex === 'boolean' ? parsed.useVertex : undefined,
            skipBedrockAuth: typeof parsed.skipBedrockAuth === 'boolean' ? parsed.skipBedrockAuth : undefined,
            skipVertexAuth: typeof parsed.skipVertexAuth === 'boolean' ? parsed.skipVertexAuth : undefined,
            disableNonessentialTraffic: typeof parsed.disableNonessentialTraffic === 'boolean' ? parsed.disableNonessentialTraffic : undefined,
            disableTerminalTitle: typeof parsed.disableTerminalTitle === 'boolean' ? parsed.disableTerminalTitle : undefined,
            disableAutoupdater: typeof parsed.disableAutoupdater === 'boolean' ? parsed.disableAutoupdater : undefined,
            disableBugCommand: typeof parsed.disableBugCommand === 'boolean' ? parsed.disableBugCommand : undefined,
            disableCostWarnings: typeof parsed.disableCostWarnings === 'boolean' ? parsed.disableCostWarnings : undefined,
            disableErrorReporting: typeof parsed.disableErrorReporting === 'boolean' ? parsed.disableErrorReporting : undefined,
            disableNonEssentialModelCalls: typeof parsed.disableNonEssentialModelCalls === 'boolean' ? parsed.disableNonEssentialModelCalls : undefined,
            disableTelemetry: typeof parsed.disableTelemetry === 'boolean' ? parsed.disableTelemetry : undefined,
            httpProxy: parsed.httpProxy?.trim() || undefined,
            httpsProxy: parsed.httpsProxy?.trim() || undefined,
            maxThinkingTokens: typeof parsed.maxThinkingTokens === 'number' ? parsed.maxThinkingTokens : undefined,
            mcpTimeout: typeof parsed.mcpTimeout === 'number' ? parsed.mcpTimeout : undefined,
            mcpToolTimeout: typeof parsed.mcpToolTimeout === 'number' ? parsed.mcpToolTimeout : undefined,
            maxMcpOutputTokens: typeof parsed.maxMcpOutputTokens === 'number' ? parsed.maxMcpOutputTokens : undefined,
            vertexRegionHaiku: parsed.vertexRegionHaiku?.trim() || undefined,
            vertexRegionSonnet: parsed.vertexRegionSonnet?.trim() || undefined,
            vertexRegion37Sonnet: parsed.vertexRegion37Sonnet?.trim() || undefined,
            vertexRegion40Opus: parsed.vertexRegion40Opus?.trim() || undefined,
            vertexRegion40Sonnet: parsed.vertexRegion40Sonnet?.trim() || undefined,
            vertexRegion45Sonnet: parsed.vertexRegion45Sonnet?.trim() || undefined,
        };
        return config;
    }
    catch (error) {
        const logger = new UILogger();
        logger.displayError(`Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}
export async function editConfigInEditor(config) {
    const editor = detectEditor();
    if (!editor) {
        const logger = new UILogger();
        logger.displayError('No suitable editor found. Please set EDITOR environment variable or install VS Code, Cursor, Windsurf, or another supported editor.');
        return null;
    }
    const logger = new UILogger();
    logger.displayInfo(`Opening configuration in ${editor}...`);
    const tempFile = createTempConfigFile(config);
    try {
        await openEditorWithFallback(tempFile, editor);
        const updatedConfig = parseConfigFromFile(tempFile);
        if (updatedConfig) {
            logger.displaySuccess('Configuration updated successfully!');
            return updatedConfig;
        }
        return null;
    }
    catch (error) {
        const logger = new UILogger();
        logger.displayError(`Failed to open editor: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
    finally {
        if (tempFiles.has(tempFile)) {
            tempFiles.delete(tempFile);
            try {
                unlinkSync(tempFile);
            }
            catch {
            }
        }
    }
}
export async function createConfigInEditor() {
    const editor = detectEditor();
    if (!editor) {
        const logger = new UILogger();
        logger.displayError('No suitable editor found. Please set EDITOR environment variable or install VS Code, Cursor, Windsurf, or another supported editor.');
        return null;
    }
    const logger = new UILogger();
    logger.displayInfo(`Creating new configuration in ${editor}...`);
    logger.displayWarning('Please fill in the configuration details and save the file.');
    const tempFile = createTempConfigFile({});
    try {
        await openEditorWithFallback(tempFile, editor);
        const newConfig = parseConfigFromFile(tempFile);
        if (newConfig) {
            logger.displaySuccess('Configuration created successfully!');
            return newConfig;
        }
        return null;
    }
    catch (error) {
        const logger = new UILogger();
        logger.displayError(`Failed to open editor: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
    finally {
        if (tempFiles.has(tempFile)) {
            tempFiles.delete(tempFile);
            try {
                unlinkSync(tempFile);
            }
            catch {
            }
        }
    }
}
export async function editConfigFileInEditor(configFilePath, onConfigReload) {
    const editor = detectEditor();
    if (!editor) {
        const logger = new UILogger();
        logger.displayError('No suitable editor found. Please set EDITOR environment variable or install VS Code, Cursor, Windsurf, or another supported editor.');
        return;
    }
    const logger = new UILogger();
    logger.displayInfo(`Opening configuration file in ${editor}...`);
    logger.displayInfo(`Config file: ${configFilePath}`);
    logger.displayInfo('💡 Save the file to reload the configuration automatically. Press Ctrl+C to stop watching.');
    let isWatching = true;
    let lastModified = 0;
    const watchCallback = () => {
        try {
            const stats = existsSync(configFilePath) ? statSync(configFilePath) : null;
            if (stats && stats.mtime.getTime() !== lastModified) {
                lastModified = stats.mtime.getTime();
                logger.displayInfo('🔄 Configuration file changed, reloading...');
                try {
                    const content = readFileSync(configFilePath, 'utf8');
                    const config = JSON.parse(content);
                    onConfigReload(config);
                    logger.displaySuccess('✅ Configuration reloaded successfully!');
                }
                catch (error) {
                    logger.displayError(`❌ Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
        catch (error) {
            logger.displayError(`❌ Error watching config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };
    if (existsSync(configFilePath)) {
        const stats = statSync(configFilePath);
        lastModified = stats.mtime.getTime();
    }
    watchFile(configFilePath, { interval: 1000 }, watchCallback);
    const cleanup = () => {
        if (isWatching) {
            unwatchFile(configFilePath, watchCallback);
            isWatching = false;
            logger.displayInfo('🛑 Stopped watching configuration file.');
        }
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    try {
        await openEditorWithFallback(configFilePath, editor);
    }
    catch (error) {
        logger.displayError(`Failed to open editor: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    finally {
        cleanup();
    }
}
