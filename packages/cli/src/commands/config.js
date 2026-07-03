import process from 'node:process';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/manager';
import { UILogger } from '../utils/cli/ui';
export async function handleRemoveCommand(name) {
    const ui = new UILogger();
    const configManager = ConfigManager.getInstance();
    const config = await configManager.getConfig(name);
    if (!config) {
        ui.displayError(`Configuration "${name}" not found`);
        process.exit(1);
    }
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to remove configuration "${name}"?`,
            default: false,
        },
    ]);
    if (answers.confirm) {
        await configManager.removeConfig(name);
        ui.displaySuccess(`Configuration "${name}" removed successfully!`);
    }
    else {
        ui.displayInfo('Operation cancelled');
    }
}
export async function handleListCommand() {
    const ui = new UILogger();
    const configManager = ConfigManager.getInstance();
    const configs = await configManager.listConfigs();
    ui.displayWelcome();
    ui.displayConfigList(configs);
}
export async function handleDefaultCommand(name) {
    const ui = new UILogger();
    const configManager = ConfigManager.getInstance();
    const success = await configManager.setDefaultConfig(name);
    if (success) {
        ui.displaySuccess(`Configuration "${name}" set as default`);
    }
    else {
        ui.displayError(`Configuration "${name}" not found`);
        process.exit(1);
    }
}
export async function handleSetCommand(name, property, value) {
    const ui = new UILogger();
    const configManager = ConfigManager.getInstance();
    const config = await configManager.getConfig(name);
    if (!config) {
        ui.displayError(`Configuration "${name}" not found`);
        process.exit(1);
    }
    const validProperties = [
        'authToken',
        'authorization',
        'claudeCodeDisableNonessentialTraffic',
        'claudeCodeDisableExperimentalBetas',
        'claudeCodeAttributionHeader',
        'claudeCodeMaxRetries',
        'claudeCodeRetryWatchdog',
        'customHeaders',
        'smallFastModel',
        'smallFastModelAwsRegion',
        'awsBearerTokenBedrock',
        'bashDefaultTimeoutMs',
        'bashMaxTimeoutMs',
        'bashMaxOutputLength',
        'maintainProjectWorkingDir',
        'apiKeyHelperTtlMs',
        'ideSkipAutoInstall',
        'maxOutputTokens',
        'useBedrock',
        'useVertex',
        'skipBedrockAuth',
        'skipVertexAuth',
        'disableNonessentialTraffic',
        'disableTerminalTitle',
        'disableAutoupdater',
        'disableBugCommand',
        'disableCostWarnings',
        'disableErrorReporting',
        'disableNonEssentialModelCalls',
        'disableTelemetry',
        'httpProxy',
        'httpsProxy',
        'maxThinkingTokens',
        'mcpTimeout',
        'mcpToolTimeout',
        'maxMcpOutputTokens',
        'vertexRegionHaiku',
        'vertexRegionSonnet',
        'vertexRegion37Sonnet',
        'vertexRegion40Opus',
        'vertexRegion40Sonnet',
        'vertexRegion45Sonnet',
        'baseUrl',
        'apiKey',
        'model',
        'permissionMode',
    ];
    if (!validProperties.includes(property)) {
        ui.displayError(`Invalid property "${property}". Valid properties: ${validProperties.join(', ')}`);
        process.exit(1);
    }
    let convertedValue = value;
    if (['bashDefaultTimeoutMs', 'bashMaxTimeoutMs', 'bashMaxOutputLength', 'apiKeyHelperTtlMs', 'maxOutputTokens', 'claudeCodeMaxRetries', 'maxThinkingTokens', 'mcpTimeout', 'mcpToolTimeout', 'maxMcpOutputTokens'].includes(property)) {
        const numValue = Number.parseInt(value, 10);
        if (Number.isNaN(numValue)) {
            ui.displayError(`Property "${property}" requires a numeric value`);
            process.exit(1);
        }
        convertedValue = numValue;
    }
    else if (['maintainProjectWorkingDir', 'ideSkipAutoInstall', 'claudeCodeDisableNonessentialTraffic', 'claudeCodeDisableExperimentalBetas', 'claudeCodeAttributionHeader', 'claudeCodeRetryWatchdog', 'useBedrock', 'useVertex', 'skipBedrockAuth', 'skipVertexAuth', 'disableNonessentialTraffic', 'disableTerminalTitle', 'disableAutoupdater', 'disableBugCommand', 'disableCostWarnings', 'disableErrorReporting', 'disableNonEssentialModelCalls', 'disableTelemetry'].includes(property)) {
        if (value.toLowerCase() === 'true') {
            convertedValue = true;
        }
        else if (value.toLowerCase() === 'false') {
            convertedValue = false;
        }
        else {
            ui.displayError(`Property "${property}" requires a boolean value (true/false)`);
            process.exit(1);
        }
    }
    const updatedConfig = { ...config, [property]: convertedValue };
    await configManager.addConfig(updatedConfig);
    ui.displaySuccess(`Configuration "${name}" updated: ${property} = ${convertedValue}`);
}
export async function handleGetCommand(name, property) {
    const ui = new UILogger();
    const configManager = ConfigManager.getInstance();
    const config = await configManager.getConfig(name);
    if (!config) {
        ui.displayError(`Configuration "${name}" not found`);
        process.exit(1);
    }
    if (property) {
        const value = config[property];
        if (value !== undefined) {
            console.log(`${property}: ${value}`);
        }
        else {
            ui.displayInfo(`Property "${property}" is not set`);
        }
    }
    else {
        console.log(`Configuration: ${config.name}`);
        Object.entries(config).forEach(([key, value]) => {
            if (value !== undefined && value !== '') {
                console.log(`  ${key}: ${value}`);
            }
        });
    }
}
