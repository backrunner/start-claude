import process from 'node:process';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { version } from '../../package.json';
import { handleManagerCommand } from '../commands/manager';
import { UILogger } from '../utils/cli/ui';
import { normalizeModelArgs } from '../utils/model-aliases';
import { ExternalProductConfigManager } from './config-manager';
import { resolveExternalProductConfig, startExternalProduct } from './launcher';
import { getProductDefinition } from './registry';
const managementCommands = new Set([
    'add',
    'edit',
    'remove',
    'rm',
    'list',
    'ls',
    'default',
    'set-default',
    'set',
    'get',
    'manage',
    'manager',
]);
const nativeCommandsByProduct = {
    codex: new Set([
        'a',
        'app',
        'app-server',
        'apply',
        'archive',
        'cloud',
        'cloud-tasks',
        'completion',
        'debug',
        'doctor',
        'e',
        'exec',
        'execpolicy',
        'exec-server',
        'features',
        'fork',
        'help',
        'login',
        'logout',
        'mcp',
        'mcp-server',
        'plugin',
        'remote-control',
        'resume',
        'review',
        'sandbox',
        'unarchive',
        'update',
    ]),
    gemini: new Set([
        'auth',
        'chat',
        'extension',
        'extensions',
        'gemma',
        'help',
        'hook',
        'hooks',
        'mcp',
        'privacy',
        'resume',
        'settings',
        'skill',
        'skills',
        'stats',
        'tools',
        'update',
    ]),
};
export async function runExternalProductCLI(productId) {
    const definition = getProductDefinition(productId);
    const manager = ExternalProductConfigManager.getInstance(productId);
    const rawArgs = process.argv.slice(2);
    if (shouldHandleStartupDirectly(rawArgs)) {
        await runProductStartup(productId, rawArgs);
        return;
    }
    const program = new Command();
    program
        .name(`start-${definition.id}`)
        .version(version, '-v, --version', 'Display version number')
        .description(definition.description)
        .allowUnknownOption()
        .enablePositionalOptions();
    program
        .option('--config <name>', 'Use specific configuration')
        .option('--start-config <name>', 'Use specific Start configuration')
        .option('--list', 'List all configurations')
        .argument('[config]', 'Configuration name')
        .allowUnknownOption()
        .allowExcessArguments()
        .action(async (configArg, options) => {
        if (options.list) {
            displayConfigs(productId);
            return;
        }
        await runProductStartup(productId, process.argv.slice(2), options.startConfig || options.config || configArg);
    });
    program
        .command('add')
        .description(`Add a new ${definition.shortTitle} configuration`)
        .action(async () => {
        const config = await promptConfig(productId);
        manager.addConfig(config);
        new UILogger().success(`Configuration "${config.name}" added`);
    });
    program
        .command('edit <name>')
        .description(`Edit an existing ${definition.shortTitle} configuration`)
        .action(async (name) => {
        const existing = manager.getConfig(name);
        if (!existing) {
            new UILogger().error(`Configuration "${name}" not found`);
            process.exit(1);
        }
        const config = await promptConfig(productId, existing);
        manager.addConfig(config);
        new UILogger().success(`Configuration "${config.name}" updated`);
    });
    program
        .command('remove <name>')
        .alias('rm')
        .description('Remove a configuration')
        .action((name) => {
        if (!manager.removeConfig(name)) {
            new UILogger().error(`Configuration "${name}" not found`);
            process.exit(1);
        }
        new UILogger().success(`Configuration "${name}" removed`);
    });
    program
        .command('list')
        .alias('ls')
        .description('List configurations')
        .action(() => displayConfigs(productId));
    program
        .command('default <name>')
        .alias('set-default')
        .description('Set default configuration')
        .action((name) => {
        if (!manager.setDefaultConfig(name)) {
            new UILogger().error(`Configuration "${name}" not found`);
            process.exit(1);
        }
        new UILogger().success(`Configuration "${name}" is now default`);
    });
    program
        .command('set <name> <property> <value>')
        .description('Set a configuration property')
        .action((name, property, value) => {
        const config = manager.getConfig(name);
        if (!config) {
            new UILogger().error(`Configuration "${name}" not found`);
            process.exit(1);
        }
        manager.addConfig({
            ...config,
            [property]: coerceConfigValue(property, value),
        });
        new UILogger().success(`Updated ${property} for "${name}"`);
    });
    program
        .command('get <name> [property]')
        .description('Get a configuration property or display the full configuration')
        .action((name, property) => {
        const config = manager.getConfig(name);
        if (!config) {
            new UILogger().error(`Configuration "${name}" not found`);
            process.exit(1);
        }
        if (property) {
            console.log(formatSecretValue(property, config[property]));
            return;
        }
        console.log(JSON.stringify(redactConfig(config), null, 2));
    });
    program
        .command('manage')
        .alias('manager')
        .description(`Open the ${definition.shortTitle} Manager web interface`)
        .option('-p, --port <number>', 'Port to run the manager on', '2334')
        .option('--verbose', 'Enable verbose output')
        .option('--debug', 'Enable debug mode')
        .action(async (options) => handleManagerCommand({ ...options, defaultMode: productId }));
    await program.parseAsync(process.argv);
}
async function runProductStartup(productId, rawArgs, commanderConfigName) {
    const definition = getProductDefinition(productId);
    const manager = ExternalProductConfigManager.getInstance(productId);
    const invocation = commanderConfigName
        ? {
            configName: commanderConfigName,
            passThroughArgs: getPassThroughArgs(rawArgs, {
                selector: {
                    value: commanderConfigName,
                },
            }),
        }
        : resolveProductInvocationArgs(rawArgs, name => Boolean(manager.getConfig(name)), productId);
    const config = resolveExternalProductConfig(productId, invocation.configName);
    if (!config) {
        if (invocation.configName) {
            displayMissingConfig(productId, invocation.configName);
            process.exit(1);
        }
        new UILogger().info(`🔧 No default ${definition.shortTitle} configuration set, starting ${definition.shortTitle} directly`);
    }
    new UILogger().info(`🚀 ${definition.shortTitle} is starting...`);
    const exitCode = await startExternalProduct(productId, config, invocation.passThroughArgs);
    process.exit(exitCode);
}
export function shouldHandleStartupDirectly(args) {
    if (args.length === 0) {
        return true;
    }
    const token = getFirstRoutingToken(args);
    if (!token) {
        return true;
    }
    if (token.type === 'root') {
        return false;
    }
    if (token.type === 'delimiter' || token.type === 'native-option') {
        return true;
    }
    return token.type === 'positional' && !managementCommands.has(token.value);
}
function getFirstRoutingToken(args) {
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--') {
            return { type: 'delimiter' };
        }
        if (arg === '--help' || arg === '-h' || arg === '--version' || arg === '-v' || arg === '--list') {
            return { type: 'root' };
        }
        if (arg === '--config' || arg === '--start-config') {
            index += 1;
            continue;
        }
        if (arg.startsWith('--config=') || arg.startsWith('--start-config=')) {
            continue;
        }
        if (arg.startsWith('-')) {
            return { type: 'native-option' };
        }
        return { type: 'positional', value: arg };
    }
    return undefined;
}
export function resolveProductInvocationArgs(args, configExists, productId) {
    const explicitSelector = findExplicitConfigSelector(args, configExists);
    if (explicitSelector) {
        return {
            configName: explicitSelector.value,
            passThroughArgs: getPassThroughArgs(args, { selector: explicitSelector }),
        };
    }
    const implicitSelector = findImplicitConfigSelector(args, configExists, productId);
    if (implicitSelector) {
        return {
            configName: implicitSelector.value,
            passThroughArgs: getPassThroughArgs(args, { selector: implicitSelector }),
        };
    }
    return {
        passThroughArgs: getPassThroughArgs(args),
    };
}
function findExplicitConfigSelector(args, configExists) {
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--start-config') {
            const value = args[index + 1];
            return value
                ? { value, optionIndex: index, valueIndex: index + 1 }
                : undefined;
        }
        if (arg.startsWith('--start-config=')) {
            return { value: arg.slice('--start-config='.length), optionIndex: index, inline: true };
        }
        if (arg === '--config') {
            const value = args[index + 1];
            if (!value) {
                return undefined;
            }
            if (isStartConfigSelectorValue(value, configExists)) {
                return { value, optionIndex: index, valueIndex: index + 1 };
            }
            index += 1;
            continue;
        }
        if (arg.startsWith('--config=')) {
            const value = arg.slice('--config='.length);
            if (isStartConfigSelectorValue(value, configExists)) {
                return { value, optionIndex: index, inline: true };
            }
        }
    }
    return undefined;
}
function findImplicitConfigSelector(args, configExists, productId) {
    const nativeCommands = getNativeCommands(productId);
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--') {
            return undefined;
        }
        if (arg === '--start-config' || arg === '--config') {
            index += 1;
            continue;
        }
        if (arg.startsWith('--start-config=') || arg.startsWith('--config=')) {
            continue;
        }
        if (arg.startsWith('-')) {
            return undefined;
        }
        return !nativeCommands.has(arg) && configExists(arg)
            ? { value: arg, valueIndex: index }
            : undefined;
    }
    return undefined;
}
function getNativeCommands(productId) {
    if (productId) {
        return nativeCommandsByProduct[productId];
    }
    return new Set(Object.values(nativeCommandsByProduct).flatMap(commands => [...commands]));
}
function isStartConfigSelectorValue(value, configExists) {
    return configExists(value) || !value.includes('=');
}
function displayConfigs(productId) {
    const definition = getProductDefinition(productId);
    const configs = ExternalProductConfigManager.getInstance(productId)
        .listConfigs()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const ui = new UILogger();
    ui.displayWelcome();
    if (configs.length === 0) {
        ui.info(`No ${definition.shortTitle} configurations found.`);
        ui.info(`Use "start-${definition.id} add" to create one.`);
        return;
    }
    configs.forEach((config, index) => {
        const markers = [
            config.isDefault ? 'default' : '',
            config.enabled === false ? 'disabled' : '',
        ].filter(Boolean);
        const markerText = markers.length > 0 ? ` (${markers.join(', ')})` : '';
        console.log(`${index + 1}. ${config.name}${markerText}`);
        if (config.model) {
            console.log(`   model: ${config.model}`);
        }
        if (config.baseUrl) {
            console.log(`   base URL: ${config.baseUrl}`);
        }
    });
}
function displayMissingConfig(productId, configName) {
    const definition = getProductDefinition(productId);
    const ui = new UILogger();
    ui.error(configName ? `Configuration "${configName}" not found` : `No default ${definition.shortTitle} configuration set`);
    ui.info(`Use "start-${definition.id} list" to view configurations.`);
    ui.info(`Use "start-${definition.id} add" to create one.`);
}
async function promptConfig(productId, existing) {
    const definition = getProductDefinition(productId);
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Configuration name',
            default: existing?.name,
            validate: value => value.trim().length > 0 || 'Name is required',
        },
        {
            type: 'list',
            name: 'authMode',
            message: 'Authentication mode',
            choices: definition.authModes.map(mode => ({ name: formatAuthMode(mode), value: mode })),
            default: existing?.authMode || 'api-key',
        },
        {
            type: 'password',
            name: 'apiKey',
            message: 'API key',
            default: existing?.apiKey,
            when: answer => answer.authMode === 'api-key',
        },
        {
            type: 'input',
            name: 'apiKeyEnvVar',
            message: 'API key environment variable',
            default: existing?.apiKeyEnvVar || definition.defaultApiKeyEnvVar,
            when: answer => answer.authMode === 'api-key',
        },
        {
            type: 'input',
            name: 'baseUrl',
            message: 'Base URL',
            default: existing?.baseUrl,
            when: () => definition.supportsBaseUrl,
        },
        {
            type: 'input',
            name: 'model',
            message: 'Model',
            default: existing?.model || definition.defaultModel,
        },
        {
            type: 'input',
            name: 'googleCloudProject',
            message: 'Google Cloud project',
            default: existing?.googleCloudProject,
            when: answer => answer.authMode === 'vertex-ai',
        },
        {
            type: 'input',
            name: 'googleCloudLocation',
            message: 'Google Cloud location',
            default: existing?.googleCloudLocation,
            when: answer => answer.authMode === 'vertex-ai',
        },
        {
            type: 'input',
            name: 'googleApplicationCredentials',
            message: 'Service account JSON path',
            default: existing?.googleApplicationCredentials,
            when: answer => answer.authMode === 'vertex-ai',
        },
        {
            type: 'confirm',
            name: 'isDefault',
            message: 'Set as default',
            default: existing?.isDefault ?? false,
        },
        {
            type: 'confirm',
            name: 'enabled',
            message: 'Enabled',
            default: existing?.enabled ?? true,
        },
    ]);
    return {
        ...existing,
        name: answers.name.trim(),
        authMode: answers.authMode,
        apiKey: answers.apiKey?.trim(),
        apiKeyEnvVar: answers.apiKeyEnvVar?.trim() || definition.defaultApiKeyEnvVar,
        baseUrl: answers.baseUrl?.trim(),
        model: answers.model?.trim(),
        googleCloudProject: answers.googleCloudProject?.trim(),
        googleCloudLocation: answers.googleCloudLocation?.trim(),
        googleApplicationCredentials: answers.googleApplicationCredentials?.trim(),
        isDefault: answers.isDefault,
        enabled: answers.enabled,
    };
}
function getPassThroughArgs(args, options = {}) {
    const filtered = [];
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--list') {
            continue;
        }
        if (index === options.selector?.optionIndex) {
            if (options.selector.valueIndex !== undefined) {
                index = options.selector.valueIndex;
            }
            continue;
        }
        if (index === options.selector?.valueIndex) {
            continue;
        }
        filtered.push(arg);
    }
    return normalizeModelArgs(filtered);
}
function coerceConfigValue(property, value) {
    if (property === 'enabled' || property === 'isDefault' || property === 'isDeleted') {
        return value === 'true' || value === '1' || value === 'yes';
    }
    if (property === 'order') {
        return Number.parseInt(value, 10);
    }
    return value;
}
function redactConfig(config) {
    return {
        ...config,
        apiKey: config.apiKey ? `******${config.apiKey.slice(-4)}` : undefined,
    };
}
function formatSecretValue(property, value) {
    if (property === 'apiKey' && typeof value === 'string') {
        return `******${value.slice(-4)}`;
    }
    return value;
}
function formatAuthMode(authMode) {
    switch (authMode) {
        case 'api-key':
            return 'API key';
        case 'oauth':
            return 'Account login';
        case 'vertex-ai':
            return 'Vertex AI';
    }
}
