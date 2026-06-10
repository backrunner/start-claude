import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { UILogger } from '../cli/ui';
const PROXY_PORT = 2333;
const LOCK_FILE = path.join(os.tmpdir(), 'start-claude-proxy.lock');
async function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
            server.close(() => resolve(false));
        });
        server.on('error', () => {
            resolve(true);
        });
    });
}
function createLockFile() {
    try {
        fs.writeFileSync(LOCK_FILE, process.pid.toString(), 'utf8');
    }
    catch (error) {
        const logger = new UILogger();
        logger.displayWarning(`Warning: Could not create proxy lock file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export function removeLockFile() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
        }
    }
    catch {
    }
}
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
export async function checkAndHandleExistingProxy() {
    const portInUse = await isPortInUse(PROXY_PORT);
    if (!portInUse) {
        removeLockFile();
        createLockFile();
        return true;
    }
    if (fs.existsSync(LOCK_FILE)) {
        try {
            const pidStr = fs.readFileSync(LOCK_FILE, 'utf8').trim();
            const pid = Number.parseInt(pidStr, 10);
            if (!Number.isNaN(pid) && isProcessRunning(pid)) {
                const logger = new UILogger();
                logger.displayInfo(`🔄 Proxy server is already running (PID: ${pid}) on port ${PROXY_PORT}`);
                logger.displayInfo('Connecting to existing proxy server...');
                return false;
            }
            else {
                const logger = new UILogger();
                logger.displayWarning('Found stale proxy lock file, cleaning up...');
                removeLockFile();
                const stillInUse = await isPortInUse(PROXY_PORT);
                if (stillInUse) {
                    logger.displayError(`❌ Port ${PROXY_PORT} is in use by another process`);
                    logger.displayError('Please stop the other process or choose a different port');
                    return false;
                }
                createLockFile();
                return true;
            }
        }
        catch (error) {
            const logger = new UILogger();
            logger.displayWarning(`Warning: Could not read proxy lock file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    const logger = new UILogger();
    logger.displayError(`❌ Port ${PROXY_PORT} is already in use by another application`);
    logger.displayError('Please stop the other application or choose a different port for the proxy server');
    return false;
}
export function setupProxyCleanup() {
    const cleanup = () => {
        removeLockFile();
        process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => {
        removeLockFile();
    });
}
