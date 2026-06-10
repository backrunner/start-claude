import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
const LOCK_DIR = path.join(os.homedir(), '.start-claude');
const LOCK_FILE = path.join(LOCK_DIR, 'manager.lock');
const MAX_LOCK_AGE_MS = 24 * 60 * 60 * 1000;
const SERVER_STARTUP_TIMEOUT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
async function isServerResponsive(port) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port,
            method: 'GET',
            path: '/api/health',
            timeout: 2000,
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => {
            resolve(false);
        });
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}
function readLockFile() {
    try {
        if (!existsSync(LOCK_FILE)) {
            return null;
        }
        const content = readFileSync(LOCK_FILE, 'utf-8');
        const lockInfo = JSON.parse(content);
        return lockInfo;
    }
    catch {
        return null;
    }
}
function isLockStale(lockInfo) {
    const now = Date.now();
    const age = now - lockInfo.timestamp;
    const lastHeartbeat = lockInfo.lastHeartbeat || lockInfo.timestamp;
    const heartbeatAge = now - lastHeartbeat;
    if (age > MAX_LOCK_AGE_MS) {
        return true;
    }
    if (heartbeatAge > HEARTBEAT_INTERVAL_MS * 3) {
        return true;
    }
    if (lockInfo.hostname !== os.hostname()) {
        return age > 60 * 60 * 1000;
    }
    return false;
}
export async function checkExistingInstance() {
    const lockInfo = readLockFile();
    if (!lockInfo) {
        return null;
    }
    if (isLockStale(lockInfo)) {
        removeLock();
        return null;
    }
    const isSameMachine = lockInfo.hostname === os.hostname();
    if (isSameMachine) {
        if (!isProcessRunning(lockInfo.pid)) {
            removeLock();
            return null;
        }
    }
    const isResponsive = await isServerResponsive(lockInfo.port);
    if (!isResponsive) {
        const age = Date.now() - lockInfo.timestamp;
        if (isSameMachine) {
            if (age < SERVER_STARTUP_TIMEOUT_MS) {
                return lockInfo;
            }
            removeLock();
            return null;
        }
        else {
            if (age < SERVER_STARTUP_TIMEOUT_MS) {
                return lockInfo;
            }
            removeLock();
            return null;
        }
    }
    return lockInfo;
}
export function createLock(port) {
    try {
        if (!existsSync(LOCK_DIR)) {
            mkdirSync(LOCK_DIR, { recursive: true });
        }
        const lockInfo = {
            pid: process.pid,
            port,
            timestamp: Date.now(),
            hostname: os.hostname(),
        };
        writeFileSync(LOCK_FILE, JSON.stringify(lockInfo, null, 2), 'utf-8');
    }
    catch (error) {
        console.error('Failed to create lock file:', error);
    }
}
export function removeLock() {
    try {
        if (existsSync(LOCK_FILE)) {
            rmSync(LOCK_FILE);
        }
    }
    catch (error) {
        console.error('Failed to remove lock file:', error);
    }
}
export function updateHeartbeat() {
    try {
        const lockInfo = readLockFile();
        if (lockInfo && lockInfo.pid === process.pid) {
            lockInfo.lastHeartbeat = Date.now();
            writeFileSync(LOCK_FILE, JSON.stringify(lockInfo, null, 2), 'utf-8');
        }
    }
    catch (error) {
    }
}
export function startHeartbeat() {
    updateHeartbeat();
    const intervalId = setInterval(() => {
        updateHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
        clearInterval(intervalId);
    };
}
export function getLockFilePath() {
    return LOCK_FILE;
}
export function forceRemoveLock() {
    removeLock();
}
