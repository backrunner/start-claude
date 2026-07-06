import { spawn } from 'node:child_process';
import process from 'node:process';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/manager';
import { ClaudeConfigSyncer } from '../extensions/claude-config-syncer';
import { ClaudeConfigWatcher } from '../extensions/claude-config-watcher';
import { ExtensionsWriter } from '../extensions/writer';
import { detectAvailableInstallMethods, findClaudeExecutable } from '../utils/cli/install-methods';
import { UILogger } from '../utils/cli/ui';
import { CacheManager } from '../utils/config/cache-manager';
let configWatcher = null;
export async function startClaude(config, args = [], cliOverrides) {
    const env = { ...process.env };
    env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0';
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
    env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = '1';
    if (config) {
        setEnvFromConfig(env, config);
        try {
            await writeExtensionsConfig(config);
        }
        catch (error) {
            const ui = new UILogger();
            ui.warning(`Failed to write extensions configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    const systemSettings = await loadSystemSettings();
    applySystemSettingsEnv(env, systemSettings);
    if (cliOverrides) {
        applyCliOverrides(env, cliOverrides);
    }
    const claudeResult = findClaudeExecutable(env);
    if (!claudeResult) {
        const shouldInstall = await promptForInstallation();
        if (shouldInstall) {
            const installSuccess = await installClaudeCode();
            if (!installSuccess) {
                return 1;
            }
            const newClaudeResult = findClaudeExecutable(env);
            if (!newClaudeResult) {
                const ui = new UILogger();
                ui.error('Failed to find Claude Code after installation. Please restart your terminal.');
                return 1;
            }
            return startClaudeProcess(newClaudeResult.path, args, env, config);
        }
        else {
            const ui = new UILogger();
            ui.error('Claude Code is required to run start-claude.');
            ui.info('You can install it manually with: pnpm add -g @anthropic-ai/claude-code');
            return 1;
        }
    }
    else {
        return startClaudeProcess(claudeResult.path, args, env, config);
    }
}
async function promptForInstallation() {
    const answer = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'install',
            message: 'Claude Code CLI is not installed. Would you like to install it automatically?',
            default: true,
        },
    ]);
    return answer.install;
}
async function installClaudeCode() {
    const ui = new UILogger();
    const allMethods = await detectAvailableInstallMethods();
    const availableMethods = allMethods.filter(m => m.available);
    const preferred = availableMethods[0];
    if (!preferred) {
        ui.error('No installation method available. Please install Node.js or use the official installer.');
        return false;
    }
    return new Promise((resolve) => {
        ui.info(`Installing Claude Code CLI using ${preferred.name}...`);
        const [command, ...args] = preferred.installCmd.split(' ');
        const installer = spawn(command, args, {
            stdio: 'inherit',
            shell: process.platform === 'win32',
        });
        installer.on('close', (code) => {
            if (code === 0) {
                ui.success('Claude Code CLI installed successfully!');
                const cache = CacheManager.getInstance();
                cache.set('claude.installMethod', preferred.method);
                resolve(true);
            }
            else {
                ui.error('Failed to install Claude Code CLI');
                resolve(false);
            }
        });
        installer.on('error', (error) => {
            ui.error(`Installation failed: ${error.message}`);
            resolve(false);
        });
    });
}
async function startClaudeProcess(executablePath, args, env, config) {
    return new Promise((resolve) => {
        if (config) {
            void startConfigWatcher(config);
        }
        const claude = spawn(executablePath, args, {
            stdio: 'inherit',
            env,
            shell: process.platform === 'win32',
        });
        const cleanup = () => {
            if (configWatcher) {
                configWatcher.stop();
                configWatcher = null;
            }
        };
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
            cleanup();
            claude.kill(signal);
        };
        const handleSigint = () => handleSignal('SIGINT');
        const handleSigterm = () => handleSignal('SIGTERM');
        claude.on('close', (code) => {
            removeSignalHandlers();
            cleanup();
            resolve(code ?? 0);
        });
        claude.on('error', (error) => {
            removeSignalHandlers();
            cleanup();
            const ui = new UILogger();
            ui.error(`Failed to start Claude: ${error.message}`);
            resolve(1);
        });
        process.on('SIGINT', handleSigint);
        process.on('SIGTERM', handleSigterm);
        signalHandlersRegistered = true;
    });
}
function setEnvFromConfig(env, config) {
    const disableNonessentialTraffic = config.claudeCodeDisableNonessentialTraffic
        ?? config.disableNonessentialTraffic
        ?? parseBooleanEnvValue(config.env?.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)
        ?? true;
    const disableExperimentalBetas = config.claudeCodeDisableExperimentalBetas
        ?? parseBooleanEnvValue(config.env?.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)
        ?? true;
    if (config.env) {
        Object.entries(config.env).forEach(([key, value]) => {
            if (typeof value === 'string' && value.trim().length > 0) {
                env[key] = value;
            }
        });
    }
    const basicEnvMap = [
        ['baseUrl', 'ANTHROPIC_BASE_URL'],
        ['apiKey', 'ANTHROPIC_API_KEY'],
        ['model', 'ANTHROPIC_MODEL'],
        ['authToken', 'ANTHROPIC_AUTH_TOKEN'],
        ['customHeaders', 'ANTHROPIC_CUSTOM_HEADERS'],
        ['smallFastModel', 'ANTHROPIC_SMALL_FAST_MODEL'],
        ['smallFastModelAwsRegion', 'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION'],
        ['awsBearerTokenBedrock', 'AWS_BEARER_TOKEN_BEDROCK'],
        ['httpProxy', 'HTTP_PROXY'],
        ['httpsProxy', 'HTTPS_PROXY'],
        ['vertexRegionHaiku', 'VERTEX_REGION_CLAUDE_3_5_HAIKU'],
        ['vertexRegionSonnet', 'VERTEX_REGION_CLAUDE_3_5_SONNET'],
        ['vertexRegion37Sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],
        ['vertexRegion40Opus', 'VERTEX_REGION_CLAUDE_4_0_OPUS'],
        ['vertexRegion40Sonnet', 'VERTEX_REGION_CLAUDE_4_0_SONNET'],
        ['vertexRegion45Sonnet', 'VERTEX_REGION_CLAUDE_4_5_SONNET'],
    ];
    const numericEnvMap = [
        ['bashDefaultTimeoutMs', 'BASH_DEFAULT_TIMEOUT_MS'],
        ['bashMaxTimeoutMs', 'BASH_MAX_TIMEOUT_MS'],
        ['bashMaxOutputLength', 'BASH_MAX_OUTPUT_LENGTH'],
        ['apiKeyHelperTtlMs', 'CLAUDE_CODE_API_KEY_HELPER_TTL_MS'],
        ['maxOutputTokens', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS'],
        ['claudeCodeMaxRetries', 'CLAUDE_CODE_MAX_RETRIES'],
        ['maxThinkingTokens', 'MAX_THINKING_TOKENS'],
        ['mcpTimeout', 'MCP_TIMEOUT'],
        ['mcpToolTimeout', 'MCP_TOOL_TIMEOUT'],
        ['maxMcpOutputTokens', 'MAX_MCP_OUTPUT_TOKENS'],
    ];
    const booleanEnvMap = [
        ['maintainProjectWorkingDir', 'CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR'],
        ['ideSkipAutoInstall', 'CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL'],
        ['claudeCodeDisableExperimentalBetas', 'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS'],
        ['claudeCodeRetryWatchdog', 'CLAUDE_CODE_RETRY_WATCHDOG'],
        ['useBedrock', 'CLAUDE_CODE_USE_BEDROCK'],
        ['useVertex', 'CLAUDE_CODE_USE_VERTEX'],
        ['skipBedrockAuth', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH'],
        ['skipVertexAuth', 'CLAUDE_CODE_SKIP_VERTEX_AUTH'],
        ['disableTerminalTitle', 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE'],
        ['disableAutoupdater', 'DISABLE_AUTOUPDATER'],
        ['disableBugCommand', 'DISABLE_BUG_COMMAND'],
        ['disableCostWarnings', 'DISABLE_COST_WARNINGS'],
        ['disableErrorReporting', 'DISABLE_ERROR_REPORTING'],
        ['disableNonEssentialModelCalls', 'DISABLE_NON_ESSENTIAL_MODEL_CALLS'],
        ['disableTelemetry', 'DISABLE_TELEMETRY'],
    ];
    const additionalBooleanEnvKeys = [
        'CLAUDE_CODE_ATTRIBUTION_HEADER',
        'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
        'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
        'DISABLE_PROMPT_CACHING',
        'DISABLE_PROMPT_CACHING_FABLE',
        'DISABLE_PROMPT_CACHING_HAIKU',
        'DISABLE_PROMPT_CACHING_OPUS',
        'DISABLE_PROMPT_CACHING_SONNET',
    ];
    const booleanEnvKeys = new Set([
        ...booleanEnvMap.map(([, envKey]) => envKey),
        ...additionalBooleanEnvKeys,
    ]);
    basicEnvMap.forEach(([configKey, envKey]) => {
        const value = config[configKey];
        if (config.profileType === 'official' && (configKey === 'baseUrl' || configKey === 'apiKey')) {
            return;
        }
        if (configKey === 'customHeaders') {
            return;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            env[envKey] = value;
        }
        else {
            delete env[envKey];
        }
    });
    const customHeadersParts = [];
    if (config.authorization && config.authorization.trim().length > 0) {
        customHeadersParts.push(`Authorization: ${config.authorization.trim()}`);
    }
    if (config.customHeaders && config.customHeaders.trim().length > 0) {
        customHeadersParts.push(config.customHeaders.trim());
    }
    if (customHeadersParts.length > 0) {
        env.ANTHROPIC_CUSTOM_HEADERS = customHeadersParts.join('\n');
    }
    else {
        delete env.ANTHROPIC_CUSTOM_HEADERS;
    }
    numericEnvMap.forEach(([configKey, envKey]) => {
        const value = config[configKey];
        if (typeof value === 'number') {
            env[envKey] = value.toString();
        }
    });
    booleanEnvKeys.forEach((envKey) => {
        const booleanValue = parseBooleanEnvValue(env[envKey]);
        if (booleanValue !== undefined) {
            env[envKey] = formatBooleanEnvValue(booleanValue);
        }
    });
    booleanEnvMap.forEach(([configKey, envKey]) => {
        const value = config[configKey];
        if (typeof value === 'boolean') {
            env[envKey] = formatBooleanEnvValue(value);
        }
    });
    env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0';
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = formatBooleanEnvValue(disableNonessentialTraffic);
    env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = formatBooleanEnvValue(disableExperimentalBetas);
}
async function loadSystemSettings() {
    try {
        return await ConfigManager.getInstance().getSettings();
    }
    catch {
        return undefined;
    }
}
function applySystemSettingsEnv(env, settings) {
    env.ENABLE_TOOL_SEARCH = formatBooleanEnvValue(settings?.enableToolSearch ?? false);
}
function formatBooleanEnvValue(value) {
    return value ? '1' : '0';
}
function parseBooleanEnvValue(value) {
    if (value === undefined) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (['1', 'true'].includes(normalized)) {
        return true;
    }
    if (['0', 'false'].includes(normalized)) {
        return false;
    }
    return undefined;
}
function applyCliOverrides(env, overrides) {
    if (overrides.env) {
        overrides.env.forEach((envVar) => {
            const [key, ...valueParts] = envVar.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=');
                env[key] = value;
            }
        });
    }
    if (overrides.proxy) {
        env.HTTPS_PROXY = overrides.proxy;
    }
    if (overrides.authToken) {
        env.ANTHROPIC_AUTH_TOKEN = overrides.authToken;
    }
    if (overrides.apiKey) {
        env.ANTHROPIC_API_KEY = overrides.apiKey;
    }
    if (overrides.baseUrl) {
        env.ANTHROPIC_BASE_URL = overrides.baseUrl;
    }
    if (overrides.model) {
        env.ANTHROPIC_MODEL = overrides.model;
    }
}
async function writeExtensionsConfig(config, isProxyMode = false, ui) {
    try {
        const logger = ui || new UILogger(false);
        const configManager = ConfigManager.getInstance();
        const configFile = await configManager.load();
        let library = configFile.settings.extensionsLibrary || {
            mcpServers: {},
            skills: {},
            subagents: {},
        };
        let defaultEnabled = configFile.settings.defaultEnabledExtensions || {
            mcpServers: [],
            skills: [],
            subagents: [],
        };
        const syncer = new ClaudeConfigSyncer(process.cwd(), logger);
        const syncResult = await syncer.syncClaudeConfig(library);
        if (syncResult.result.totalChanged > 0) {
            logger.verbose(`Synced ${syncResult.result.totalChanged} extension changes from Claude Code config:`);
            if (syncResult.result.mcpServersAdded > 0) {
                logger.verbose(`  - ${syncResult.result.mcpServersAdded} MCP servers added`);
            }
            if (syncResult.result.skillsAdded > 0) {
                logger.verbose(`  - ${syncResult.result.skillsAdded} skills added`);
            }
            if (syncResult.result.subagentsAdded > 0) {
                logger.verbose(`  - ${syncResult.result.subagentsAdded} subagents added`);
            }
            if (syncResult.result.mcpServersUpdated > 0) {
                logger.verbose(`  - ${syncResult.result.mcpServersUpdated} MCP servers updated`);
            }
            if (syncResult.result.skillsUpdated > 0) {
                logger.verbose(`  - ${syncResult.result.skillsUpdated} skills updated`);
            }
            if (syncResult.result.subagentsUpdated > 0) {
                logger.verbose(`  - ${syncResult.result.subagentsUpdated} subagents updated`);
            }
            library = syncResult.library;
            defaultEnabled = {
                mcpServers: [...new Set([...defaultEnabled.mcpServers, ...syncResult.defaultEnabled.mcpServers])],
                skills: [...new Set([...defaultEnabled.skills, ...syncResult.defaultEnabled.skills])],
                subagents: [...new Set([...defaultEnabled.subagents, ...syncResult.defaultEnabled.subagents])],
            };
            configFile.settings.extensionsLibrary = library;
            configFile.settings.defaultEnabledExtensions = defaultEnabled;
            await configManager.save(configFile);
        }
        const writer = new ExtensionsWriter(process.cwd(), logger);
        await writer.writeExtensions(config, library, configFile.settings, isProxyMode);
    }
    catch (error) {
        throw new Error(`Failed to write extensions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
async function startConfigWatcher(config) {
    try {
        const ui = new UILogger(false);
        const configManager = ConfigManager.getInstance();
        const configFile = await configManager.load();
        const library = configFile.settings.extensionsLibrary || {
            mcpServers: {},
            skills: {},
            subagents: {},
        };
        configWatcher = new ClaudeConfigWatcher(process.cwd(), ui, { debounceMs: 1000 });
        configWatcher.start(library, async (updatedLibrary) => {
            configFile.settings.extensionsLibrary = updatedLibrary;
            await configManager.save(configFile);
            const writer = new ExtensionsWriter(process.cwd(), ui);
            await writer.writeExtensions(config, updatedLibrary, configFile.settings, false);
            ui.verbose('Extensions config updated from file changes');
        });
    }
    catch (error) {
        const ui = new UILogger();
        ui.warning(`Failed to start config watcher: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
