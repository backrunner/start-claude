import type { ClaudeConfig } from '../../config/types'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

export interface ClaudeProviderSettingsSyncResult {
  settingsPath: string
  env: Record<string, string>
  backupPath?: string
  removedEnvKeys: string[]
}

interface ClaudeProviderSettingsSyncOptions {
  settingsPath?: string
  statePath?: string
}

interface ClaudeSettingsEnvCleanupOptions {
  settingsPath?: string
  envKeys: Iterable<string>
}

export interface ClaudeSettingsEnvCleanupResult {
  settingsPath: string
  backupPath?: string
  removedEnvKeys: string[]
}

interface ClaudeCodeSettings {
  env?: Record<string, unknown>
  [key: string]: unknown
}

interface ClaudeProviderSettingsState {
  version: 1
  settings: Record<string, { envKeys: string[] }>
}

const providerSettingsStateVersion = 1

const basicEnvMap: Array<[keyof ClaudeConfig, string]> = [
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
]

const numericEnvMap: Array<[keyof ClaudeConfig, string]> = [
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
]

const booleanEnvMap: Array<[keyof ClaudeConfig, string]> = [
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
]

const defaultedBooleanEnvKeys = [
  'CLAUDE_CODE_ATTRIBUTION_HEADER',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
]

const additionalBooleanEnvKeys = [
  'DISABLE_PROMPT_CACHING',
  'DISABLE_PROMPT_CACHING_FABLE',
  'DISABLE_PROMPT_CACHING_HAIKU',
  'DISABLE_PROMPT_CACHING_OPUS',
  'DISABLE_PROMPT_CACHING_SONNET',
]

const booleanEnvKeys = new Set([
  ...booleanEnvMap.map(([, envKey]) => envKey),
  ...defaultedBooleanEnvKeys,
  ...additionalBooleanEnvKeys,
])

const additionalManagedEnvKeys = [
  'ANTHROPIC_REASONING_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_DESCRIPTION',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  'DISABLE_PROMPT_CACHING',
  'DISABLE_PROMPT_CACHING_FABLE',
  'DISABLE_PROMPT_CACHING_HAIKU',
  'DISABLE_PROMPT_CACHING_OPUS',
  'DISABLE_PROMPT_CACHING_SONNET',
]

const officialProfileProviderEnvKeys = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_CUSTOM_HEADERS',
]

const proxyClientProviderEnvKeys = new Set(officialProfileProviderEnvKeys)

export const MANAGED_CLAUDE_PROVIDER_ENV_KEYS = new Set([
  ...basicEnvMap.map(([, envKey]) => envKey),
  ...numericEnvMap.map(([, envKey]) => envKey),
  ...booleanEnvMap.map(([, envKey]) => envKey),
  ...defaultedBooleanEnvKeys,
  ...additionalManagedEnvKeys,
])

export function getClaudeCodeSettingsPath(
  homeDir = homedir(),
  configDir = process.env.CLAUDE_CONFIG_DIR,
): string {
  return join(resolveClaudeConfigDir(configDir, homeDir), 'settings.json')
}

export function getClaudeProviderSettingsStatePath(homeDir = homedir()): string {
  return join(homeDir, '.start-claude', 'claude-provider-settings-state.json')
}

export function buildClaudeProviderEnv(config: ClaudeConfig): Record<string, string> {
  const env: Record<string, string> = {}
  const disableNonessentialTraffic = config.claudeCodeDisableNonessentialTraffic
    ?? config.disableNonessentialTraffic
    ?? parseBooleanEnvValue(config.env?.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)
    ?? true
  const disableExperimentalBetas = config.claudeCodeDisableExperimentalBetas
    ?? parseBooleanEnvValue(config.env?.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)
    ?? true

  if (config.env) {
    Object.entries(config.env).forEach(([key, value]) => {
      if (MANAGED_CLAUDE_PROVIDER_ENV_KEYS.has(key) && value.trim().length > 0) {
        const normalizedValue = normalizeManagedEnvValue(key, value)
        if (normalizedValue !== undefined) {
          env[key] = normalizedValue
        }
      }
    })
  }

  basicEnvMap.forEach(([configKey, envKey]) => {
    if (configKey === 'customHeaders') {
      return
    }

    if (config.profileType === 'official' && officialProfileProviderEnvKeys.includes(envKey)) {
      delete env[envKey]
      return
    }

    const value = config[configKey]
    if (typeof value === 'string' && value.trim().length > 0) {
      env[envKey] = value
    }
  })

  if (config.profileType !== 'official') {
    const customHeadersParts: string[] = []

    if (config.authorization?.trim()) {
      customHeadersParts.push(`Authorization: ${config.authorization.trim()}`)
    }

    if (config.customHeaders?.trim()) {
      customHeadersParts.push(config.customHeaders.trim())
    }

    if (customHeadersParts.length > 0) {
      env.ANTHROPIC_CUSTOM_HEADERS = customHeadersParts.join('\n')
    }
  }
  else {
    officialProfileProviderEnvKeys.forEach(key => delete env[key])
  }

  numericEnvMap.forEach(([configKey, envKey]) => {
    const value = config[configKey]
    if (typeof value === 'number') {
      env[envKey] = value.toString()
    }
  })

  booleanEnvMap.forEach(([configKey, envKey]) => {
    const value = config[configKey]
    if (typeof value === 'boolean') {
      env[envKey] = formatBooleanEnvValue(value)
    }
  })

  env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0'
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = formatBooleanEnvValue(disableNonessentialTraffic)
  env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = formatBooleanEnvValue(disableExperimentalBetas)

  return env
}

