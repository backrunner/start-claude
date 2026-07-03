import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UILogger } from '../utils/cli/ui';
import { getProductDefinition } from './registry';
import { CURRENT_EXTERNAL_PRODUCT_CONFIG_VERSION } from './types';
export class ExternalProductFileOperations {
    static instances = new Map();
    productId;
    constructor(productId) {
        this.productId = productId;
        this.ensureConfigDir();
    }
    static getInstance(productId) {
        const existing = ExternalProductFileOperations.instances.get(productId);
        if (existing) {
            return existing;
        }
        const instance = new ExternalProductFileOperations(productId);
        ExternalProductFileOperations.instances.set(productId, instance);
        return instance;
    }
    get definition() {
        return getProductDefinition(this.productId);
    }
    get configDir() {
        return path.join(os.homedir(), this.definition.configDirName);
    }
    get syncConfigPath() {
        return path.join(this.configDir, 'sync.json');
    }
    ensureConfigDir() {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
    }
    getDefaultConfigFile() {
        return {
            version: CURRENT_EXTERNAL_PRODUCT_CONFIG_VERSION,
            configs: [],
            settings: {},
        };
    }
    getActualConfigDir(configFile) {
        const syncConfig = configFile?.settings.sync || this.readSyncPointer();
        const cloudPath = syncConfig?.customPath || syncConfig?.cloudPath;
        if (syncConfig?.enabled && cloudPath) {
            return path.join(cloudPath, this.definition.configDirName);
        }
        return this.configDir;
    }
    getActualConfigPath() {
        return path.join(this.getActualConfigDir(), 'config.json');
    }
    exists() {
        return fs.existsSync(this.getActualConfigPath());
    }
    load() {
        if (!this.exists()) {
            const defaultConfig = this.getDefaultConfigFile();
            this.save(defaultConfig);
            return defaultConfig;
        }
        try {
            const actualPath = this.getActualConfigPath();
            const rawConfig = JSON.parse(fs.readFileSync(actualPath, 'utf-8'));
            const normalized = this.validateAndNormalize(rawConfig);
            const hadMissingUUIDs = rawConfig.configs?.some(config => !config.id) ?? false;
            if (hadMissingUUIDs) {
                this.save(normalized);
            }
            return normalized;
        }
        catch (error) {
            const logger = new UILogger();
            logger.displayWarning(`Error loading ${this.definition.shortTitle} config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            logger.displayInfo(`Creating new ${this.definition.shortTitle} configuration file...`);
            if (this.exists()) {
                const actualPath = this.getActualConfigPath();
                const backupPath = `${actualPath}.backup.${Date.now()}`;
                fs.copyFileSync(actualPath, backupPath);
                logger.displayInfo(`Corrupted config backed up to: ${backupPath}`);
            }
            const defaultConfig = this.getDefaultConfigFile();
            this.save(defaultConfig);
            return defaultConfig;
        }
    }
    save(config) {
        try {
            const actualConfigDir = this.getActualConfigDir(config);
            if (!fs.existsSync(actualConfigDir)) {
                fs.mkdirSync(actualConfigDir, { recursive: true });
            }
            this.writeSyncPointer(config);
            fs.writeFileSync(path.join(actualConfigDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
        }
        catch (error) {
            new UILogger().displayError(`Error saving ${this.definition.shortTitle} config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    getConfigDir() {
        return this.configDir;
    }
    getConfigPath() {
        return path.join(this.configDir, 'config.json');
    }
    validateAndNormalize(config) {
        return {
            version: config.version || CURRENT_EXTERNAL_PRODUCT_CONFIG_VERSION,
            configs: Array.isArray(config.configs)
                ? config.configs.map(item => this.normalizeConfig(item))
                : [],
            settings: config.settings && typeof config.settings === 'object'
                ? config.settings
                : {},
        };
    }
    normalizeConfig(config) {
        return {
            ...config,
            id: config.id || randomUUID(),
            authMode: config.authMode || 'api-key',
            apiKeyEnvVar: config.apiKeyEnvVar || this.definition.defaultApiKeyEnvVar,
            enabled: config.enabled ?? true,
            isDefault: config.isDefault ?? false,
            order: config.order ?? 0,
            isDeleted: config.isDeleted ?? false,
        };
    }
    readSyncPointer() {
        try {
            if (fs.existsSync(this.syncConfigPath)) {
                return JSON.parse(fs.readFileSync(this.syncConfigPath, 'utf-8'));
            }
            const localConfigPath = path.join(this.configDir, 'config.json');
            if (fs.existsSync(localConfigPath)) {
                const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
                return localConfig.settings?.sync;
            }
        }
        catch {
            return undefined;
        }
        return undefined;
    }
    writeSyncPointer(config) {
        try {
            fs.writeFileSync(this.syncConfigPath, JSON.stringify(config.settings.sync || { enabled: false }, null, 2), 'utf-8');
        }
        catch {
        }
    }
}
