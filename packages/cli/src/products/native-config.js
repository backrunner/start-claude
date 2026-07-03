import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
export function prepareNativeConfig(definition, config, env) {
    applyConfigEnv(definition, config, env);
    if (definition.id === 'codex') {
        return writeCodexProfile(definition, config, env);
    }
    writeGeminiSettings(definition, config);
    return { args: [], env };
}
function applyConfigEnv(definition, config, env) {
    if (config.env) {
        Object.entries(config.env).forEach(([key, value]) => {
            if (value.trim()) {
                env[key] = value;
            }
        });
    }
    if (definition.id === 'gemini') {
        applyGeminiAuthEnv(config, env);
        if (config.model?.trim()) {
            env.GEMINI_MODEL = config.model;
        }
        return;
    }
    if ((config.authMode || 'api-key') === 'api-key' && config.apiKey?.trim()) {
        env[config.apiKeyEnvVar || definition.defaultApiKeyEnvVar] = config.apiKey;
    }
}
function writeCodexProfile(definition, config, env) {
    const codexDir = ensureNativeDir(definition, env);
    const profileName = getNativeProfileName(config);
    const profilePath = join(codexDir, `${profileName}.config.toml`);
    writeFileSync(profilePath, codexProfileToToml(config, definition), 'utf-8');
    if ((config.authMode || 'api-key') === 'api-key' && config.apiKey?.trim()) {
        env[config.apiKeyEnvVar || definition.defaultApiKeyEnvVar] = config.apiKey;
    }
    return {
        args: ['--profile', profileName],
        env,
    };
}
function applyGeminiAuthEnv(config, env) {
    const authMode = config.authMode || 'api-key';
    const apiKeyEnvVar = config.apiKeyEnvVar || 'GEMINI_API_KEY';
    const apiKey = config.apiKey?.trim() || env[apiKeyEnvVar]?.trim();
    if (authMode === 'vertex-ai') {
        delete env.GEMINI_API_KEY;
        delete env.GOOGLE_API_KEY;
        delete env.GOOGLE_GENAI_USE_GCA;
        delete env.GOOGLE_GEMINI_BASE_URL;
        env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
        setEnvValue(env, 'GOOGLE_CLOUD_PROJECT', config.googleCloudProject);
        setEnvValue(env, 'GOOGLE_CLOUD_LOCATION', config.googleCloudLocation);
        setEnvValue(env, 'GOOGLE_APPLICATION_CREDENTIALS', config.googleApplicationCredentials);
        setEnvValue(env, 'GOOGLE_VERTEX_BASE_URL', config.baseUrl);
        return;
    }
    delete env.GOOGLE_GENAI_USE_VERTEXAI;
    delete env.GOOGLE_GENAI_USE_GCA;
    delete env.GOOGLE_VERTEX_BASE_URL;
    if (authMode === 'oauth') {
        delete env.GEMINI_API_KEY;
        delete env.GOOGLE_API_KEY;
        applyGeminiGatewayEnv(config, env);
        return;
    }
    if (apiKey) {
        env.GEMINI_API_KEY = apiKey;
    }
    else if (apiKeyEnvVar !== 'GEMINI_API_KEY') {
        delete env.GEMINI_API_KEY;
    }
    delete env.GOOGLE_API_KEY;
    applyGeminiGatewayEnv(config, env);
}
function applyGeminiGatewayEnv(config, env) {
    if (config.baseUrl?.trim()) {
        env.GOOGLE_GEMINI_BASE_URL = config.baseUrl;
    }
    else {
        delete env.GOOGLE_GEMINI_BASE_URL;
    }
}
function codexProfileToToml(config, definition) {
    const lines = [];
    const model = config.model?.trim() || definition.defaultModel;
    const apiKeyEnvVar = config.apiKeyEnvVar?.trim() || definition.defaultApiKeyEnvVar;
    const usesApiKeyProvider = config.authMode !== 'oauth' && Boolean(config.apiKey?.trim() || config.baseUrl?.trim());
    lines.push(`model = ${tomlString(model)}`);
    if (usesApiKeyProvider) {
        const providerId = getProviderId(config);
        lines.push(`model_provider = ${tomlString(providerId)}`);
        lines.push('');
        lines.push(`[model_providers.${providerId}]`);
        lines.push(`name = ${tomlString(config.name)}`);
        lines.push(`base_url = ${tomlString(config.baseUrl?.trim() || 'https://api.openai.com/v1')}`);
        lines.push(`env_key = ${tomlString(apiKeyEnvVar)}`);
        lines.push(`wire_api = ${tomlString(config.wireApi || 'responses')}`);
    }
    else if (config.baseUrl?.trim()) {
        lines.push(`openai_base_url = ${tomlString(config.baseUrl.trim())}`);
    }
    if (config.approvalPolicy) {
        lines.push(`approval_policy = ${tomlString(config.approvalPolicy)}`);
    }
    if (config.sandboxMode) {
        lines.push(`sandbox_mode = ${tomlString(config.sandboxMode)}`);
    }
    if (config.sandboxMode === 'workspace-write') {
        lines.push('');
        lines.push('[sandbox_workspace_write]');
        lines.push('network_access = true');
    }
    return `${lines.join('\n')}\n`;
}
function writeGeminiSettings(definition, config) {
    const geminiDir = ensureNativeDir(definition);
    const settingsPath = join(geminiDir, 'settings.json');
    const settings = readJsonObject(settingsPath);
    if (config.model?.trim()) {
        settings.model = {
            ...(isRecord(settings.model) ? settings.model : {}),
            name: config.model.trim(),
        };
    }
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
}
function ensureNativeDir(definition, env = process.env) {
    const dir = definition.id === 'codex' && env.CODEX_HOME?.trim()
        ? env.CODEX_HOME.trim()
        : join(homedir(), definition.nativeConfigDirName);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}
function readJsonObject(filePath) {
    try {
        if (!existsSync(filePath)) {
            return {};
        }
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
        return isRecord(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function setEnvValue(env, key, value) {
    if (value?.trim()) {
        env[key] = value;
    }
}
function getNativeProfileName(config) {
    return `start_${sanitizeIdentifier(config.name)}`;
}
function getProviderId(config) {
    return `start_${sanitizeIdentifier(config.name)}_provider`;
}
function sanitizeIdentifier(value) {
    const sanitized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return sanitized || 'default';
}
function tomlString(value) {
    return JSON.stringify(value);
}
