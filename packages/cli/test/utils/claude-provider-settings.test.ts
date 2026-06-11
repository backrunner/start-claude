import type { ClaudeConfig } from '../../src/config/types'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildClaudeProviderEnv,
  buildProxyClaudeProviderConfig,
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

  function readJson(path: string): unknown {
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  function writeSettings(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
  }

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
      disableTelemetry: true,
      env: {
        ANTHROPIC_BASE_URL: 'https://stale.example.com',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'provider-sonnet',
        UNRELATED_ENV: 'keep-out',
      },
    }

    expect(buildClaudeProviderEnv(config)).toEqual({
      ANTHROPIC_BASE_URL: 'https://api.example.com',
      ANTHROPIC_API_KEY: 'sk-api',
      ANTHROPIC_AUTH_TOKEN: 'sk-auth',
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'provider-sonnet',
      ANTHROPIC_CUSTOM_HEADERS: 'Authorization: Bearer custom\nX-Test: 1',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '4096',
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

    await syncClaudeProviderSettings(config, { settingsPath })

    expect(readJson(settingsPath)).toEqual({
      hooks: { Stop: [] },
      statusLine: { type: 'command', command: 'statusline' },
      permissions: { allow: ['Bash'] },
      env: {
        PATH: '/usr/bin',
        ANTHROPIC_BASE_URL: 'https://api.prod.example.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-prod',
        DISABLE_COST_WARNINGS: '0',
      },
    })
  })

  it('creates a missing settings file', async () => {
    const settingsPath = createTempSettingsPath()

    await syncClaudeProviderSettings({
      name: 'created',
      baseUrl: 'https://created.example.com',
      apiKey: 'sk-created',
    }, { settingsPath })

    expect(readJson(settingsPath)).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://created.example.com',
        ANTHROPIC_API_KEY: 'sk-created',
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

    await syncClaudeProviderSettings({
      name: 'official',
      profileType: 'official',
      model: 'claude-sonnet-4-5-20250929',
    }, { settingsPath })

    expect(readJson(settingsPath)).toEqual({
      env: {
        PATH: '/usr/bin',
        ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
      },
    })
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