function normalizeManagedEnvValue(key: string, value: string): string | undefined {
  if (!booleanEnvKeys.has(key)) {
    return value
  }

  const booleanValue = parseBooleanEnvValue(value)
  return booleanValue === undefined ? undefined : formatBooleanEnvValue(booleanValue)
}

function formatBooleanEnvValue(value: boolean): '1' | '0' {
  return value ? '1' : '0'
}

function parseBooleanEnvValue(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true'].includes(normalized)) {
    return true
  }
  if (['0', 'false'].includes(normalized)) {
    return false
  }

  return undefined
}

export function buildProxyClaudeProviderConfig(
  config: ClaudeConfig,
  options: { port?: number, authToken?: string } = {},
): ClaudeConfig {
  const env = sanitizeProxyClientEnv(config.env)

  return {
    ...config,
    profileType: 'default',
    env,
    baseUrl: `http://localhost:${options.port ?? 2333}`,
    apiKey: undefined,
    authToken: options.authToken ?? 'sk-claude-proxy-server',
    authorization: undefined,
    customHeaders: undefined,
  }
}

export async function syncClaudeProviderSettings(
  config: ClaudeConfig,
  options: ClaudeProviderSettingsSyncOptions = {},
): Promise<ClaudeProviderSettingsSyncResult> {
  const settingsPath = options.settingsPath || getClaudeCodeSettingsPath(
    homedir(),
    getClaudeConfigDir(config),
  )
  const statePath = options.statePath || getClaudeProviderSettingsStatePath()
  const settings = loadClaudeCodeSettings(settingsPath)
  const state = loadClaudeProviderSettingsState(statePath)
  const stateSettingsKey = resolve(settingsPath)
  const providerEnv = buildClaudeProviderEnv(config)
  const hasInvalidEnv = settings.env !== undefined && !isRecord(settings.env)
  const currentEnv = isRecord(settings.env) ? { ...settings.env } : {}
  const removedEnvKeys = findConflictingEnvKeys(
    currentEnv,
    providerEnv,
    MANAGED_CLAUDE_PROVIDER_ENV_KEYS,
  )
  const backupPath = existsSync(settingsPath) && (hasInvalidEnv || removedEnvKeys.length > 0)
    ? backupClaudeCodeSettings(settingsPath)
    : undefined

  removedEnvKeys.forEach(key => delete currentEnv[key])

  state.settings[stateSettingsKey]?.envKeys.forEach((key) => {
    if (!(key in providerEnv)) {
      delete currentEnv[key]
    }
  })

  settings.env = {
    ...currentEnv,
    ...providerEnv,
  }

  writeClaudeCodeSettings(settingsPath, settings)
  updateClaudeProviderSettingsState(statePath, state, stateSettingsKey, Object.keys(providerEnv))

  return {
    settingsPath,
    env: providerEnv,
    backupPath,
    removedEnvKeys,
  }
}

export function cleanClaudeSettingsEnvConflicts(
  startupEnv: NodeJS.ProcessEnv,
  options: ClaudeSettingsEnvCleanupOptions,
): ClaudeSettingsEnvCleanupResult {
  const settingsPath = options.settingsPath || getClaudeCodeSettingsPath(
    homedir(),
    startupEnv.CLAUDE_CONFIG_DIR,
  )

  if (!existsSync(settingsPath)) {
    return { settingsPath, removedEnvKeys: [] }
  }

  const settings = loadClaudeCodeSettings(settingsPath)
  if (settings.env === undefined) {
    return { settingsPath, removedEnvKeys: [] }
  }
  if (!isRecord(settings.env)) {
    throw new Error(`Claude Code settings env must be a JSON object: ${settingsPath}`)
  }

  const currentEnv = { ...settings.env }
  const removedEnvKeys = findConflictingEnvKeys(currentEnv, startupEnv, options.envKeys)
  if (removedEnvKeys.length === 0) {
    return { settingsPath, removedEnvKeys }
  }

  const backupPath = backupClaudeCodeSettings(settingsPath)
  removedEnvKeys.forEach(key => delete currentEnv[key])

  if (Object.keys(currentEnv).length > 0) {
    settings.env = currentEnv
  }
  else {
    delete settings.env
  }

  writeClaudeCodeSettings(settingsPath, settings)

  return {
    settingsPath,
    backupPath,
    removedEnvKeys,
  }
}

