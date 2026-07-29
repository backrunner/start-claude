import { spawn } from 'node:child_process';
import process from 'node:process';
import { UILogger } from '../utils/cli/ui';
import { findExecutable } from '../utils/system/path-utils';
import { ExternalProductConfigManager } from './config-manager';
import { prepareNativeConfig } from './native-config';
import { getProductDefinition } from './registry';
export async function startExternalProduct(productId, config, args = []) {
    const definition = getProductDefinition(productId);
    const env = { ...process.env };
    let productArgs = args;
    if (config) {
        try {
            const nativeConfig = prepareNativeConfig(definition, config, env);
            productArgs = [...nativeConfig.args, ...args];
        }
        catch (error) {
            new UILogger().error(`Failed to prepare ${definition.shortTitle} configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return 1;
        }
    }
    const executablePath = findExecutable(definition.cliCommand, {
        env,
        skipDirs: [definition.configDirName],
    });
    if (!executablePath) {
        const ui = new UILogger();
        ui.error(`${definition.shortTitle} CLI is not installed or not found in PATH.`);
        ui.info(`Install it with: npm install -g ${definition.packageName}`);
        ui.info(`Docs: ${definition.docsUrl}`);
        return 1;
    }
    return startProductProcess(definition.shortTitle, executablePath, productArgs, env);
}
export function resolveExternalProductConfig(productId, configName) {
    const manager = ExternalProductConfigManager.getInstance(productId);
    return configName ? manager.getConfig(configName) : manager.getDefaultConfig();
}
async function startProductProcess(productTitle, executablePath, args, env) {
    return new Promise((resolve) => {
        const child = spawn(executablePath, args, {
            stdio: 'inherit',
            env,
            shell: process.platform === 'win32',
        });
        let signalHandlersRegistered = false;
        const removeSignalHandlers = () => {
            if (!signalHandlersRegistered) {
                return;
            }
            process.off('SIGINT', handleSigint);
            process.off('SIGTERM', handleSigterm);
            signalHandlersRegistered = false;
        };
        const handleSignal = (signal) => {
            removeSignalHandlers();
            child.kill(signal);
        };
        function handleSigint() {
            handleSignal('SIGINT');
        }
        function handleSigterm() {
            handleSignal('SIGTERM');
        }
        child.on('close', (code) => {
            removeSignalHandlers();
            resolve(code ?? 0);
        });
        child.on('error', (error) => {
            removeSignalHandlers();
            new UILogger().error(`Failed to start ${productTitle}: ${error.message}`);
            resolve(1);
        });
        process.on('SIGINT', handleSigint);
        process.on('SIGTERM', handleSigterm);
        signalHandlersRegistered = true;
    });
}
