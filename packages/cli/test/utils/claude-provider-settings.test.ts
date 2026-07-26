import type { ClaudeConfig } from '../../src/config/types'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildClaudeProviderEnv,
  buildProxyClaudeProviderConfig,
  cleanClaudeSettingsEnvConflicts,
  getClaudeCodeSettingsPath,
  syncClaudeProviderSettings,
} from '../../src/utils/claude/provider-settings'

describe('claude provider settings sync', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    tempDirs.splice(0).forEach((dir) => {
      rmSync(dir, { recursive: true, force: true })
    })
  })

  function createTempSettingsPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'start-claude-provider-settings-'))
    tempDirs.push(dir)
    return join(dir, '.claude', 'settings.json')
  }

  function createTempStatePath(settingsPath: string): string {
    return join(dirname(dirname(settingsPath)), '.start-claude', 'claude-provider-settings-state.json')
  }

  function readJson(path: string): unknown {
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  function writeSettings(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
  }

  it('targets settings.json even when a legacy claude.json exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'start-claude-provider-settings-'))
    tempDirs.push(dir)
    const legacyPath = join(dir, '.claude', 'claude.json')

    writeSettings(legacyPath, {
      env: {
        ANTHROPIC_BASE_URL: 'https://legacy.example.com',
      },
    })

    expect(getClaudeCodeSettingsPath(dir, undefined)).toBe(join(dir, '.claude', 'settings.json'))
  })

  it('materializes known env values with config fields taking priority', () => {
    const config: ClaudeConfig = {
      name: 'api',
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-api',
      authToken: 'sk-auth',
      model: 'claude-sonnet-4-5-20250929',
      authorization: 'Bearer custom',
      customHeaders: 'X-Test: 1',
      maxOutputTokens: 4096,
      claudeCodeMaxRetries: 12,
      claudeCodeRetryWatchdog: true,
      disableTelemetry: true,
      env: {
        ANTHROPIC_BASE_URL: 'https://stale.example.com',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'provider-fable',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'provider-sonnet',
        ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION: 'Sonnet via custom provider',
        ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: 'thinking,interleaved_thinking',
        DISABLE_PROMPT_CACHING_SONNET: '1',
        UNRELATED_ENV: 'keep-out',
      },
    }

    expect(buildClaudeProviderEnv(config)).toEqual({
      ANTHROPIC_BASE_URL: 'https://api.example.com',
      ANTHROPIC_API_KEY: 'sk-api',
      ANTHROPIC_AUTH_TOKEN: 'sk-auth',
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'provider-fable',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'provider-sonnet',
      ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION: 'Sonnet via custom provider',
      ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: 'thinking,interleaved_thinking',
      ANTHROPIC_CUSTOM_HEADERS: 'Authorization: Bearer custom\nX-Test: 1',
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '4096',
      CLAUDE_CODE_MAX_RETRIES: '12',
      CLAUDE_CODE_RETRY_WATCHDOG: '1',
      DISABLE_PROMPT_CACHING_SONNET: '1',
      DISABLE_TELEMETRY: '1',
    })
  })

  it('normalizes Claude boolean env values to numeric flags', () => {
    const config: ClaudeConfig = {
      name: 'env-booleans',
      env: {
        CLAUDE_CODE_ATTRIBUTION_HEADER: 'true',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 'false',
        CLAUDE_CODE_USE_VERTEX: 'false',
        DISABLE_PROMPT_CACHING_SONNET: 'true',
        DISABLE_TELEMETRY: 'true',
      },
    }

    expect(buildClaudeProviderEnv(config)).toEqual({
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '0',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      CLAUDE_CODE_USE_VERTEX: '0',
      DISABLE_PROMPT_CACHING_SONNET: '1',
      DISABLE_TELEMETRY: '1',
    })
  })

  it('preserves unrelated settings while replacing managed env values', async () => {
    const settingsPath = createTempSettingsPath()
    const config: ClaudeConfig = {
      name: 'prod',
      baseUrl: 'https://api.prod.example.com',
      authToken: 'sk-prod',
      disableCostWarnings: false,
    }

    writeSettings(settingsPath, {
      hooks: { Stop: [] },
      statusLine: { type: 'command', command: 'statusline' },
      permissions: { allow: ['Bash'] },
      env: {
        ANTHROPIC_BASE_URL: 'https://old.example.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-old',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'old-model',
        PATH: '/usr/bin',
      },
    })

    const result = await syncClaudeProviderSettings(config, {
      settingsPath,
      statePath: createTempStatePath(settingsPath),
    })

    expect(result.removedEnvKeys).toEqual([
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
    ])
    expect(result.backupPath).toBeDefined()
    expect(readJson(result.backupPath!)).toEqual({
      hooks: { Stop: [] },
      statusLine: { type: 'command', command: 'statusline' },
      permissions: { allow: ['Bash'] },
      env: {
        ANTHROPIC_BASE_URL: 'https://old.example.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-old',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'old-model',
        PATH: '/usr/bin',
      },
    })

    expect(readJson(settingsPath)).toEqual({
      hooks: { Stop: [] },
      statusLine: { type: 'command', command: 'statusline' },
      permissions: { allow: ['Bash'] },
      env: {
        ANTHROPIC_BASE_URL: 'https://api.prod.example.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-prod',
        CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
        DISABLE_COST_WARNINGS: '0',
        PATH: '/usr/bin',
      },
    })
  })

  it('removes keys previously written by start-claude when the next profile omits them', async () => {
    const settingsPath = createTempSettingsPath()
    const statePath = createTempStatePath(settingsPath)

    await syncClaudeProviderSettings({
      name: 'first',
      baseUrl: 'https://first.example.com',
      authToken: 'sk-first',
      model: 'claude-sonnet-4-5-20250929',
    }, { settingsPath, statePath })

    await syncClaudeProviderSettings({
      name: 'second',
      baseUrl: 'https://second.example.com',
      authToken: 'sk-second',
    }, { settingsPath, statePath })

    expect(readJson(settingsPath)).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://second.example.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-second',
        CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      },
    })
  })

  it('creates a missing settings file', async () => {
    const settingsPath = createTempSettingsPath()

    const statePath = createTempStatePath(settingsPath)

    await syncClaudeProviderSettings({
      name: 'created',
      baseUrl: 'https://created.example.com',
      apiKey: 'sk-created',
    }, { settingsPath, statePath })

    expect(readJson(settingsPath)).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://created.example.com',
        ANTHROPIC_API_KEY: 'sk-created',
        CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      },
    })

    expect(readJson(statePath)).toEqual({
      version: 1,
      settings: {
        [settingsPath]: {
          envKeys: [
            'ANTHROPIC_API_KEY',
            'ANTHROPIC_BASE_URL',
            'CLAUDE_CODE_ATTRIBUTION_HEADER',
            'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
            'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
          ],
        },
      },
    })
  })

  it('backs up and removes launch env conflicts while preserving matching and unrelated values', () => {
    const settingsPath = createTempSettingsPath()

    writeSettings(settingsPath, {
      permissions: { allow: ['Bash'] },
      env: {
        ANTHROPIC_BASE_URL: 'https://old.example.com',
        ANTHROPIC_MODEL: 'claude-sonnet-5',
        PATH: '/usr/bin',
      },
    })

    const result = cleanClaudeSettingsEnvConflicts({
      ANTHROPIC_BASE_URL: 'https://current.example.com',
      ANTHROPIC_MODEL: 'claude-sonnet-5',
    }, {
      settingsPath,
      envKeys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL'],
    })

    expect(result.removedEnvKeys).toEqual(['ANTHROPIC_BASE_URL'])
    expect(result.backupPath).toBeDefined()
    expect(readJson(result.backupPath!)).toEqual({
      permissions: { allow: ['Bash'] },
      env: {
        ANTHROPIC_BASE_URL: 'https://old.example.com',
        ANTHROPIC_MODEL: 'claude-sonnet-5',
        PATH: '/usr/bin',
      },
    })
    expect(readJson(settingsPath)).toEqual({
      permissions: { allow: ['Bash'] },
      env: {
        ANTHROPIC_MODEL: 'claude-sonnet-5',
        PATH: '/usr/bin',
      },
    })
  })

  it('writes to CLAUDE_CONFIG_DIR from profile env', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'start-claude-provider-settings-'))
    tempDirs.push(dir)
    const configDir = join(dir, 'custom-claude')
    const settingsPath = join(configDir, 'settings.json')

    await syncClaudeProviderSettings({
      name: 'custom-dir',
      baseUrl: 'https://custom-dir.example.com',
      authToken: 'sk-custom-dir',
      env: {
        CLAUDE_CONFIG_DIR: configDir,
      },
    })

    expect(readJson(settingsPath)).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://custom-dir.example.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-custom-dir',
        CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      },
    })
  })

  it('builds proxy client provider config without leaking upstream credentials', () => {
    const proxyConfig = buildProxyClaudeProviderConfig({
      name: 'openai-transformer',
      profileType: 'official',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-openai',
      authToken: 'sk-upstream-auth',
      authorization: 'Bearer upstream',
      customHeaders: 'X-Upstream: 1',
      model: 'gpt-4.1',
      transformerEnabled: true,
      env: {
        ANTHROPIC_BASE_URL: 'https://stale.example.com',
        ANTHROPIC_API_KEY: 'sk-stale',
        ANTHROPIC_AUTH_TOKEN: 'sk-stale-auth',
        ANTHROPIC_CUSTOM_HEADERS: 'X-Stale: 1',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'provider-sonnet',
      },
    }, { port: 2444, authToken: 'sk-proxy' })

    expect(buildClaudeProviderEnv(proxyConfig)).toEqual({
      ANTHROPIC_BASE_URL: 'http://localhost:2444',
      ANTHROPIC_AUTH_TOKEN: 'sk-proxy',
      ANTHROPIC_MODEL: 'gpt-4.1',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'provider-sonnet',
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
    })
  })

  it('hard-codes attribution header off and materializes explicit traffic overrides', () => {
    const config: ClaudeConfig = {
      name: 'privacy',
      claudeCodeDisableNonessentialTraffic: false,
      claudeCodeDisableExperimentalBetas: false,
    }

    expect(buildClaudeProviderEnv(config)).toEqual({
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '0',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '0',
    })
  })

  it('clears provider credentials for official profiles', async () => {
    const settingsPath = createTempSettingsPath()

    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'https://old.example.com',
        ANTHROPIC_API_KEY: 'sk-old',
        ANTHROPIC_AUTH_TOKEN: 'sk-old-auth',
        ANTHROPIC_MODEL: 'old-model',
        PATH: '/usr/bin',
      },
    })

    const result = await syncClaudeProviderSettings({
      name: 'official',
      profileType: 'official',
      model: 'claude-sonnet-4-5-20250929',
    }, {
      settingsPath,
      statePath: createTempStatePath(settingsPath),
    })

    expect(readJson(settingsPath)).toEqual({
      env: {
        ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
        CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
        PATH: '/usr/bin',
      },
    })
    expect(result.removedEnvKeys).toEqual([
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_MODEL',
    ])
    expect(result.backupPath).toBeDefined()
  })

  it('rejects invalid existing JSON without overwriting it', async () => {
    const settingsPath = createTempSettingsPath()
    writeSettings(settingsPath, '{ invalid')

    await expect(syncClaudeProviderSettings({
      name: 'prod',
      baseUrl: 'https://api.prod.example.com',
      apiKey: 'sk-prod',
    }, { settingsPath })).rejects.toThrow()

    expect(readFileSync(settingsPath, 'utf-8')).toBe('{ invalid')
  })
})
