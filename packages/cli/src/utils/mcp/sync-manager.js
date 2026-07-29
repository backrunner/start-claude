import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import dayjs from 'dayjs';
import { UILogger } from '../cli/ui';
export class McpSyncManager {
    static instance;
    CLAUDE_DESKTOP_CONFIG_PATH_MACOS;
    CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS;
    CLAUDE_CODE_CONFIG_PATH;
    CLAUDE_CODE_LEGACY_SETTINGS_PATH;
    constructor(paths = {}) {
        this.CLAUDE_DESKTOP_CONFIG_PATH_MACOS = paths.claudeDesktopConfigPathMacos
            ?? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        this.CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS = paths.claudeDesktopConfigPathWindows
            ?? join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
        this.CLAUDE_CODE_CONFIG_PATH = paths.claudeCodeConfigPath ?? join(homedir(), '.claude.json');
        this.CLAUDE_CODE_LEGACY_SETTINGS_PATH = paths.claudeCodeLegacySettingsPath
            ?? join(homedir(), '.claude', 'settings.json');
    }
    static getInstance() {
        if (!McpSyncManager.instance) {
            McpSyncManager.instance = new McpSyncManager();
        }
        return McpSyncManager.instance;
    }
    getClaudeDesktopConfigPath() {
        if (process.platform === 'darwin') {
            return existsSync(this.CLAUDE_DESKTOP_CONFIG_PATH_MACOS) ? this.CLAUDE_DESKTOP_CONFIG_PATH_MACOS : null;
        }
        else if (process.platform === 'win32') {
            return existsSync(this.CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS) ? this.CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS : null;
        }
        return null;
    }
    async getConfigManager() {
        const { ConfigManager } = await import('../../config/manager');
        return ConfigManager.getInstance();
    }
    extractMcpFromClaudeDesktop(options = {}) {
        const logger = new UILogger(options.verbose);
        const configPath = this.getClaudeDesktopConfigPath();
        if (!configPath) {
            logger.displayVerbose('🔍 Claude Desktop config not found');
            return null;
        }
        try {
            logger.displayVerbose(`📁 Reading Claude Desktop config: ${configPath}`);
            const configData = readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            const serverConfigs = getMcpServers(config);
            if (!serverConfigs || Object.keys(serverConfigs).length === 0) {
                logger.displayVerbose('📋 No MCP servers found in Claude Desktop config');
                return null;
            }
            logger.displayVerbose(`✅ Found ${Object.keys(serverConfigs).length} MCP server(s) in Claude Desktop config`);
            return serverConfigs;
        }
        catch (error) {
            logger.displayVerbose(`⚠️ Error reading Claude Desktop config: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    extractMcpFromClaudeCodeSettings(options = {}) {
        const logger = new UILogger(options.verbose);
        const configPaths = [
            this.CLAUDE_CODE_LEGACY_SETTINGS_PATH,
            this.CLAUDE_CODE_CONFIG_PATH,
        ].filter(existsSync);
        if (configPaths.length === 0) {
            logger.displayVerbose('📁 Claude Code MCP config not found');
            return null;
        }
        try {
            const serverConfigs = {};
            for (const configPath of configPaths) {
                try {
                    logger.displayVerbose(`📁 Reading Claude Code config: ${configPath}`);
                    const configData = readFileSync(configPath, 'utf8');
                    const config = JSON.parse(configData);
                    Object.assign(serverConfigs, getMcpServers(config) ?? {});
                }
                catch (error) {
                    logger.displayVerbose(`⚠️ Error reading Claude Code config ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            if (Object.keys(serverConfigs).length === 0) {
                logger.displayVerbose('📋 No MCP servers found in Claude Code config');
                return null;
            }
            logger.displayVerbose(`✅ Found ${Object.keys(serverConfigs).length} MCP server(s) in ~/.claude/settings.json`);
            return serverConfigs;
        }
        catch (error) {
            logger.displayVerbose(`⚠️ Error reading ~/.claude/settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    async syncMcpSettings(options = {}) {
        const logger = new UILogger(options.verbose);
        const configManager = await this.getConfigManager();
        const settings = await configManager.getSettings();
        if ((settings.mcpSync?.enabled ?? true) === false && !options.force) {
            logger.displayVerbose('🔄 MCP sync is disabled, skipping');
            return true;
        }
        logger.displayVerbose('🔍 Starting MCP settings synchronization...');
        const desktopServers = this.extractMcpFromClaudeDesktop(options);
        const codeServers = this.extractMcpFromClaudeCodeSettings(options);
        if (!desktopServers && !codeServers) {
            logger.displayVerbose('ℹ️ No MCP servers found to sync');
            return true;
        }
        const allServers = {
            ...(codeServers ?? {}),
            ...(desktopServers ?? {}),
        };
        const mcpSyncConfig = {
            enabled: settings.mcpSync?.enabled ?? true,
            servers: allServers,
            lastSyncTime: dayjs().toISOString(),
        };
        await configManager.updateSettings({
            mcpSync: mcpSyncConfig,
        });
        const serverCount = Object.keys(allServers).length;
        logger.displayVerbose(`✅ MCP sync completed - ${serverCount} server(s) synchronized`);
        return true;
    }
    async checkAndSyncMcp(options = {}) {
        const logger = new UILogger(options.verbose);
        const configManager = await this.getConfigManager();
        const settings = await configManager.getSettings();
        const mcpSyncEnabled = settings.mcpSync?.enabled ?? true;
        if (!mcpSyncEnabled) {
            logger.displayVerbose('🔄 MCP sync is disabled');
            return true;
        }
        try {
            return await this.syncMcpSettings(options);
        }
        catch (error) {
            logger.displayVerbose(`⚠️ MCP sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async getMcpSyncStatus() {
        const configManager = await this.getConfigManager();
        const settings = await configManager.getSettings();
        const mcpSync = settings.mcpSync;
        return {
            enabled: mcpSync?.enabled ?? true,
            serverCount: mcpSync?.servers ? Object.keys(mcpSync.servers).length : 0,
            lastSync: mcpSync?.lastSyncTime,
        };
    }
    async setMcpSyncEnabled(enabled) {
        const configManager = await this.getConfigManager();
        const settings = await configManager.getSettings();
        await configManager.updateSettings({
            mcpSync: {
                ...settings.mcpSync,
                enabled,
                servers: settings.mcpSync?.servers ?? {},
            },
        });
    }
}
function getMcpServers(config) {
    if (!isRecord(config) || !isRecord(config.mcpServers)) {
        return null;
    }
    const servers = {};
    for (const [name, server] of Object.entries(config.mcpServers)) {
        if (isMcpServerConfig(server)) {
            servers[name] = server;
        }
    }
    return servers;
}
function isMcpServerConfig(value) {
    if (!isRecord(value)) {
        return false;
    }
    const type = value.type ?? 'stdio';
    if (type !== 'stdio' && type !== 'http' && type !== 'sse') {
        return false;
    }
    if (type === 'stdio' && (typeof value.command !== 'string' || !value.command.trim())) {
        return false;
    }
    if ((type === 'http' || type === 'sse') && (typeof value.url !== 'string' || !value.url.trim())) {
        return false;
    }
    if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every(item => typeof item === 'string'))) {
        return false;
    }
    if (value.env !== undefined && !isStringRecord(value.env)) {
        return false;
    }
    if (value.headers !== undefined && !isStringRecord(value.headers)) {
        return false;
    }
    return true;
}
function isStringRecord(value) {
    return isRecord(value) && Object.values(value).every(item => typeof item === 'string');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
