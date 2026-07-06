import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { UILogger } from '../utils/cli/ui';
import { ClaudeConfigSyncer } from './claude-config-syncer';
export class ClaudeConfigWatcher {
    projectRoot;
    ui;
    syncer;
    watchers = [];
    debounceTimer = null;
    debounceMs = 1000;
    onSyncCallback;
    constructor(projectRoot = process.cwd(), ui, options) {
        this.projectRoot = projectRoot;
        this.ui = ui || new UILogger(false);
        this.syncer = new ClaudeConfigSyncer(projectRoot, this.ui);
        if (options?.debounceMs) {
            this.debounceMs = options.debounceMs;
        }
    }
    start(currentLibrary, onSync) {
        this.onSyncCallback = onSync;
        this.ui.verbose('Starting Claude Code config file watcher...');
        const mcpConfigPath = path.join(this.projectRoot, '.mcp.json');
        if (fs.existsSync(mcpConfigPath)) {
            this.watchFile(mcpConfigPath, currentLibrary);
        }
        const skillsDir = path.join(this.projectRoot, '.claude', 'skills');
        if (fs.existsSync(skillsDir)) {
            this.watchDirectory(skillsDir, currentLibrary);
        }
        const agentsDir = path.join(this.projectRoot, '.claude', 'agents');
        if (fs.existsSync(agentsDir)) {
            this.watchDirectory(agentsDir, currentLibrary);
        }
        this.ui.verbose(`Watching ${this.watchers.length} paths for changes`);
    }
    stop() {
        this.ui.verbose('Stopping Claude Code config file watcher...');
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        for (const watcher of this.watchers) {
            watcher.close();
        }
        this.watchers = [];
        this.ui.verbose('File watcher stopped');
    }
    watchFile(filePath, currentLibrary) {
        try {
            const watcher = fs.watch(filePath, (eventType) => {
                if (eventType === 'change') {
                    this.ui.verbose(`Detected change in ${path.basename(filePath)}`);
                    this.debouncedSync(currentLibrary);
                }
            });
            watcher.on('error', (error) => {
                this.ui.error(`Error watching ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
            });
            this.watchers.push(watcher);
            this.ui.verbose(`Watching file: ${filePath}`);
        }
        catch (error) {
            this.ui.error(`Failed to watch ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    watchDirectory(dirPath, currentLibrary) {
        try {
            const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
                if (filename) {
                    this.ui.verbose(`Detected ${eventType} in ${dirPath}/${filename}`);
                    this.debouncedSync(currentLibrary);
                }
            });
            watcher.on('error', (error) => {
                this.ui.error(`Error watching ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
            });
            this.watchers.push(watcher);
            this.ui.verbose(`Watching directory: ${dirPath}`);
        }
        catch (error) {
            this.ui.error(`Failed to watch ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    debouncedSync(currentLibrary) {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            void this.performSync(currentLibrary);
        }, this.debounceMs);
    }
    async performSync(currentLibrary) {
        try {
            this.ui.verbose('Syncing Claude Code config changes...');
            const syncResult = await this.syncer.syncClaudeConfig(currentLibrary);
            if (syncResult.result.totalChanged > 0) {
                this.ui.verbose(`Synced ${syncResult.result.totalChanged} extension changes:`);
                if (syncResult.result.mcpServersAdded > 0) {
                    this.ui.verbose(`  - ${syncResult.result.mcpServersAdded} MCP servers added`);
                }
                if (syncResult.result.skillsAdded > 0) {
                    this.ui.verbose(`  - ${syncResult.result.skillsAdded} skills added`);
                }
                if (syncResult.result.subagentsAdded > 0) {
                    this.ui.verbose(`  - ${syncResult.result.subagentsAdded} subagents added`);
                }
                if (syncResult.result.mcpServersUpdated > 0) {
                    this.ui.verbose(`  - ${syncResult.result.mcpServersUpdated} MCP servers updated`);
                }
                if (syncResult.result.skillsUpdated > 0) {
                    this.ui.verbose(`  - ${syncResult.result.skillsUpdated} skills updated`);
                }
                if (syncResult.result.subagentsUpdated > 0) {
                    this.ui.verbose(`  - ${syncResult.result.subagentsUpdated} subagents updated`);
                }
                if (this.onSyncCallback) {
                    await this.onSyncCallback(syncResult.library);
                }
            }
            else {
                this.ui.verbose('No new extensions detected');
            }
        }
        catch (error) {
            this.ui.error(`Failed to sync config changes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    isWatching() {
        return this.watchers.length > 0;
    }
}
