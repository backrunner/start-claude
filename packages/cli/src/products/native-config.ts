import type { ExternalProductConfig, ExternalProductDefinition } from './types'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface NativeConfigResult {
  args: string[]
  env: NodeJS.ProcessEnv
}

export function prepareNativeConfig(
  definition: ExternalProductDefinition,
  config: ExternalProductConfig,
  env: NodeJS.ProcessEnv,
): NativeConfigResult {
  applyConfigEnv(definition, config, env)

  if (definition.id === 'codex') {
    return writeCodexProfile(definition, config, env)
  }

  writeGeminiSettings(definition, config)
  return { args: [], env }
}

function applyConfigEnv(
  definition: ExternalProductDefinition,
  config: ExternalProductConfig,
  env: NodeJS.ProcessEnv,
): void {
  if (config.env) {
    Object.entries(config.env).forEach(([key, value]) => {
      if (value.trim()) {
        env[key] = value
      }
    })
  }

  if (config.authMode === 'vertex-ai') {
    delete env.GEMINI_API_KEY
    delete env.GOOGLE_API_KEY
    setEnvValue(env, 'GOOGLE_CLOUD_PROJECT', config.googleCloudProject)
    setEnvValue(env, 'GOOGLE_CLOUD_LOCATION', config.googleCloudLocation)
    setEnvValue(env, 'GOOGLE_APPLICATION_CREDENTIALS', config.googleApplicationCredentials)
    setEnvValue(env, 'GOOGLE_VERTEX_BASE_URL', config.baseUrl)
    return
  }

  if (config.apiKey?.trim()) {
    env[config.apiKeyEnvVar || definition.defaultApiKeyEnvVar] = config.apiKey
  }

  if (definition.id === 'gemini' && config.model?.trim()) {
    env.GEMINI_MODEL = config.model
  }
  if (definition.id === 'gemini' && config.baseUrl?.trim()) {
    env.GOOGLE_GEMINI_BASE_URL = config.baseUrl
  }
}

function writeCodexProfile(
  definition: ExternalProductDefinition,
  config: ExternalProductConfig,
  env: NodeJS.ProcessEnv,
): NativeConfigResult {
  const codexDir = ensureNativeDir(definition)
  const profileName = getNativeProfileName(config)
  const profilePath = join(codexDir, `${profileName}.config.toml`)
  writeFileSync(profilePath, codexProfileToToml(config, definition), 'utf-8')

  if (config.apiKey?.trim()) {
    env[config.apiKeyEnvVar || definition.defaultApiKeyEnvVar] = config.apiKey
  }

  return {
    args: ['--profile', profileName],
    env,
  }
}

function codexProfileToToml(
  config: ExternalProductConfig,
  definition: ExternalProductDefinition,
): string {
  const lines: string[] = []
  const model = config.model?.trim() || definition.defaultModel
  const apiKeyEnvVar = config.apiKeyEnvVar?.trim() || definition.defaultApiKeyEnvVar
  const usesApiKeyProvider = config.authMode !== 'oauth' && Boolean(config.apiKey?.trim() || config.baseUrl?.trim())

  lines.push(`model = ${tomlString(model)}`)

  if (usesApiKeyProvider) {
    const providerId = getProviderId(config)
    lines.push(`model_provider = ${tomlString(providerId)}`)
    lines.push('')
    lines.push(`[model_providers.${providerId}]`)
    lines.push(`name = ${tomlString(config.name)}`)
    lines.push(`base_url = ${tomlString(config.baseUrl?.trim() || 'https://api.openai.com/v1')}`)
    lines.push(`env_key = ${tomlString(apiKeyEnvVar)}`)
    lines.push(`wire_api = ${tomlString(config.wireApi || 'responses')}`)
  }
  else if (config.baseUrl?.trim()) {
    lines.push(`openai_base_url = ${tomlString(config.baseUrl.trim())}`)
  }

  if (config.approvalPolicy) {
    lines.push(`approval_policy = ${tomlString(config.approvalPolicy)}`)
  }
  if (config.sandboxMode) {
    lines.push(`sandbox_mode = ${tomlString(config.sandboxMode)}`)
  }
  if (config.sandboxMode === 'workspace-write') {
    lines.push('')
    lines.push('[sandbox_workspace_write]')
    lines.push('network_access = true')
  }

  return `${lines.join('\n')}\n`
}

function writeGeminiSettings(
  definition: ExternalProductDefinition,
  config: ExternalProductConfig,
): void {
  const geminiDir = ensureNativeDir(definition)
  const settingsPath = join(geminiDir, 'settings.json')
  const settings = readJsonObject(settingsPath)

  if (config.model?.trim()) {
    settings.model = {
      ...(isRecord(settings.model) ? settings.model : {}),
      name: config.model.trim(),
    }
  }

  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

function ensureNativeDir(definition: ExternalProductDefinition): string {
  const dir = join(homedir(), definition.nativeConfigDirName)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function readJsonObject(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) {
      return {}
    }

    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    return isRecord(parsed) ? parsed : {}
  }
  catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function setEnvValue(env: NodeJS.ProcessEnv, key: string, value: string | undefined): void {
  if (value?.trim()) {
    env[key] = value
  }
}

function getNativeProfileName(config: ExternalProductConfig): string {
  return `start_${sanitizeIdentifier(config.name)}`
}

function getProviderId(config: ExternalProductConfig): string {
  return `start_${sanitizeIdentifier(config.name)}_provider`
}

function sanitizeIdentifier(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || 'default'
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}
