import process from 'node:process';
import inquirer from 'inquirer';
import { LoadBalancerStrategy } from '../config/types';
import { TransformerService } from '../services/transformer';
import { findClosestMatch, isSimilarEnough } from '../utils/cli/fuzzy-match';
import { UILogger } from '../utils/cli/ui';
import { hasConfigApiCredentials } from '../utils/config/credentials';
const handledOptionSpecs = {
    '--config': { value: 'required' },
    '--list': { value: 'none' },
    '--health-check': { value: 'none' },
    '--add-dir': { value: 'variadic' },
    '--agent': { value: 'required' },
    '--agents': { value: 'required' },
    '--allow-dangerously-skip-permissions': { value: 'none' },
    '--allowedTools': { value: 'variadic' },
    '--allowed-tools': { value: 'variadic' },
    '--append-system-prompt': { value: 'required' },
    '--bare': { value: 'none' },
    '--betas': { value: 'variadic' },
    '--brief': { value: 'none' },
    '--chrome': { value: 'none' },
    '--no-chrome': { value: 'none' },
    '-c': { value: 'none' },
    '--continue': { value: 'none' },
    '--dangerously-skip-permissions': { value: 'none' },
    '-d': { value: 'optional' },
    '--debug': { value: 'optional' },
    '--debug-file': { value: 'required' },
    '--disable-slash-commands': { value: 'none' },
    '--disallowedTools': { value: 'variadic' },
    '--disallowed-tools': { value: 'variadic' },
    '--effort': { value: 'required' },
    '--exclude-dynamic-system-prompt-sections': { value: 'none' },
    '--fallback-model': { value: 'required' },
    '--file': { value: 'variadic' },
    '--fork-session': { value: 'none' },
    '--from-pr': { value: 'optional' },
    '--ide': { value: 'none' },
    '--include-hook-events': { value: 'none' },
    '--include-partial-messages': { value: 'none' },
    '--input-format': { value: 'required' },
    '--json-schema': { value: 'required' },
    '--max-budget-usd': { value: 'required' },
    '--max-turns': { value: 'required' },
    '--mcp-config': { value: 'variadic' },
    '--mcp-debug': { value: 'none' },
    '--model': { value: 'required' },
    '-n': { value: 'required' },
    '--name': { value: 'required' },
    '--no-session-persistence': { value: 'none' },
    '--output-format': { value: 'required' },
    '--permission-mode': { value: 'required' },
    '--permission-prompt-tool': { value: 'none' },
    '--plugin-dir': { value: 'required' },
    '--plugin-url': { value: 'required' },
    '-p': { value: 'optional' },
    '--print': { value: 'optional' },
    '--prompt-suggestions': { value: 'optional' },
    '--remote-control': { value: 'optional' },
    '--remote-control-session-name-prefix': { value: 'required' },
    '--replay-user-messages': { value: 'none' },
    '-r': { value: 'optional' },
    '--resume': { value: 'optional' },
    '--safe-mode': { value: 'none' },
    '--session-id': { value: 'required' },
    '--setting-sources': { value: 'required' },
    '--settings': { value: 'required' },
    '--strict-mcp-config': { value: 'none' },
    '--system-prompt': { value: 'required' },
    '--tmux': { value: 'none', filterInline: false },
    '--tools': { value: 'variadic' },
    '--verbose': { value: 'none' },
    '-w': { value: 'optional' },
    '--worktree': { value: 'optional' },
    '--check-updates': { value: 'none' },
    '--force-config-check': { value: 'none' },
    '-e': { value: 'required' },
    '--env': { value: 'required' },
    '--proxy': { value: 'required' },
    '--api-key': { value: 'required' },
    '--base-url': { value: 'required' },
    '--strategy': { value: 'required' },
    '--all': { value: 'none' },
    '--skip-health-check': { value: 'none' },
};
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
export function isDebugEnabled(options) {
    return options.debug !== undefined && options.debug !== false;
}
export function buildClaudeArgs(options, config) {
    const claudeArgs = [];
    pushVariadicOption(claudeArgs, '--add-dir', options.addDir);
    pushStringOption(claudeArgs, '--agent', options.agent);
    pushStringOption(claudeArgs, '--agents', options.agents);
    pushBooleanOption(claudeArgs, '--allow-dangerously-skip-permissions', options.allowDangerouslySkipPermissions);
    pushVariadicOption(claudeArgs, '--allowedTools', options.allowedTools);
    pushStringOption(claudeArgs, '--append-system-prompt', options.appendSystemPrompt);
    pushBooleanOption(claudeArgs, '--bare', options.bare);
    pushVariadicOption(claudeArgs, '--betas', options.betas);
    pushBooleanOption(claudeArgs, '--brief', options.brief);
    pushTriStateOption(claudeArgs, '--chrome', '--no-chrome', options.chrome);
    pushBooleanOption(claudeArgs, '-c', options.continue);
    pushBooleanOption(claudeArgs, '--dangerously-skip-permissions', options.dangerouslySkipPermissions);
    pushOptionalValueOption(claudeArgs, '-d', options.debug);
    pushStringOption(claudeArgs, '--debug-file', options.debugFile);
    pushBooleanOption(claudeArgs, '--disable-slash-commands', options.disableSlashCommands);
    pushVariadicOption(claudeArgs, '--disallowedTools', options.disallowedTools);
    pushStringOption(claudeArgs, '--effort', options.effort);
    pushBooleanOption(claudeArgs, '--exclude-dynamic-system-prompt-sections', options.excludeDynamicSystemPromptSections);
    pushStringOption(claudeArgs, '--fallback-model', options.fallbackModel);
    pushVariadicOption(claudeArgs, '--file', options.file);
    pushBooleanOption(claudeArgs, '--fork-session', options.forkSession);
    pushOptionalValueOption(claudeArgs, '--from-pr', options.fromPr);
    pushBooleanOption(claudeArgs, '--ide', options.ide);
    pushBooleanOption(claudeArgs, '--include-hook-events', options.includeHookEvents);
    pushBooleanOption(claudeArgs, '--include-partial-messages', options.includePartialMessages);
    pushStringOption(claudeArgs, '--input-format', options.inputFormat);
    pushStringOption(claudeArgs, '--json-schema', options.jsonSchema);
    pushStringOption(claudeArgs, '--max-budget-usd', options.maxBudgetUsd);
    pushNumberOption(claudeArgs, '--max-turns', options.maxTurns);
    pushVariadicOption(claudeArgs, '--mcp-config', options.mcpConfig);
    pushBooleanOption(claudeArgs, '--mcp-debug', options.mcpDebug);
    pushStringOption(claudeArgs, '--model', options.model);
    pushStringOption(claudeArgs, '--name', options.name);
    pushTriStateOption(claudeArgs, undefined, '--no-session-persistence', options.sessionPersistence);
    pushStringOption(claudeArgs, '--output-format', options.outputFormat);
    if (config?.permissionMode && !options.permissionMode) {
        claudeArgs.push('--permission-mode', config.permissionMode);
    }
    pushStringOption(claudeArgs, '--permission-mode', options.permissionMode);
    pushBooleanOption(claudeArgs, '--permission-prompt-tool', options.permissionPromptTool);
    pushRepeatableStringOption(claudeArgs, '--plugin-dir', options.pluginDir);
    pushRepeatableStringOption(claudeArgs, '--plugin-url', options.pluginUrl);
    pushOptionalValueOption(claudeArgs, '--print', options.print);
    pushOptionalValueOption(claudeArgs, '--prompt-suggestions', options.promptSuggestions);
    pushOptionalValueOption(claudeArgs, '--remote-control', options.remoteControl);
    pushStringOption(claudeArgs, '--remote-control-session-name-prefix', options.remoteControlSessionNamePrefix);
    pushBooleanOption(claudeArgs, '--replay-user-messages', options.replayUserMessages);
    pushOptionalValueOption(claudeArgs, '--resume', options.resume);
    pushBooleanOption(claudeArgs, '--safe-mode', options.safeMode);
    pushStringOption(claudeArgs, '--session-id', options.sessionId);
    pushStringOption(claudeArgs, '--setting-sources', options.settingSources);
    pushStringOption(claudeArgs, '--settings', options.settings);
    pushBooleanOption(claudeArgs, '--strict-mcp-config', options.strictMcpConfig);
    pushStringOption(claudeArgs, '--system-prompt', options.systemPrompt);
    pushTmuxOption(claudeArgs, options.tmux);
    pushVariadicOption(claudeArgs, '--tools', options.tools);
    pushBooleanOption(claudeArgs, '--verbose', options.verbose);
    pushOptionalValueOption(claudeArgs, '--worktree', options.worktree);
    return claudeArgs;
}
function pushBooleanOption(args, flag, value) {
    if (value) {
        args.push(flag);
    }
}
function pushTriStateOption(args, positiveFlag, negativeFlag, value) {
    if (value === true && positiveFlag) {
        args.push(positiveFlag);
    }
    if (value === false) {
        args.push(negativeFlag);
    }
}
function pushStringOption(args, flag, value) {
    if (value !== undefined) {
        args.push(flag, value);
    }
}
function pushNumberOption(args, flag, value) {
    if (value !== undefined && !Number.isNaN(value)) {
        args.push(flag, value.toString());
    }
}
function pushOptionalValueOption(args, flag, value) {
    if (value === true) {
        args.push(flag);
    }
    else if (typeof value === 'string') {
        args.push(flag, value);
    }
}
function pushTmuxOption(args, value) {
    if (value === true) {
        args.push('--tmux');
    }
    else if (typeof value === 'string') {
        args.push(`--tmux=${value}`);
    }
}
function pushVariadicOption(args, flag, values) {
    if (values?.length) {
        args.push(flag, ...values);
    }
}
function pushRepeatableStringOption(args, flag, values) {
    values?.forEach(value => args.push(flag, value));
}
export function filterProcessArgs(configArgOrSelector) {
    const args = process.argv.slice(2);
    const configSelector = typeof configArgOrSelector === 'object'
        ? { ...configArgOrSelector }
        : resolveStartConfigSelector(args, { positionalConfig: configArgOrSelector });
    const filtered = [];
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--') {
            filtered.push(...args.slice(index + 1));
            break;
        }
        if (arg === 'proxy') {
            continue;
        }
        const valueSkip = getHandledOptionValueSkip(args, index);
        if (valueSkip !== undefined) {
            index += valueSkip;
            continue;
        }
        if (configSelector.source === 'positional' && arg === configSelector.value) {
            configSelector.source = 'none';
            continue;
        }
        filtered.push(arg);
    }
    return filtered;
}
export function resolveStartConfigSelector(args, options) {
    const optionConfig = findOptionConfigSelector(args);
    if (optionConfig !== undefined) {
        return { value: optionConfig, source: 'option' };
    }
    const positionalConfig = options.optionConfig === undefined ? options.positionalConfig : undefined;
    if (!positionalConfig) {
        return { source: 'none' };
    }
    if (options.configExists && !options.configExists(positionalConfig)) {
        return { source: 'none' };
    }
    return { value: positionalConfig, source: 'positional' };
}
export async function resolveStartConfigSelectorAsync(args, options) {
    const optionConfig = findOptionConfigSelector(args);
    if (optionConfig !== undefined) {
        return { value: optionConfig, source: 'option' };
    }
    const positionalConfig = options.optionConfig === undefined ? options.positionalConfig : undefined;
    if (!positionalConfig) {
        return { source: 'none' };
    }
    if (options.configExists && !(await options.configExists(positionalConfig))) {
        return { source: 'none' };
    }
    return { value: positionalConfig, source: 'positional' };
}
function findOptionConfigSelector(args) {
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--') {
            return undefined;
        }
        if (arg === '--config') {
            return args[index + 1];
        }
        if (arg.startsWith('--config=')) {
            return arg.slice('--config='.length);
        }
    }
    return undefined;
}
function getHandledOptionValueSkip(args, index) {
    const arg = args[index];
    const [flag] = arg.split('=', 1);
    const inlineOptionSpec = handledOptionSpecs[flag];
    if (arg.includes('=') && inlineOptionSpec) {
        return inlineOptionSpec.filterInline === false ? undefined : 0;
    }
    const optionSpec = handledOptionSpecs[arg];
    if (!optionSpec) {
        return undefined;
    }
    if (optionSpec.value === 'none') {
        return 0;
    }
    if (optionSpec.value === 'required') {
        return hasNextValue(args, index) ? 1 : 0;
    }
    if (optionSpec.value === 'optional') {
        return hasNextValue(args, index) ? 1 : 0;
    }
    return countVariadicValues(args, index);
}
function hasNextValue(args, index) {
    const value = args[index + 1];
    return value !== undefined && value !== '--' && !value.startsWith('-');
}
function countVariadicValues(args, index) {
    let count = 0;
    for (let valueIndex = index + 1; valueIndex < args.length; valueIndex++) {
        const value = args[valueIndex];
        if (value === '--' || value.startsWith('-')) {
            break;
        }
        count += 1;
    }
    return count;
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
export async function resolveConfig(configManager, s3SyncManager, options, configArg, hasAlreadySynced = false, selector) {
    let config;
    const resolvedSelector = selector ?? {
        value: options.config || configArg,
        source: (options.config || configArg) ? 'option' : 'none',
    };
    const configName = resolvedSelector.value;
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
export async function resolveBaseConfig(configManager, options, configArg, balanceableConfigs, selector) {
    let baseConfig;
    const resolvedSelector = selector ?? {
        value: options.config || configArg,
        source: (options.config || configArg) ? 'option' : 'none',
    };
    const configName = resolvedSelector.value;
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
