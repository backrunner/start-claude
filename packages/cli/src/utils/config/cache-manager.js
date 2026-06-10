import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
const CACHE_DIR = path.join(os.homedir(), '.start-claude', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');
export class CacheManager {
    static instance = null;
    constructor() {
        this.ensureCacheDir();
    }
    static getInstance() {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager();
        }
        return CacheManager.instance;
    }
    ensureCacheDir() {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
    }
    loadCacheData() {
        try {
            if (!fs.existsSync(CACHE_FILE)) {
                return {};
            }
            const content = fs.readFileSync(CACHE_FILE, 'utf-8');
            const data = JSON.parse(content);
            this.cleanupExpiredEntries(data);
            return data;
        }
        catch {
            return {};
        }
    }
    saveCacheData(data) {
        try {
            this.ensureCacheDir();
            fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
        }
        catch {
        }
    }
    cleanupExpiredEntries(data) {
        const now = Date.now();
        const keysToDelete = [];
        for (const [key, entry] of Object.entries(data)) {
            if (entry.ttl && (now - entry.timestamp) > entry.ttl) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            delete data[key];
        }
    }
    isExpired(entry) {
        if (!entry.ttl) {
            return false;
        }
        const now = Date.now();
        return (now - entry.timestamp) > entry.ttl;
    }
    generateHash(obj) {
        return Buffer.from(JSON.stringify(obj)).toString('base64').substring(0, 16);
    }
    set(key, value, ttlMs) {
        const data = this.loadCacheData();
        data[key] = {
            value,
            timestamp: Date.now(),
            ttl: ttlMs,
        };
        this.saveCacheData(data);
    }
    get(key) {
        const data = this.loadCacheData();
        const entry = data[key];
        if (!entry) {
            return null;
        }
        if (this.isExpired(entry)) {
            delete data[key];
            this.saveCacheData(data);
            return null;
        }
        return entry.value;
    }
    has(key) {
        return this.get(key) !== null;
    }
    delete(key) {
        const data = this.loadCacheData();
        delete data[key];
        this.saveCacheData(data);
    }
    clear() {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                fs.unlinkSync(CACHE_FILE);
            }
        }
        catch {
        }
    }
    keys() {
        const data = this.loadCacheData();
        return Object.keys(data);
    }
    cleanup() {
        const data = this.loadCacheData();
        this.cleanupExpiredEntries(data);
        this.saveCacheData(data);
    }
    setWithTTL(key, value, ttlSeconds) {
        this.set(key, value, ttlSeconds * 1000);
    }
    setDaily(key, value) {
        this.set(key, value, 24 * 60 * 60 * 1000);
    }
    setByHash(obj, value, ttlMs) {
        const hash = this.generateHash(obj);
        this.set(hash, value, ttlMs);
        return hash;
    }
    getByHash(obj) {
        const hash = this.generateHash(obj);
        return this.get(hash);
    }
    hasByHash(obj) {
        const hash = this.generateHash(obj);
        return this.has(hash);
    }
    getUpdateCheckTimestamp() {
        return this.get('updateCheck.lastTimestamp');
    }
    setUpdateCheckTimestamp(timestamp, latestVersion) {
        this.set('updateCheck.lastTimestamp', timestamp);
        if (latestVersion) {
            this.set('updateCheck.lastVersion', latestVersion);
        }
    }
    shouldCheckForUpdates(intervalMs = 24 * 60 * 60 * 1000) {
        const lastCheck = this.getUpdateCheckTimestamp();
        if (!lastCheck) {
            return true;
        }
        const now = Date.now();
        const timeSinceLastCheck = now - lastCheck;
        return timeSinceLastCheck >= intervalMs;
    }
    getStatuslineConflictDecision(existingConfig, proposedConfig) {
        const combinedKey = `statusline.conflict.${this.generateHash({ existing: existingConfig, proposed: proposedConfig })}`;
        let decision = this.get(combinedKey);
        if (decision) {
            return decision.userChoice;
        }
        const existingKey = `statusline.conflict.${this.generateHash(existingConfig)}`;
        decision = this.get(existingKey);
        if (decision) {
            return decision.userChoice;
        }
        return null;
    }
    setStatuslineConflictDecision(existingConfig, proposedConfig, userChoice) {
        const combinedKey = `statusline.conflict.${this.generateHash({ existing: existingConfig, proposed: proposedConfig })}`;
        this.set(combinedKey, {
            userChoice,
            timestamp: Date.now(),
            existingConfig,
            proposedConfig,
        });
    }
    clearStatuslineConflictDecisions() {
        const data = this.loadCacheData();
        const keysToDelete = Object.keys(data).filter(key => key.startsWith('statusline.conflict.'));
        for (const key of keysToDelete) {
            delete data[key];
        }
        this.saveCacheData(data);
    }
    isClaudeInstalled() {
        return this.get('claude.installed');
    }
    setClaudeInstalled(isInstalled, version) {
        this.set('claude.installed', isInstalled);
        if (version) {
            this.set('claude.version', version);
        }
    }
    getClaudeVersion() {
        return this.get('claude.version');
    }
    clearClaudeInstallationCache() {
        this.delete('claude.installed');
        this.delete('claude.version');
    }
    getClaudePath() {
        return this.get('claude.path');
    }
    setClaudePath(claudePath, method) {
        this.set('claude.path', claudePath);
        this.set('claude.installMethod', method);
    }
    getClaudeInstallMethod() {
        return this.get('claude.installMethod');
    }
    clearClaudePathCache() {
        this.delete('claude.path');
        this.delete('claude.installMethod');
    }
}
