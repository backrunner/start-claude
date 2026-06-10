import process from 'node:process';
import { filterProxyArgs } from '../commands/proxy';
import { ProxyServer } from '../core/proxy';
import { TransformerService } from '../services/transformer';
import { UILogger } from '../utils/cli/ui';
import { hasConfigApiCredentials } from '../utils/config/credentials';
import { fileLogger } from '../utils/logging/file-logger';
import { checkAndHandleExistingProxy, removeLockFile, setupProxyCleanup } from '../utils/network/proxy-lock';
import { startClaude } from './claude';
import { buildClaudeArgs, buildCliOverrides, filterProcessArgs, resolveBaseConfig } from './common';
export async function handleProxyMode(configManager, options, configArg, systemSettings, forcedConfigs, cliStrategy) {
    const isFromProxyCommand = forcedConfigs !== undefined;
    const shouldStartNewProxy = await checkAndHandleExistingProxy();
    if (!shouldStartNewProxy) {
        const baseConfig = await resolveBaseConfig(configManager, options, configArg, forcedConfigs || await configManager.listConfigs());
        const claudeArgs = buildClaudeArgs(options, baseConfig);
        const filteredArgs = isFromProxyCommand ? filterProxyArgs() : filterProcessArgs(configArg);
        const allArgs = [...claudeArgs, ...filteredArgs];
        const cliOverrides = {
            ...buildCliOverrides(options),
            authToken: 'sk-claude-proxy-server',
            baseUrl: 'http://localhost:2333',
        };
        const ui = new UILogger();
        ui.success('🔄 Using existing proxy server');
        const exitCode = await startClaude(baseConfig, allArgs, cliOverrides);
        process.exit(exitCode);
    }
    setupProxyCleanup();
    let configs = forcedConfigs || await configManager.listConfigs();
    const requestedConfigName = options.config || configArg;
    if (requestedConfigName && !forcedConfigs) {
        const specificConfig = await configManager.getConfig(requestedConfigName);
        if (specificConfig) {
            configs = [specificConfig];
        }
    }
    const proxyableConfigs = configs.filter((c) => {
        const hasCompleteApiCredentials = hasConfigApiCredentials(c) && (TransformerService.isTransformerEnabled(c.transformerEnabled) ? c.model : true);
        const hasTransformerEnabled = TransformerService.isTransformerEnabled(c.transformerEnabled);
        if (hasTransformerEnabled && !hasCompleteApiCredentials) {
            const ui = new UILogger();
            ui.info(`Configuration "${c.name}" is transformer-enabled but missing complete API credentials (baseUrl/apiKey or authToken/model) - including for transformer fallback`);
        }
        return hasCompleteApiCredentials || hasTransformerEnabled;
    });
    if (proxyableConfigs.length === 0) {
        const ui = new UILogger();
        ui.error('No configurations found for proxy mode');
        ui.info('Proxy mode requires configurations with either:');
        ui.info('  - baseUrl, apiKey or authToken, and model (for direct API calls)');
        ui.info('  - transformerEnabled: true (for transformer processing)');
        process.exit(1);
    }
    const ui = new UILogger();
    ui.info(`Starting proxy with ${proxyableConfigs.length} endpoint${proxyableConfigs.length > 1 ? 's' : ''}:`);
    proxyableConfigs.forEach((c) => {
        const hasTransformer = TransformerService.isTransformerEnabled(c.transformerEnabled);
        let status = '';
        if (hasTransformer) {
            status = ' (transformer)';
        }
        ui.info(`  - ${c.name}: ${c.baseUrl || 'no baseUrl'}${status}`);
    });
    try {
        const hasTransformerEnabled = proxyableConfigs.some(c => TransformerService.isTransformerEnabled(c.transformerEnabled));
        const baseConfig = await resolveBaseConfig(configManager, options, configArg, proxyableConfigs);
        let effectiveSystemSettings = systemSettings;
        if (cliStrategy) {
            effectiveSystemSettings = {
                ...systemSettings,
                balanceMode: {
                    ...systemSettings?.balanceMode,
                    strategy: cliStrategy,
                },
            };
        }
        const proxyServer = new ProxyServer(proxyableConfigs, {
            enableLoadBalance: isFromProxyCommand || proxyableConfigs.length > 1,
            enableTransform: hasTransformerEnabled,
            debug: options.debug || false,
            verbose: options.verbose || options.debug || false,
        }, effectiveSystemSettings, options.proxy);
        if (!options.skipHealthCheck) {
            await proxyServer.performInitialHealthChecks();
        }
        else {
            const ui = new UILogger();
            ui.warning('⚠️ Skipping health checks (--skip-health-check specified)');
            ui.info('All specified configurations will be used without validation');
        }
        await proxyServer.startServer(2333);
        if (options.debug) {
            const ui = new UILogger();
            ui.info('');
            ui.info(`📝 Debug logging enabled - logs will be written to: ${fileLogger.getLogFilePath()}`);
        }
        if (hasTransformerEnabled) {
            const ui = new UILogger();
            const transformers = proxyServer.listTransformers();
            if (transformers.length > 0) {
                ui.info('');
                ui.info('🔧 Available transformers:');
                transformers.forEach((transformer) => {
                    if (transformer.hasDomain) {
                        ui.info(`  - ${transformer.name} (${transformer.domain})`);
                    }
                    else {
                        ui.info(`  - ${transformer.name}`);
                    }
                });
            }
        }
        const ui = new UILogger();
        ui.info('');
        const apiConfigs = proxyableConfigs.filter(c => hasConfigApiCredentials(c) && c.model);
        const transformerConfigs = proxyableConfigs.filter(c => TransformerService.isTransformerEnabled(c.transformerEnabled));
        if (apiConfigs.length > 0 && transformerConfigs.length > 0) {
            ui.success('🔧 Proxy server is running!');
            ui.info('Starting Claude Code with hybrid proxy...');
        }
        else if (apiConfigs.length > 1) {
            ui.success('🚀 Load balancer is running!');
            ui.info('Starting Claude Code with load balancer...');
        }
        else if (transformerConfigs.length > 0) {
            ui.success('🔧 Transformer proxy is running!');
            ui.info('Starting Claude Code with transformer proxy...');
        }
        else {
            ui.success('🚀 Proxy server is running!');
            ui.info('Starting Claude Code with proxy server...');
        }
        const claudeArgs = buildClaudeArgs(options, baseConfig);
        const filteredArgs = isFromProxyCommand ? filterProxyArgs() : filterProcessArgs(configArg);
        const allArgs = [...claudeArgs, ...filteredArgs];
        const cliOverrides = {
            ...buildCliOverrides(options),
            authToken: proxyServer.getProxyApiKey(),
            baseUrl: 'http://localhost:2333',
        };
        const handleShutdown = () => {
            void (async () => {
                const ui = new UILogger();
                ui.info('\nShutting down proxy server...');
                await proxyServer.stop();
                removeLockFile();
                process.exit(0);
            })();
        };
        process.on('SIGINT', handleShutdown);
        process.on('SIGTERM', handleShutdown);
        const exitCode = await startClaude(baseConfig, allArgs, cliOverrides);
        await proxyServer.stop();
        removeLockFile();
        process.exit(exitCode);
    }
    catch (error) {
        const ui = new UILogger();
        ui.error(`Failed to start proxy server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}
