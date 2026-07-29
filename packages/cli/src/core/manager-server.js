import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as http from 'node:http';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { UILogger } from '../utils/cli/ui';
import { checkExistingInstance, createLock, removeLock, startHeartbeat } from '../utils/manager/lock';
import { findAvailablePort } from '../utils/network/port-finder';
import { START_CLAUDE_PROJECT_ROOT_ENV } from '../utils/system/path-utils';
export class ManagerServer {
    childProcess = null;
    port = 2334;
    startupPath = '/';
    stopHeartbeat = null;
    debug = false;
    constructor(port, debug, startupPath = '/') {
        if (port) {
            this.port = port;
        }
        this.debug = debug || false;
        this.startupPath = startupPath.startsWith('/') ? startupPath : `/${startupPath}`;
    }
    async start() {
        const ui = new UILogger();
        const existingInstance = await checkExistingInstance();
        if (existingInstance) {
            ui.displayWarning(`Manager is already running on port ${existingInstance.port} (PID: ${existingInstance.pid})`);
            ui.displayInfo(`Opening existing manager at http://localhost:${existingInstance.port}${this.startupPath}`);
            await open(`http://localhost:${existingInstance.port}${this.startupPath}`);
            return;
        }
        const availablePort = await findAvailablePort(this.port, 10);
        if (availablePort === null) {
            throw new Error(`Unable to find an available port starting from ${this.port}. Please try a different port range.`);
        }
        if (availablePort !== this.port) {
            ui.displayWarning(`Port ${this.port} is not available, using port ${availablePort} instead`);
            this.port = availablePort;
        }
        const currentDir = dirname(fileURLToPath(import.meta.url));
        const managerPath = join(currentDir, './manager');
        if (!existsSync(join(managerPath, './server.js'))) {
            throw new Error('Manager build not found. Please build the manager first with: cd src/manager && pnpm run build');
        }
        ui.displayInfo('Starting Claude Configuration Manager...');
        createLock(this.port);
        this.stopHeartbeat = startHeartbeat();
        try {
            const stdio = this.debug
                ? ['ignore', 'pipe', 'pipe']
                : ['ignore', 'ignore', 'pipe'];
            this.childProcess = spawn('node', ['./server.js'], {
                cwd: managerPath,
                env: {
                    ...process.env,
                    PORT: this.port.toString(),
                    HOSTNAME: 'localhost',
                    [START_CLAUDE_PROJECT_ROOT_ENV]: process.cwd(),
                },
                stdio,
            });
            if (this.debug && this.childProcess.stdout) {
                ui.displayVerbose('Debug mode: Manager server output will be shown below');
                this.childProcess.stdout.on('data', (data) => {
                    process.stdout.write(data);
                });
            }
            if (this.childProcess.stderr) {
                this.childProcess.stderr.on('data', (data) => {
                    const output = data.toString().trim();
                    if (this.debug) {
                        process.stderr.write(data);
                    }
                    else {
                        if (output.includes('Error') || output.includes('EADDRINUSE') || output.includes('Cannot')) {
                            console.error('Manager error:', output);
                        }
                    }
                });
            }
            this.childProcess.on('error', (error) => {
                ui.displayError(`Failed to start manager: ${error.message}`);
            });
            this.childProcess.on('exit', (code, signal) => {
                if (this.stopHeartbeat) {
                    this.stopHeartbeat();
                    this.stopHeartbeat = null;
                }
                removeLock();
                const wasIntentionalShutdown = code === 0 || signal === 'SIGTERM';
                if (wasIntentionalShutdown) {
                    ui.displaySuccess('Configuration Manager stopped');
                    setTimeout(() => {
                        ui.displayInfo('Exiting CLI...');
                        process.exit(0);
                    }, 100);
                }
                else if (code !== null) {
                    ui.displayError(`Manager process exited unexpectedly with code ${code}`);
                }
                this.childProcess = null;
            });
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Server startup timeout'));
                }, 15000);
                let resolved = false;
                const checkServer = () => {
                    if (resolved)
                        return;
                    const req = http.request({
                        hostname: 'localhost',
                        port: this.port,
                        method: 'GET',
                        path: '/',
                        timeout: 1000,
                    }, (_res) => {
                        if (resolved)
                            return;
                        resolved = true;
                        clearTimeout(timeout);
                        ui.displaySuccess(`✨ Claude Configuration Manager is running on port ${this.port}!`);
                        ui.displayInfo(`Opening manager at http://localhost:${this.port}${this.startupPath}`);
                        ui.displayInfo('Press Ctrl+C to stop the manager');
                        resolve();
                    });
                    req.on('error', () => {
                        if (!resolved) {
                            setTimeout(checkServer, 1000);
                        }
                    });
                    req.on('timeout', () => {
                        req.destroy();
                        if (!resolved) {
                            setTimeout(checkServer, 1000);
                        }
                    });
                    req.end();
                };
                setTimeout(checkServer, 2000);
            });
            await open(`http://localhost:${this.port}${this.startupPath}`);
        }
        catch (error) {
            if (this.stopHeartbeat) {
                this.stopHeartbeat();
                this.stopHeartbeat = null;
            }
            removeLock();
            if (this.childProcess) {
                this.childProcess.kill();
                this.childProcess = null;
            }
            ui.displayError(`Failed to start manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    async stop() {
        const ui = new UILogger();
        if (this.childProcess) {
            ui.displayInfo('Stopping Configuration Manager...');
            if (this.stopHeartbeat) {
                this.stopHeartbeat();
                this.stopHeartbeat = null;
            }
            removeLock();
            try {
                const req = http.request({
                    hostname: 'localhost',
                    port: this.port,
                    method: 'POST',
                    path: '/api/shutdown',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 2000,
                }, () => {
                    ui.displayInfo('Shutdown signal sent to manager');
                });
                req.on('error', () => {
                });
                req.on('timeout', () => {
                    req.destroy();
                });
                req.write('{}');
                req.end();
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            catch {
            }
            this.childProcess.kill('SIGTERM');
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (this.childProcess && !this.childProcess.killed) {
                        this.childProcess.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);
                this.childProcess.on('exit', () => {
                    clearTimeout(timeout);
                    this.childProcess = null;
                    resolve();
                });
            });
        }
    }
    isRunning() {
        return this.childProcess !== null && !this.childProcess.killed;
    }
}
