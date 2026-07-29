import process from 'node:process';
import { ConfigManager } from '../config/manager';
import { buildProxyClaudeProviderConfig, syncClaudeProviderSettings } from '../utils/claude/provider-settings';
import { UILogger } from '../utils/cli/ui';
import { getProxyStatus, sendProxySwitchRequest } from '../utils/network/proxy-control';
export async function handleSwitchCommand(name, options = {}) {
    const ui = new UILogger(options.verbose);
    const configManager = ConfigManager.getInstance();
    const config = await configManager.getConfig(name);
    if (!config) {
        ui.error(`Configuration "${name}" not found`);
        process.exit(1);
    }
    let proxyPort;
    try {
        proxyPort = resolveProxyPort(options.port);
    }
    catch (error) {
        ui.error(error instanceof Error ? error.message : 'Invalid proxy port');
        process.exit(1);
    }
    const proxyStatus = await getRunningProxyStatus(proxyPort, ui);
    try {
        await switchRunningTransformerProxy(config, proxyStatus, proxyPort, ui);
        const settings = await configManager.getSettings();
        if (settings.syncClaudeProviderSettings !== true) {
            ui.info('Claude Code provider settings file was not updated because sync is disabled in system settings');
            return;
        }
        const providerConfig = shouldUseProxyProviderConfig(config, proxyStatus)
            ? buildProxyClaudeProviderConfig(config, { port: proxyPort })
            : config;
        const knownConfigs = await configManager.listConfigs();
        const result = await syncClaudeProviderSettings(providerConfig, { knownConfigs });
        ui.success(`Claude Code provider settings switched to "${config.name}"`);
        if (result.backupPath) {
            ui.info(`Backup: ${result.backupPath}`);
        }
        ui.info(`Updated: ${result.settingsPath}`);
    }
    catch (error) {
        ui.error(`Failed to switch Claude Code provider settings or running proxy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}
async function getRunningProxyStatus(port, ui) {
    try {
        return await getProxyStatus(port);
    }
    catch (error) {
        ui.verbose(`No running proxy detected on port ${port}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}
function shouldUseProxyProviderConfig(config, status) {
    return status?.transform === true && config.transformerEnabled === true;
}
async function switchRunningTransformerProxy(config, status, port, ui) {
    if (!status) {
        return;
    }
    if (!status.transform) {
        ui.verbose(`Running proxy on port ${port} is not in transformer mode`);
        return;
    }
    if (config.transformerEnabled !== true) {
        ui.warning(`Running transformer proxy was not switched because "${config.name}" is not transformer-enabled`);
        return;
    }
    const result = await sendProxySwitchRequest(port, [config]);
    if (!result.success) {
        throw new Error(`Running transformer proxy switch failed: ${result.message}`);
    }
    ui.success(`Running transformer proxy switched to "${config.name}"`);
}
function resolveProxyPort(port) {
    if (port === undefined) {
        return 2333;
    }
    if (typeof port === 'string' && !/^\d+$/.test(port.trim())) {
        throw new Error(`Invalid proxy port: ${port}`);
    }
    const resolvedPort = typeof port === 'number' ? port : Number(port);
    if (!Number.isInteger(resolvedPort) || resolvedPort <= 0 || resolvedPort > 65535) {
        throw new Error(`Invalid proxy port: ${String(port)}`);
    }
    return resolvedPort;
}
