import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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
    ['maxThinkingTokens', 'MAX_THINKING_TOKENS'],
    ['mcpTimeout', 'MCP_TIMEOUT'],
    ['mcpToolTimeout', 'MCP_TOOL_TIMEOUT'],
    ['maxMcpOutputTokens', 'MAX_MCP_OUTPUT_TOKENS'],
];
const booleanEnvMap = [
    ['maintainProjectWorkingDir', 'CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR'],
    ['ideSkipAutoInstall', 'CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL'],
    ['claudeCodeDisableNonessentialTraffic', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'],
    ['useBedrock', 'CLAUDE_CODE_USE_BEDROCK'],
    ['useVertex', 'CLAUDE_CODE_USE_VERTEX'],
    ['skipBedrockAuth', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH'],
    ['skipVertexAuth', 'CLAUDE_CODE_SKIP_VERTEX_AUTH'],
    ['disableNonessentialTraffic', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'],
    ['disableTerminalTitle', 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE'],
    ['disableAutoupdater', 'DISABLE_AUTOUPDATER'],
    ['disableBugCommand', 'DISABLE_BUG_COMMAND'],
    ['disableCostWarnings', 'DISABLE_COST_WARNINGS'],
    ['disableErrorReporting', 'DISABLE_ERROR_REPORTING'],
    ['disableNonEssentialModelCalls', 'DISABLE_NON_ESSENTIAL_MODEL_CALLS'],
    ['disableTelemetry', 'DISABLE_TELEMETRY'],
];
const additionalManagedEnvKeys = [
    'ANTHROPIC_REASONING_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
];
const officialProfileProviderEnvKeys = [
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_CUSTOM_HEADERS',
];
const proxyClientProviderEnvKeys = new Set(officialProfileProviderEnvKeys);
export const MANAGED_CLAUDE_PROVIDER_ENV_KEYS = new Set([
    ...basicEnvMap.map(([, envKey]) => envKey),
    ...numericEnvMap.map(([, envKey]) => envKey),
    ...booleanEnvMap.map(([, envKey]) => envKey),
    ...additionalManagedEnvKeys,
]);
export function getClaudeCodeSettingsPath(homeDir = homedir()) {
    const settingsPath = join(homeDir, '.claude', 'settings.json');
    const legacyPath = join(homeDir, '.claude', 'claude.json');
    if (existsSync(settingsPath) || !existsSync(legacyPath)) {
        return settingsPath;
    }
    return legacyPath;
}
export function buildClaudeProviderEnv(config) {
    const env = {};
    if (config.env) {
        Object.entries(config.env).forEach(([key, value]) => {
            if (MANAGED_CLAUDE_PROVIDER_ENV_KEYS.has(key) && value.trim().length > 0) {
                env[key] = value;
            }
        });
    }
    basicEnvMap.forEach(([configKey, envKey]) => {
        if (configKey === 'customHeaders') {
            return;
        }
        if (config.profileType === 'official' && officialProfileProviderEnvKeys.includes(envKey)) {
            delete env[envKey];
            return;
        }
        const value = config[configKey];
        if (typeof value === 'string' && value.trim().length > 0) {
            env[envKey] = value;
        }
    });
    if (config.profileType !== 'official') {
        const customHeadersParts = [];
        if (config.authorization?.trim()) {
            customHeadersParts.push(`Authorization: ${config.authorization.trim()}`);
        }
        if (config.customHeaders?.trim()) {
            customHeadersParts.push(config.customHeaders.trim());
        }
        if (customHeadersParts.length > 0) {
            env.ANTHROPIC_CUSTOM_HEADERS = customHeadersParts.join('\n');
        }
    }
    else {
        officialProfileProviderEnvKeys.forEach(key => delete env[key]);
    }
    numericEnvMap.forEach(([configKey, envKey]) => {
        const value = config[configKey];
        if (typeof value === 'number') {
            env[envKey] = value.toString();
        }
    });
    booleanEnvMap.forEach(([configKey, envKey]) => {
        const value = config[configKey];
        if (typeof value === 'boolean') {
            env[envKey] = value ? '1' : '0';
        }
    });
    return env;
}
export function buildProxyClaudeProviderConfig(config, options = {}) {
    const env = sanitizeProxyClientEnv(config.env);
    return {
        ...config,
        profileType: 'default',
        env,
        baseUrl: `http://localhost:${options.port ?? 2333}`,
        apiKey: undefined,
        authToken: options.authToken ?? 'sk-claude-proxy-server',
        authorization: undefined,
        customHeaders: undefined,
    };
}
export async function syncClaudeProviderSettings(config, options = {}) {
    const settingsPath = options.settingsPath || getClaudeCodeSettingsPath();
    const settings = loadClaudeCodeSettings(settingsPath);
    const providerEnv = buildClaudeProviderEnv(config);
    const currentEnv = isRecord(settings.env) ? { ...settings.env } : {};
    MANAGED_CLAUDE_PROVIDER_ENV_KEYS.forEach((key) => {
        delete currentEnv[key];
    });
    settings.env = {
        ...currentEnv,
        ...providerEnv,
    };
    writeClaudeCodeSettings(settingsPath, settings);
    return {
        settingsPath,
        env: providerEnv,
    };
}
function loadClaudeCodeSettings(settingsPath) {
    if (!existsSync(settingsPath)) {
        return {};
    }
    const content = readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!isRecord(parsed)) {
        throw new Error(`Claude Code settings must be a JSON object: ${settingsPath}`);
    }
    return parsed;
}
function writeClaudeCodeSettings(settingsPath, settings) {
    const settingsDir = dirname(settingsPath);
    mkdirSync(settingsDir, { recursive: true });
    const tempPath = join(settingsDir, `${basename(settingsPath)}.tmp.${randomUUID()}`);
    try {
        writeFileSync(tempPath, `${JSON.stringify(settings, null, 2)}\n`);
        renameSync(tempPath, settingsPath);
    }
    catch (error) {
        rmSync(tempPath, { force: true });
        throw error;
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sanitizeProxyClientEnv(env) {
    if (!env) {
        return undefined;
    }
    const sanitizedEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !proxyClientProviderEnvKeys.has(key)));
    return Object.keys(sanitizedEnv).length > 0 ? sanitizedEnv : undefined;
}
