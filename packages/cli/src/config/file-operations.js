import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import dayjs from 'dayjs';
import { UILogger } from '../utils/cli/ui';
import { CURRENT_CONFIG_VERSION } from './types';
const CONFIG_DIR = path.join(os.homedir(), '.start-claude');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SYNC_CONFIG_FILE = path.join(CONFIG_DIR, 'sync.json');
const MIGRATION_LOG_FILE = path.join(CONFIG_DIR, 'migrations.log');
export class ConfigFileManager {
    static instance = null;
    _needsImmediateUpdate = false;
    constructor() {
        this.ensureConfigDir();
    }
    static getInstance() {
        if (!ConfigFileManager.instance) {
            ConfigFileManager.instance = new ConfigFileManager();
        }
        return ConfigFileManager.instance;
    }
    ensureConfigDir() {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
    }
    getDefaultConfigFile() {
        return {
            version: CURRENT_CONFIG_VERSION,
            configs: [],
            settings: {
                overrideClaudeCommand: false,
            },
        };
    }
    getActualConfigDir() {
        try {
            if (fs.existsSync(SYNC_CONFIG_FILE)) {
                const syncConfigContent = fs.readFileSync(SYNC_CONFIG_FILE, 'utf-8');
                const syncConfig = JSON.parse(syncConfigContent);
                if (syncConfig.enabled && syncConfig.provider !== 's3') {
                    const cloudPath = syncConfig.cloudPath || syncConfig.customPath;
                    if (cloudPath) {
                        const cloudConfigDir = path.join(cloudPath, '.start-claude');
                        if (fs.existsSync(cloudConfigDir)) {
                            return cloudConfigDir;
                        }
                    }
                }
            }
        }
        catch {
        }
        return CONFIG_DIR;
    }
    getActualConfigPath() {
        const configDir = this.getActualConfigDir();
        return path.join(configDir, 'config.json');
    }
    exists() {
        const actualPath = this.getActualConfigPath();
        return fs.existsSync(actualPath);
    }
    async load() {
        if (!this.exists()) {
            const defaultConfig = this.getDefaultConfigFile();
            this.save(defaultConfig);
            return defaultConfig;
        }
        try {
            const actualPath = this.getActualConfigPath();
            const content = fs.readFileSync(actualPath, 'utf-8');
            const rawConfig = JSON.parse(content);
            if (typeof rawConfig === 'object' && rawConfig !== null && !('version' in rawConfig)) {
                const migrated = this.migrateLegacyConfig(rawConfig);
                try {
                    await this.runStructuredMigrations();
                }
                catch (error) {
                    new UILogger().displayWarning(`Structured migration after legacy migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
                return migrated;
            }
            const config = rawConfig;
            if (config.version > CURRENT_CONFIG_VERSION) {
                this.handleOutdatedCLI(config.version);
            }
            try {
                await this.runStructuredMigrations();
            }
            catch {
                if (config.version < CURRENT_CONFIG_VERSION) {
                    return this.migrateConfig(config);
                }
            }
            const normalized = this.validateAndNormalize(config);
            const hadMissingUUIDs = config.configs.some(cfg => !cfg.id);
            if (hadMissingUUIDs) {
                this.save(normalized);
            }
            return normalized;
        }
        catch (error) {
            const logger = new UILogger();
            logger.displayWarning(`Error loading config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            logger.displayInfo('Creating new configuration file...');
            if (this.exists()) {
                const backupPath = `${CONFIG_FILE}.backup.${Date.now()}`;
                fs.copyFileSync(CONFIG_FILE, backupPath);
                logger.displayInfo(`Corrupted config backed up to: ${backupPath}`);
            }
            const defaultConfig = this.getDefaultConfigFile();
            this.save(defaultConfig);
            return defaultConfig;
        }
    }
    async runStructuredMigrations() {
        const migratorModule = await import('@start-claude/migrator');
        const { Migrator, CURRENT_CONFIG_VERSION: TARGET } = migratorModule;
        const actualConfigDir = this.getActualConfigDir();
        const migrator = new Migrator({
            currentVersion: TARGET,
            backupDirectory: path.join(actualConfigDir, 'backups'),
        });
        const actualConfigPath = this.getActualConfigPath();
        if (!fs.existsSync(actualConfigPath)) {
            const ui = new UILogger();
            ui.displayWarning(`Config file not found at ${actualConfigPath}, skipping migrations`);
            throw new Error(`Config file not found: ${actualConfigPath}`);
        }
        const detection = migrator.detectMigrationNeeded(actualConfigPath, { useFlagSystem: true });
        if (detection.needsMigration) {
            const ui = new UILogger();
            ui.displayInfo(`Migrating configuration from version ${detection.currentVersion} to ${detection.targetVersion}...`);
            const result = await migrator.migrate(actualConfigPath, { backup: true, verbose: false, useFlagSystem: true });
            if (result.success) {
                ui.displaySuccess(`Configuration migrated successfully to version ${detection.targetVersion}`);
                if (result.migrationsSkipped.length > 0) {
                    ui.displayInfo(`Skipped ${result.migrationsSkipped.length} previously completed migrations`);
                }
                await this.syncMigrationFlagsToCloud();
            }
            else {
                const errorMsg = result.error || 'Unknown migration error';
                ui.displayError(`Migration failed: ${errorMsg}`);
                throw new Error(`Migration failed: ${errorMsg}`);
            }
        }
    }
    async syncMigrationFlagsToCloud() {
        try {
            if (!fs.existsSync(SYNC_CONFIG_FILE)) {
                return;
            }
            const syncConfigContent = fs.readFileSync(SYNC_CONFIG_FILE, 'utf-8');
            const syncConfig = JSON.parse(syncConfigContent);
            if (!syncConfig.enabled || syncConfig.provider === 's3') {
                return;
            }
            const cloudPath = syncConfig.cloudPath || syncConfig.customPath;
            if (!cloudPath) {
                return;
            }
            const localFlagsPath = path.join(CONFIG_DIR, 'migration-flags.json');
            if (!fs.existsSync(localFlagsPath)) {
                return;
            }
            const cloudConfigDir = path.join(cloudPath, '.start-claude');
            if (!fs.existsSync(cloudConfigDir)) {
                fs.mkdirSync(cloudConfigDir, { recursive: true });
            }
            const cloudFlagsPath = path.join(cloudConfigDir, 'migration-flags.json');
            fs.copyFileSync(localFlagsPath, cloudFlagsPath);
        }
        catch (error) {
            const ui = new UILogger();
            ui.displayVerbose(`Failed to sync migration flags to cloud: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    save(config) {
        this.ensureConfigDir();
        const configToSave = {
            ...config,
            version: CURRENT_CONFIG_VERSION,
        };
        this.validateConfig(configToSave);
        const actualPath = this.getActualConfigPath();
        const actualDir = path.dirname(actualPath);
        if (!fs.existsSync(actualDir)) {
            fs.mkdirSync(actualDir, { recursive: true });
        }
        fs.writeFileSync(actualPath, JSON.stringify(configToSave, null, 2));
        if (actualPath !== CONFIG_FILE) {
            this.syncAdditionalConfigFiles(actualPath);
        }
    }
    syncAdditionalConfigFiles(cloudConfigPath) {
        try {
            const cloudDir = path.dirname(cloudConfigPath);
            const localS3Config = path.join(CONFIG_DIR, 's3-config.json');
            const cloudS3Config = path.join(cloudDir, 's3-config.json');
            if (fs.existsSync(localS3Config)) {
                fs.copyFileSync(localS3Config, cloudS3Config);
            }
        }
        catch {
        }
    }
    migrateLegacyConfig(legacyConfig) {
        const logger = new UILogger();
        logger.displayInfo('Migrating legacy configuration to version 1...');
        const newSettings = {
            overrideClaudeCommand: legacyConfig.settings.overrideClaudeCommand,
            s3Sync: legacyConfig.settings.s3Sync,
        };
        const migratedConfigs = legacyConfig.configs.map(config => ({
            ...config,
            enabled: config.enabled ?? true,
        }));
        const migratedConfig = {
            version: 1,
            configs: migratedConfigs,
            settings: newSettings,
        };
        this.logMigration({
            fromVersion: 0,
            toVersion: 1,
            description: 'Initial migration from legacy config format',
            timestamp: Date.now(),
        });
        this.save(migratedConfig);
        logger.displaySuccess('Successfully migrated configuration to version 1');
        return migratedConfig;
    }
    migrateConfig(config) {
        const fromVersion = config.version;
        const toVersion = CURRENT_CONFIG_VERSION;
        const logger = new UILogger();
        logger.displayInfo(`Migrating configuration from version ${fromVersion} to ${toVersion}...`);
        const migratedConfig = {
            ...config,
            version: toVersion,
        };
        this.save(migratedConfig);
        logger.displaySuccess(`Successfully migrated configuration to version ${toVersion}`);
        return migratedConfig;
    }
    validateAndNormalize(config) {
        if (!config.version) {
            config.version = CURRENT_CONFIG_VERSION;
        }
        if (!config.configs) {
            config.configs = [];
        }
        if (!config.settings) {
            config.settings = { overrideClaudeCommand: false };
        }
        config.configs = config.configs.map(cfg => ({
            ...cfg,
            id: cfg.id || randomUUID(),
            enabled: cfg.enabled ?? true,
        }));
        return config;
    }
    validateConfig(config) {
        if (typeof config.version !== 'number') {
            throw new TypeError('Config version must be a number');
        }
        if (!Array.isArray(config.configs)) {
            throw new TypeError('Config.configs must be an array');
        }
        if (!config.settings || typeof config.settings !== 'object') {
            throw new Error('Config.settings must be an object');
        }
        config.configs.forEach((cfg, index) => {
            if (!cfg.name || typeof cfg.name !== 'string') {
                throw new Error(`Config at index ${index} must have a valid name`);
            }
        });
    }
    logMigration(info) {
        const logEntry = `${dayjs(info.timestamp).format('YYYY-MM-DD HH:mm:ss')} - Migration ${info.fromVersion} → ${info.toVersion}: ${info.description}\n`;
        try {
            fs.appendFileSync(MIGRATION_LOG_FILE, logEntry);
        }
        catch (error) {
            console.error('Failed to write migration log:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    getMigrationHistory() {
        if (!fs.existsSync(MIGRATION_LOG_FILE)) {
            return [];
        }
        try {
            const content = fs.readFileSync(MIGRATION_LOG_FILE, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line.trim());
            return lines.map((line) => {
                const match = line.match(/^(.+?) - Migration (\d+) → (\d+): (.+)$/);
                if (!match) {
                    throw new Error(`Invalid migration log line: ${line}`);
                }
                return {
                    timestamp: new Date(match[1]).getTime(),
                    fromVersion: Number.parseInt(match[2], 10),
                    toVersion: Number.parseInt(match[3], 10),
                    description: match[4],
                };
            });
        }
        catch (error) {
            const logger = new UILogger();
            logger.displayWarning(`Error reading migration history: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }
    needsMigration() {
        if (!this.exists()) {
            return false;
        }
        try {
            const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
            const rawConfig = JSON.parse(content);
            if (typeof rawConfig !== 'object' || rawConfig === null || !('version' in rawConfig)) {
                return true;
            }
            const config = rawConfig;
            return (config.version || 0) < CURRENT_CONFIG_VERSION;
        }
        catch {
            return true;
        }
    }
    getCurrentVersion() {
        if (!this.exists()) {
            return CURRENT_CONFIG_VERSION;
        }
        try {
            const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
            const rawConfig = JSON.parse(content);
            if (typeof rawConfig === 'object' && rawConfig !== null && 'version' in rawConfig) {
                const config = rawConfig;
                return config.version || 0;
            }
            return 0;
        }
        catch {
            return 0;
        }
    }
    getConfigPath() {
        return CONFIG_FILE;
    }
    getConfigDir() {
        return CONFIG_DIR;
    }
    handleOutdatedCLI(configVersion) {
        const logger = new UILogger();
        logger.displayWarning(`⚠️ Configuration version (${configVersion}) is newer than CLI version (${CURRENT_CONFIG_VERSION})`);
        logger.displayWarning('⚠️ Your CLI tool is outdated and needs to be updated to avoid compatibility issues.');
        logger.displayInfo('💡 An update check will be performed immediately.');
        this._needsImmediateUpdate = true;
    }
    needsImmediateUpdate() {
        return this._needsImmediateUpdate;
    }
    resetImmediateUpdateFlag() {
        this._needsImmediateUpdate = false;
    }
}
