import { Buffer } from 'node:buffer';
import * as http from 'node:http';
import process from 'node:process';
import { parseBalanceStrategy } from '../cli/common';
import { handleProxyMode } from '../cli/proxy';
import { ConfigManager } from '../config/manager';
import { S3SyncManager } from '../storage/s3-sync';
import { UILogger } from '../utils/cli/ui';
export function filterProxyArgs() {
    const args = process.argv.slice(2);
    const proxySpecificFlags = [
        '--strategy',
        '--all',
        '--skip-health-check',
    ];
    let seenProxyCommand = false;
    let skipNext = false;
    return args.filter((arg, index) => {
        if (skipNext) {
            skipNext = false;
            return false;
        }
        if (arg === 'proxy') {
            seenProxyCommand = true;
            return false;
        }
        if (proxySpecificFlags.some(flag => arg.startsWith(flag))) {
            if (arg === '--strategy' && index + 1 < args.length && !args[index + 1].startsWith('-')) {
                skipNext = true;
            }
            return false;
        }
        if (arg.startsWith('-')) {
            return true;
        }
        if (seenProxyCommand) {
            return false;
        }
        return true;
    });
}
export async function handleProxySwitchCommand(configNames, options, port = 2333) {
    const ui = new UILogger(options.verbose);
    const configManager = ConfigManager.getInstance();
    if (configNames.length === 0) {
        ui.error('No configurations specified for switch');
        ui.info('Usage: start-claude proxy switch <config1> [config2] ...');
        process.exit(1);
    }
    ui.displayWelcome();
    const configs = [];
    for (const configName of configNames) {
        const config = await configManager.getConfig(configName);
        if (!config) {
            ui.error(`Configuration "${configName}" not found`);
            process.exit(1);
        }
        configs.push(config);
    }
    ui.info(`🔄 Switching proxy to ${configs.length} configuration${configs.length > 1 ? 's' : ''}: ${configs.map(c => c.name).join(', ')}`);
    try {
        ui.info('🔍 Testing new endpoints...');
        const result = await sendSwitchRequest(port, configs);
        if (result.success) {
            if (result.endpointDetails && result.endpointDetails.length > 0) {
                for (const detail of result.endpointDetails) {
                    if (detail.healthy) {
                        ui.success(`✅ ${detail.name} - healthy`);
                    }
                    else {
                        ui.error(`❌ ${detail.name} - ${detail.error || 'failed'}`);
                    }
                }
            }
            if (result.speedTestResults && result.speedTestResults.length > 0) {
                ui.info('');
                ui.success('📊 Speed test results:');
                result.speedTestResults.forEach((test, index) => {
                    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
                    ui.info(`   ${emoji} ${test.name}: ${test.responseTime.toFixed(1)}ms`);
                });
                ui.info('');
            }
            ui.success(`✅ ${result.message}`);
            ui.info(`   Healthy endpoints: ${result.healthyEndpoints}/${result.totalEndpoints}`);
        }
        else {
            if (result.endpointDetails && result.endpointDetails.length > 0) {
                for (const detail of result.endpointDetails) {
                    if (detail.healthy) {
                        ui.success(`✅ ${detail.name} - healthy`);
                    }
                    else {
                        ui.error(`❌ ${detail.name} - ${detail.error || 'failed'}`);
                    }
                }
            }
            ui.error(`❌ Switch failed: ${result.message}`);
            process.exit(1);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        ui.error(`❌ Failed to connect to proxy server: ${errorMessage}`);
        ui.info(`   Make sure the proxy server is running on port ${port}`);
        process.exit(1);
    }
}
async function sendSwitchRequest(port, configs) {
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify({ configs });
        const options = {
            hostname: 'localhost',
            port,
            path: '/__switch',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody),
            },
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.success) {
                        resolve(response);
                    }
                    else if (response.error) {
                        resolve({
                            success: false,
                            message: response.error.message || 'Unknown error',
                            endpointDetails: response.endpointDetails,
                        });
                    }
                    else {
                        reject(new Error('Invalid response format from server'));
                    }
                }
                catch {
                    reject(new Error(`Invalid response from server: ${data}`));
                }
            });
        });
        req.on('error', (error) => {
            reject(error);
        });
        req.write(requestBody);
        req.end();
    });
}
export async function handleProxyCommand(configNames, options) {
    const ui = new UILogger(options.verbose);
    const configManager = ConfigManager.getInstance();
    const s3SyncManager = S3SyncManager.getInstance();
    ui.displayWelcome();
    const systemSettings = await s3SyncManager.getSystemSettings().catch(() => null);
    let cliStrategy;
    if (options.strategy) {
        const strategyResult = parseBalanceStrategy(options.strategy);
        if (strategyResult.enabled && strategyResult.strategy) {
            cliStrategy = strategyResult.strategy;
            ui.info(`🎯 Using ${cliStrategy} load balancer strategy`);
        }
    }
    let configs = [];
    if (options.all || configNames.length === 0) {
        configs = await configManager.listConfigs();
        if (configs.length === 0) {
            ui.error('No configurations found');
            process.exit(1);
        }
    }
    else {
        for (const configName of configNames) {
            const config = await configManager.getConfig(configName);
            if (!config) {
                ui.error(`Configuration "${configName}" not found`);
                process.exit(1);
            }
            configs.push(config);
        }
    }
    const programOptions = {
        verbose: options.verbose,
        debug: options.debug,
        proxy: options.proxy,
        skipHealthCheck: options.skipHealthCheck,
    };
    await handleProxyMode(configManager, programOptions, undefined, systemSettings, configs, cliStrategy);
}