function findConflictingEnvKeys(
  currentEnv: Record<string, unknown>,
  expectedEnv: Readonly<Record<string, string | undefined>>,
  controlledEnvKeys: Iterable<string>,
): string[] {
  const controlledKeys = new Set(controlledEnvKeys)

  return Object.keys(currentEnv)
    .filter(key => controlledKeys.has(key) && currentEnv[key] !== expectedEnv[key])
    .sort()
}

function backupClaudeCodeSettings(settingsPath: string): string {
  const backupPath = `${settingsPath}.backup.${Date.now()}.${randomUUID()}`
  copyFileSync(settingsPath, backupPath)
  return backupPath
}

function loadClaudeCodeSettings(settingsPath: string): ClaudeCodeSettings {
  if (!existsSync(settingsPath)) {
    return {}
  }

  const content = readFileSync(settingsPath, 'utf-8')
  const parsed: unknown = JSON.parse(content)

  if (!isRecord(parsed)) {
    throw new Error(`Claude Code settings must be a JSON object: ${settingsPath}`)
  }

  return parsed
}

function writeClaudeCodeSettings(settingsPath: string, settings: ClaudeCodeSettings): void {
  const settingsDir = dirname(settingsPath)
  mkdirSync(settingsDir, { recursive: true })

  const tempPath = join(settingsDir, `${basename(settingsPath)}.tmp.${randomUUID()}`)

  try {
    writeFileSync(tempPath, `${JSON.stringify(settings, null, 2)}\n`)
    renameSync(tempPath, settingsPath)
  }
  catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
}

function loadClaudeProviderSettingsState(statePath: string): ClaudeProviderSettingsState {
  if (!existsSync(statePath)) {
    return createEmptyProviderSettingsState()
  }

  let parsed: unknown
  try {
    const content = readFileSync(statePath, 'utf-8')
    parsed = JSON.parse(content)
  }
  catch {
    return createEmptyProviderSettingsState()
  }

  if (!isRecord(parsed) || !isRecord(parsed.settings)) {
    return createEmptyProviderSettingsState()
  }

  const settings: ClaudeProviderSettingsState['settings'] = {}

  Object.entries(parsed.settings).forEach(([settingsPath, value]) => {
    if (!isRecord(value) || !Array.isArray(value.envKeys)) {
      return
    }

    const envKeys = value.envKeys.filter((key): key is string => typeof key === 'string')
    settings[settingsPath] = { envKeys }
  })

  return {
    version: providerSettingsStateVersion,
    settings,
  }
}

function updateClaudeProviderSettingsState(
  statePath: string,
  state: ClaudeProviderSettingsState,
  settingsPath: string,
  envKeys: string[],
): void {
  if (envKeys.length > 0) {
    state.settings[settingsPath] = {
      envKeys: [...new Set(envKeys)].sort(),
    }
  }
  else {
    delete state.settings[settingsPath]
  }

  writeClaudeProviderSettingsState(statePath, state)
}

function writeClaudeProviderSettingsState(
  statePath: string,
  state: ClaudeProviderSettingsState,
): void {
  const stateDir = dirname(statePath)
  mkdirSync(stateDir, { recursive: true })

  const tempPath = join(stateDir, `${basename(statePath)}.tmp.${randomUUID()}`)

  try {
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`)
    renameSync(tempPath, statePath)
  }
  catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
}

function createEmptyProviderSettingsState(): ClaudeProviderSettingsState {
  return {
    version: providerSettingsStateVersion,
    settings: {},
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getClaudeConfigDir(config: ClaudeConfig): string | undefined {
  const configDir = config.env?.CLAUDE_CONFIG_DIR
  return typeof configDir === 'string' && configDir.trim().length > 0
    ? configDir
    : process.env.CLAUDE_CONFIG_DIR
}

function resolveClaudeConfigDir(configDir: string | undefined, homeDir: string): string {
  const trimmedConfigDir = configDir?.trim()

  if (!trimmedConfigDir) {
    return join(homeDir, '.claude')
  }

  if (trimmedConfigDir === '~') {
    return homeDir
  }

  if (trimmedConfigDir.startsWith('~/') || trimmedConfigDir.startsWith('~\\')) {
    return join(homeDir, trimmedConfigDir.slice(2))
  }

  return isAbsolute(trimmedConfigDir) ? trimmedConfigDir : resolve(trimmedConfigDir)
}

function sanitizeProxyClientEnv(env: ClaudeConfig['env']): ClaudeConfig['env'] {
  if (!env) {
    return undefined
  }

  const sanitizedEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => !proxyClientProviderEnvKeys.has(key)),
  )

  return Object.keys(sanitizedEnv).length > 0 ? sanitizedEnv : undefined
}
