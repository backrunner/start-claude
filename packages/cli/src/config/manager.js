import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import { S3SyncManager } from '../storage/s3-sync';
import { ConfigFileManager } from './file-operations';
import { configNamesMatch, findConfigByName, findNameConflict, getNameConflictMessage } from './name-utils';
export class ConfigManager {
    static instance;
    configFileManager;
    pendingSyncs = new Set();
    constructor() {
        this.configFileManager = ConfigFileManager.getInstance();
    }
    static getInstance() {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }
    async load() {
        return this.configFileManager.load();
    }
    async save(config, skipSync = false) {
        if (!skipSync) {
            const currentConfig = await this.load();
            const hasChanges = this.hasConfigChanges(currentConfig, config);
            if (!hasChanges) {
                this.configFileManager.save(config);
                return;
            }
        }
        this.configFileManager.save(config);
        if (!skipSync) {
            const syncPromise = this.triggerS3Sync()
                .finally(() => {
                this.pendingSyncs.delete(syncPromise);
            });
            this.pendingSyncs.add(syncPromise);
        }
    }
    hasConfigChanges(current, updated) {
        const normalizeConfig = (config) => ({
            ...config,
            version: undefined,
        });
        const currentNormalized = normalizeConfig(current);
        const updatedNormalized = normalizeConfig(updated);
        return JSON.stringify(currentNormalized) !== JSON.stringify(updatedNormalized);
    }
    async triggerS3Sync() {
        try {
            const s3SyncManager = S3SyncManager.getInstance();
            if (await s3SyncManager.isS3Configured()) {
                await s3SyncManager.autoUploadAfterChange();
            }
        }
        catch (error) {
            console.error('S3 sync failed:', error);
        }
    }
    async waitForPendingSyncs(timeout = 10000) {
        if (this.pendingSyncs.size === 0) {
            return;
        }
        console.log(`[ConfigManager] Waiting for ${this.pendingSyncs.size} pending S3 sync operations...`);
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                console.warn(`[ConfigManager] Timeout waiting for S3 syncs after ${timeout}ms`);
                resolve();
            }, timeout);
        });
        const allSyncsPromise = Promise.all(Array.from(this.pendingSyncs))
            .then(() => {
            console.log('[ConfigManager] All pending S3 syncs completed');
        })
            .catch((error) => {
            console.error('[ConfigManager] Error in pending S3 syncs:', error);
        });
        await Promise.race([allSyncsPromise, timeoutPromise]);
    }
    hasPendingSyncs() {
        return this.pendingSyncs.size > 0;
    }
    async addConfig(config) {
        const configFile = await this.load();
        if (!config.id) {
            config.id = randomUUID();
        }
        let existingIndex = -1;
        if (config.id) {
            existingIndex = configFile.configs.findIndex(c => c.id === config.id);
        }
        if (existingIndex === -1) {
            existingIndex = configFile.configs.findIndex(c => configNamesMatch(c.name, config.name));
        }
        let savedConfigId = config.id;
        if (existingIndex >= 0) {
            const existingConfig = configFile.configs[existingIndex];
            savedConfigId = existingConfig.id || config.id;
            if (!configNamesMatch(existingConfig.name, config.name)) {
                const activeConfigs = configFile.configs.filter(c => !c.isDeleted);
                const conflict = findNameConflict(activeConfigs, config.name, existingConfig);
                if (conflict) {
                    throw new Error(getNameConflictMessage(config.name, conflict.name));
                }
            }
            configFile.configs[existingIndex] = {
                ...config,
                id: savedConfigId,
            };
        }
        else {
            const activeConfigs = configFile.configs.filter(c => !c.isDeleted);
            const conflict = findNameConflict(activeConfigs, config.name);
            if (conflict) {
                throw new Error(getNameConflictMessage(config.name, conflict.name));
            }
            configFile.configs.push(config);
        }
        if (config.isDefault) {
            configFile.configs.forEach((item) => {
                item.isDefault = item.id === savedConfigId;
            });
        }
        await this.save(configFile);
    }
    async removeConfig(name) {
        const configFile = await this.load();
        const targetConfig = findConfigByName(configFile.configs, name);
        if (!targetConfig) {
            return false;
        }
        targetConfig.isDeleted = true;
        targetConfig.deletedAt = dayjs().format('YYYY-MM-DD HH:mm:ss');
        delete targetConfig.apiKey;
        delete targetConfig.authToken;
        await this.save(configFile);
        return true;
    }
    async removeConfigById(id) {
        const configFile = await this.load();
        const targetConfig = configFile.configs.find(c => c.id === id);
        if (!targetConfig) {
            return false;
        }
        targetConfig.isDeleted = true;
        targetConfig.deletedAt = dayjs().format('YYYY-MM-DD HH:mm:ss');
        delete targetConfig.apiKey;
        delete targetConfig.authToken;
        await this.save(configFile);
        return true;
    }
    async getConfig(name) {
        const configFile = await this.load();
        const config = findConfigByName(configFile.configs, name);
        return config?.isDeleted ? undefined : config;
    }
    async getConfigById(id) {
        const configFile = await this.load();
        const config = configFile.configs.find(c => c.id === id);
        return config?.isDeleted ? undefined : config;
    }
    async getDefaultConfig() {
        const configFile = await this.load();
        const config = configFile.configs.find(c => c.isDefault && !c.isDeleted);
        return config;
    }
    async setDefaultConfig(name) {
        const configFile = await this.load();
        configFile.configs.forEach(c => c.isDefault = false);
        const targetConfig = findConfigByName(configFile.configs.filter(c => !c.isDeleted), name);
        if (targetConfig) {
            targetConfig.isDefault = true;
            await this.save(configFile);
            return true;
        }
        return false;
    }
    async setDefaultConfigById(id) {
        const configFile = await this.load();
        configFile.configs.forEach(c => c.isDefault = false);
        const targetConfig = configFile.configs.find(c => c.id === id && !c.isDeleted);
        if (targetConfig) {
            targetConfig.isDefault = true;
            await this.save(configFile);
            return true;
        }
        return false;
    }
    async listConfigs() {
        const configFile = await this.load();
        return configFile.configs.filter(c => !c.isDeleted);
    }
    async updateSettings(settings, skipSync = false) {
        const configFile = await this.load();
        configFile.settings = { ...configFile.settings, ...settings };
        await this.save(configFile, skipSync);
    }
    async getSettings() {
        const configFile = await this.load();
        return configFile.settings;
    }
    async getConfigFile() {
        return this.load();
    }
    async saveConfigFile(configFile, skipSync = false) {
        await this.save(configFile, skipSync);
    }
    async initializeS3Sync() {
        try {
            const { S3SyncManager } = await import('../storage/s3-sync');
            const s3SyncManager = S3SyncManager.getInstance();
            if (await s3SyncManager.isS3Configured()) {
            }
        }
        catch (error) {
            console.error('S3 sync initialization failed:', error);
        }
    }
    async cleanupDeletedConfig(name) {
        const configFile = await this.load();
        const initialLength = configFile.configs.length;
        const targetConfig = findConfigByName(configFile.configs.filter(c => c.isDeleted), name);
        if (!targetConfig) {
            return false;
        }
        configFile.configs = configFile.configs.filter(c => targetConfig.id ? c.id !== targetConfig.id : !configNamesMatch(c.name, name) || !c.isDeleted);
        if (configFile.configs.length < initialLength) {
            await this.save(configFile);
            return true;
        }
        return false;
    }
    async restoreConfig(name) {
        const configFile = await this.load();
        const config = findConfigByName(configFile.configs.filter(c => c.isDeleted), name);
        if (!config) {
            return false;
        }
        const conflict = findNameConflict(configFile.configs.filter(c => !c.isDeleted), config.name);
        if (conflict) {
            throw new Error(getNameConflictMessage(config.name, conflict.name));
        }
        config.isDeleted = false;
        delete config.deletedAt;
        await this.save(configFile);
        return true;
    }
    async restoreConfigById(id) {
        const configFile = await this.load();
        const config = configFile.configs.find(c => c.id === id && c.isDeleted);
        if (!config) {
            return false;
        }
        config.isDeleted = false;
        delete config.deletedAt;
        await this.save(configFile);
        return true;
    }
    async cleanupDeletedConfigById(id) {
        const configFile = await this.load();
        const initialLength = configFile.configs.length;
        configFile.configs = configFile.configs.filter(c => c.id !== id || !c.isDeleted);
        if (configFile.configs.length < initialLength) {
            await this.save(configFile);
            return true;
        }
        return false;
    }
    async cleanupOldDeletions(daysOld = 30) {
        const configFile = await this.load();
        const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
        const initialLength = configFile.configs.length;
        configFile.configs = configFile.configs.filter((config) => {
            if (!config.isDeleted || !config.deletedAt) {
                return true;
            }
            return new Date(config.deletedAt) > cutoffDate;
        });
        const cleaned = initialLength - configFile.configs.length;
        if (cleaned > 0) {
            await this.save(configFile);
        }
        return cleaned;
    }
    async getDeletedConfigs() {
        const configFile = await this.load();
        return configFile.configs.filter(c => c.isDeleted);
    }
    needsImmediateUpdate() {
        return this.configFileManager.needsImmediateUpdate();
    }
    resetImmediateUpdateFlag() {
        this.configFileManager.resetImmediateUpdateFlag();
    }
}
