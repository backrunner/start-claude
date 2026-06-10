import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UILogger } from '../utils/cli/ui';
import { CURRENT_S3_CONFIG_VERSION } from './types';
const CONFIG_DIR = path.join(os.homedir(), '.start-claude');
const S3_CONFIG_FILE = path.join(CONFIG_DIR, 's3-config.json');
const SYNC_CONFIG_FILE = path.join(CONFIG_DIR, 'sync.json');
export class S3ConfigFileManager {
    static instance = null;
    constructor() {
        this.ensureConfigDir();
    }
    static getInstance() {
        if (!S3ConfigFileManager.instance) {
            S3ConfigFileManager.instance = new S3ConfigFileManager();
        }
        return S3ConfigFileManager.instance;
    }
    ensureConfigDir() {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
    }
    getActualS3ConfigDir() {
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
    getActualS3ConfigPath() {
        const configDir = this.getActualS3ConfigDir();
        return path.join(configDir, 's3-config.json');
    }
    exists() {
        const actualPath = this.getActualS3ConfigPath();
        return fs.existsSync(actualPath);
    }
    getConfigFilePath() {
        return S3_CONFIG_FILE;
    }
    load() {
        if (!this.exists()) {
            return null;
        }
        try {
            const actualPath = this.getActualS3ConfigPath();
            const content = fs.readFileSync(actualPath, 'utf-8');
            const config = JSON.parse(content);
            if (config.version > CURRENT_S3_CONFIG_VERSION) {
                const ui = new UILogger();
                ui.displayWarning(`S3 config file version ${config.version} is newer than supported version ${CURRENT_S3_CONFIG_VERSION}`);
            }
            return config;
        }
        catch (error) {
            const ui = new UILogger();
            ui.displayWarning(`Error loading S3 config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    save(s3Config) {
        this.ensureConfigDir();
        const configFile = {
            version: CURRENT_S3_CONFIG_VERSION,
            s3Config,
            metadata: {
                createdAt: this.exists() ? this.load()?.metadata.createdAt || new Date().toISOString() : new Date().toISOString(),
                lastModified: new Date().toISOString(),
            },
        };
        const actualPath = this.getActualS3ConfigPath();
        const actualDir = path.dirname(actualPath);
        if (!fs.existsSync(actualDir)) {
            fs.mkdirSync(actualDir, { recursive: true });
        }
        fs.writeFileSync(actualPath, JSON.stringify(configFile, null, 2));
    }
    getS3Config() {
        const configFile = this.load();
        return configFile?.s3Config || null;
    }
    isConfigured() {
        const config = this.getS3Config();
        return config !== null
            && Boolean(config.bucket)
            && Boolean(config.region)
            && Boolean(config.accessKeyId)
            && Boolean(config.secretAccessKey)
            && Boolean(config.key);
    }
    remove() {
        const actualPath = this.getActualS3ConfigPath();
        if (fs.existsSync(actualPath)) {
            fs.unlinkSync(actualPath);
        }
    }
    createFromMigration(s3Config) {
        const configFile = {
            version: CURRENT_S3_CONFIG_VERSION,
            s3Config,
            metadata: {
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                migratedFrom: 'system-settings',
            },
        };
        this.ensureConfigDir();
        const actualPath = this.getActualS3ConfigPath();
        const actualDir = path.dirname(actualPath);
        if (!fs.existsSync(actualDir)) {
            fs.mkdirSync(actualDir, { recursive: true });
        }
        fs.writeFileSync(actualPath, JSON.stringify(configFile, null, 2));
        const ui = new UILogger();
        ui.displayInfo(`S3 configuration migrated to separate file: ${actualPath}`);
    }
}
