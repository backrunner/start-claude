import process from 'node:process';
import inquirer from 'inquirer';
import { LoadBalancerStrategy } from '../config/types';
import { TransformerService } from '../services/transformer';
import { findClosestMatch, isSimilarEnough } from '../utils/cli/fuzzy-match';
import { UILogger } from '../utils/cli/ui';
import { hasConfigApiCredentials } from '../utils/config/credentials';
export function parseBalanceStrategy(balanceOption) {
    if (balanceOption === false || balanceOption === undefined) {
        return { enabled: false };
    }
    if (balanceOption === true) {
        return { enabled: true };
    }
    const strategy = String(balanceOption).toLowerCase();
    const ui = new UILogger();
    switch (strategy) {
        case 'fallback':
            return { enabled: true, strategy: LoadBalancerStrategy.Fallback };
        case 'polling':
            return { enabled: true, strategy: LoadBalancerStrategy.Polling };
        case 'speedfirst':
        case 'speed-first':
            return { enabled: true, strategy: LoadBalancerStrategy.SpeedFirst };
        default:
            ui.warning(`❌ Unknown balance strategy '${strategy}'.`);
            ui.info('💡 Available strategies:');
            ui.info('   • fallback    - Priority-based with failover (default)');
            ui.info('   • polling     - Round-robin across all endpoints');
            ui.info('   • speedfirst  - Route to fastest responding endpoint');
            ui.error('Using fallback strategy instead.');
            return { enabled: true, strategy: LoadBalancerStrategy.Fallback };
    }
}
export function buildClaudeArgs(options, config) {
    const claudeArgs = [];
    if (options.addDir) {
        options.addDir.forEach((dir) => {
            claudeArgs.push('--add-dir', dir);
        });
    }
    if (options.allowedTools) {
        claudeArgs.push('--allowedTools', options.allowedTools.join(','));
    }
    if (options.disallowedTools) {
        claudeArgs.push('--disallowedTools', options.disallowedTools.join(','));
    }
    if (options.agents) {
        claudeArgs.push('--agents', options.agents);
    }
    if (options.print) {
        if (typeof options.print === 'string') {
            claudeArgs.push('--print', options.print);
        }
        else {
            claudeArgs.push('--print');
        }
    }
    if (options.outputFormat) {
        claudeArgs.push('--output-format', options.outputFormat);
    }
    if (options.inputFormat) {
        claudeArgs.push('--input-format', options.inputFormat);
    }
    if (options.verbose) {
        claudeArgs.push('--verbose');
    }
    if (options.debug) {
        claudeArgs.push('-d');
    }
    if (options.maxTurns) {
        claudeArgs.push('--max-turns', options.maxTurns.toString());
    }
    if (options.model) {
        claudeArgs.push('--model', options.model);
    }
    if (config?.permissionMode && !options.permissionMode) {
        claudeArgs.push('--permission-mode', config.permissionMode);
    }
    if (options.permissionMode) {
        claudeArgs.push('--permission-mode', options.permissionMode);
    }
    if (options.permissionPromptTool) {
        claudeArgs.push('--permission-prompt-tool');
    }
    if (options.resume) {
        claudeArgs.push('--resume');
    }
    if (options.continue) {
        claudeArgs.push('-c');
    }
    if (options.dangerouslySkipPermissions) {
        claudeArgs.push('--dangerously-skip-permissions');
    }
    return claudeArgs;
}
export function filterProcessArgs(configArg) {
    return process.argv.slice(2).filter((arg) => {
        const skipCommands = [
            'proxy',
        ];
        const skipFlags = [
            '--config',
            '--list',
            '--health-check',
            '--add-dir',
            '--allowedTools',
            '--disallowedTools',
            '-p',
            '--print',
            '--output-format',
            '--input-format',
            '--verbose',
            '--debug',
            '--max-turns',
            '--model',
            '--permission-mode',
            '--permission-prompt-tool',
            '--resume',
            '--continue',
            '--check-updates',
            '--force-config-check',
            '--dangerously-skip-permissions',
            '-e',
            '--env',
            '--proxy',
            '--api-key',
            '--base-url',
            '--strategy',
            '--all',
        ];
        if (skipCommands.includes(arg))
            return false;
        if (configArg && arg === configArg)
            return false;
        if (skipFlags.some(flag => arg.startsWith(flag)))
            return false;
        if (arg.startsWith('--print='))
            return false;
        const prevArg = process.argv[process.argv.indexOf(arg) - 1];
        const flagsWithValues = [
            '--config',
            '--add-dir',
            '--allowedTools',
            '--disallowedTools',
            '--print',
            '--output-format',
            '--input-format',
            '--max-turns',
            '--model',
            '--permission-mode',
            '--env',
            '-e',
            '--proxy',
            '--api-key',
            '--base-url',
            '--strategy',
        ];
        if (prevArg && flagsWithValues.includes(prevArg))
            return false;
        return true;
    });
}
export function buildCliOverrides(options) {
    return {
        env: options.env || [],
        proxy: options.proxy,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        model: options.model,
    };
}
async function handleS3ConfigLookup(configManager, s3SyncManager, configName, hasAlreadySynced = false) {
    const ui = new UILogger();
    if (!(await s3SyncManager.isS3Configured())) {
        return undefined;
    }
    if (s3SyncManager.isCloudSyncEnabled()) {
        ui.verbose('Cloud sync is enabled, skipping S3 download check');
        return undefined;
    }
    if (!hasAlreadySynced) {
        ui.info(`Configuration "${configName}" not found locally. Checking S3 for updates...`);
        const syncSuccess = await s3SyncManager.checkAutoSync({ silent: true });
        if (!syncSuccess) {
            return undefined;
        }
    }
    return configManager.getConfig(configName);
}
async function handleS3EmptyConfigDownload(configManager, s3SyncManager) {
    const ui = new UILogger();
    if (!(await s3SyncManager.isS3Configured())) {
        return undefined;
    }
    if (s3SyncManager.isCloudSyncEnabled()) {
        ui.verbose('Cloud sync is enabled, skipping S3 download check');
        return undefined;
    }
    ui.info('No local configurations found, but S3 sync is configured.');
    ui.info('Checking S3 for existing configurations...');
    const downloadSuccess = await s3SyncManager.downloadConfigs(true);
    if (!downloadSuccess) {
        return undefined;
    }
    const config = await configManager.getDefaultConfig();
    if (config) {
        ui.info(`Using downloaded configuration: ${config.name}`);
        return config;
    }
    const downloadedConfigs = await configManager.listConfigs();
    if (downloadedConfigs.length === 0) {
        return undefined;
    }
    ui.info('Choose a configuration to use:');
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedConfig',
            message: 'Select configuration:',
            choices: downloadedConfigs.map((c) => ({
                name: `${c.name}${c.isDefault ? ' (default)' : ''}`,
                value: c.name,
            })),
        },
    ]);
    return configManager.getConfig(answers.selectedConfig);
}
async function handleS3UpdateCheck(configManager, s3SyncManager) {
    if (!(await s3SyncManager.isS3Configured())) {
        return undefined;
    }
    if (s3SyncManager.isCloudSyncEnabled()) {
        return undefined;
    }
    const syncSuccess = await s3SyncManager.checkAutoSync({ silent: true });
    if (syncSuccess) {
        return configManager.getDefaultConfig();
    }
    return undefined;
}
export async function resolveConfig(configManager, s3SyncManager, options, configArg, hasAlreadySynced = false) {
    let config;
    const configName = options.config || configArg;
    if (configName !== undefined) {
        config = await configManager.getConfig(configName);
        if (!config) {
            config = await handleS3ConfigLookup(configManager, s3SyncManager, configName, hasAlreadySynced);
            if (!config) {
                const allConfigs = await configManager.listConfigs();
                const configNames = allConfigs.map((c) => c.name);
                const closest = findClosestMatch(configName, configNames);
                if (closest && isSimilarEnough(closest.similarity, 0.6)) {
                    const ui = new UILogger();
                    ui.warning(`Configuration "${configName}" not found`);
                    ui.info(`💡 Did you mean "${closest.match}"?`);
                    const confirmAnswer = await inquirer.prompt([
                        {
                            type: 'confirm',
                            name: 'useClosest',
                            message: `Start with "${closest.match}" instead?`,
                            default: true,
                        },
                    ]);
                    if (confirmAnswer.useClosest) {
                        config = await configManager.getConfig(closest.match);
                        if (config) {
                            ui.success(`✅ Using configuration "${closest.match}"`);
                            return config;
                        }
                    }
                }
                const ui = new UILogger();
                ui.error(`Configuration "${configName}" not found`);
                if (configNames.length > 0) {
                    ui.info('📋 Available configurations:');
                    configNames.forEach(name => ui.info(`  - ${name}`));
                }
                process.exit(1);
            }
        }
        return config;
    }
    config = await configManager.getDefaultConfig();
    if (!config) {
        const configs = await configManager.listConfigs();
        if (configs.length === 0) {
            config = await handleS3EmptyConfigDownload(configManager, s3SyncManager);
            if (config) {
                return config;
            }
            return createNewConfig(configManager);
        }
        else {
            if (!hasAlreadySynced) {
                const updatedConfig = await handleS3UpdateCheck(configManager, s3SyncManager);
                if (updatedConfig) {
                    config = updatedConfig;
                }
            }
            if (!config) {
                const ui = new UILogger();
                ui.info('Choose a configuration to use:');
                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'selectedConfig',
                        message: 'Select configuration:',
                        choices: configs.map(c => ({
                            name: `${c.name}${c.isDefault ? ' (default)' : ''}`,
                            value: c.name,
                        })),
                    },
                ]);
                return configManager.getConfig(answers.selectedConfig);
            }
        }
    }
    else {
        if (!hasAlreadySynced) {
            const updatedConfig = await handleS3UpdateCheck(configManager, s3SyncManager);
            if (updatedConfig) {
                config = updatedConfig;
            }
        }
    }
    return config;
}
async function createNewConfig(configManager) {
    const ui = new UILogger();
    ui.warning('No configurations found. Let\'s create your first one!');
    const profileTypeAnswer = await inquirer.prompt([
        {
            type: 'list',
            name: 'profileType',
            message: 'Profile type:',
            choices: [
                { name: 'Default (custom API settings)', value: 'default' },
                {
                    name: 'Official (use official Claude login with proxy support)',
                    value: 'official',
                },
            ],
            default: 'default',
        },
    ]);
    const questions = [
        {
            type: 'input',
            name: 'name',
            message: 'Configuration name:',
            validate: (input) => (input.trim() ? true : 'Name is required'),
        },
    ];
    if (profileTypeAnswer.profileType === 'default') {
        questions.push({
            type: 'input',
            name: 'baseUrl',
            message: 'Base URL (optional):',
        }, {
            type: 'password',
            name: 'apiKey',
            message: 'API Key (optional):',
            mask: '*',
        });
    }
    else if (profileTypeAnswer.profileType === 'official') {
        questions.push({
            type: 'input',
            name: 'httpProxy',
            message: 'HTTP Proxy (optional):',
        }, {
            type: 'input',
            name: 'httpsProxy',
            message: 'HTTPS Proxy (optional):',
        });
    }
    questions.push({
        type: 'input',
        name: 'model',
        message: 'Model (optional):',
        default: '',
    }, {
        type: 'list',
        name: 'permissionMode',
        message: 'Permission mode (optional):',
        choices: [
            { name: 'Default (ask for permissions)', value: 'default' },
            { name: 'Accept Edits (auto-accept file edits)', value: 'acceptEdits' },
            { name: 'Auto (automatically decide when to ask)', value: 'auto' },
            { name: 'Don\'t Ask (never ask for permissions)', value: 'dontAsk' },
            { name: 'Plan (planning mode)', value: 'plan' },
            { name: 'Bypass Permissions (dangerous)', value: 'bypassPermissions' },
            { name: 'None (use Claude default)', value: null },
        ],
        default: null,
    }, {
        type: 'confirm',
        name: 'isDefault',
        message: 'Set as default configuration?',
        default: true,
    });
    const answers = await inquirer.prompt(questions);
    const newConfig = {
        name: answers.name.trim(),
        profileType: profileTypeAnswer.profileType,
        baseUrl: profileTypeAnswer.profileType === 'default'
            ? answers.baseUrl?.trim() || undefined
            : undefined,
        apiKey: profileTypeAnswer.profileType === 'default'
            ? answers.apiKey?.trim() || undefined
            : undefined,
        httpProxy: profileTypeAnswer.profileType === 'official'
            ? answers.httpProxy?.trim() || undefined
            : undefined,
        httpsProxy: profileTypeAnswer.profileType === 'official'
            ? answers.httpsProxy?.trim() || undefined
            : undefined,
        model: answers.model?.trim() || undefined,
        permissionMode: answers.permissionMode || undefined,
        isDefault: answers.isDefault,
    };
    await configManager.addConfig(newConfig);
    if (newConfig.isDefault) {
        await configManager.setDefaultConfig(newConfig.name);
    }
    ui.success(`Configuration "${newConfig.name}" created successfully!`);
    return newConfig;
}
export async function resolveBaseConfig(configManager, options, configArg, balanceableConfigs) {
    let baseConfig;
    const configName = options.config || configArg;
    if (configName !== undefined) {
        baseConfig = await configManager.getConfig(configName);
        if (!baseConfig) {
            const ui = new UILogger();
            ui.error(`Configuration "${configName}" not found`);
            process.exit(1);
        }
        if (!balanceableConfigs.find(c => c.name.toLowerCase() === baseConfig?.name.toLowerCase())) {
            const hasTransformer = 'transformerEnabled' in baseConfig
                && TransformerService.isTransformerEnabled(baseConfig.transformerEnabled);
            const missingCompleteApiCredentials = !hasConfigApiCredentials(baseConfig) || !baseConfig.model;
            if (hasTransformer && missingCompleteApiCredentials) {
                const ui = new UILogger();
                ui.warning(`Configuration "${baseConfig.name}" is transformer-enabled but missing complete API credentials (baseUrl/apiKey or authToken/model) for API calls`);
                ui.info('Using it for settings and transformer processing only');
            }
            else if (missingCompleteApiCredentials) {
                const ui = new UILogger();
                ui.warning(`Configuration "${baseConfig.name}" is not included in load balancing (missing baseUrl, apiKey or authToken, or model)`);
                ui.info('Using it for other settings only, load balancing will use available endpoints');
            }
            else {
                const ui = new UILogger();
                ui.warning(`Configuration "${baseConfig.name}" is not included in load balancing`);
                ui.info('Using it for other settings only, load balancing will use available endpoints');
            }
        }
    }
    else {
        baseConfig = await configManager.getDefaultConfig();
        if (!baseConfig || !balanceableConfigs.find(c => c.name.toLowerCase() === baseConfig?.name.toLowerCase())) {
            baseConfig = balanceableConfigs[0];
        }
    }
    return baseConfig;
}
