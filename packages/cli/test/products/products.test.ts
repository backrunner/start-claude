import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExternalProductConfigManager } from '../../src/products/config-manager'
import { resolveProductInvocationArgs, shouldHandleStartupDirectly } from '../../src/products/cli'
import { prepareNativeConfig } from '../../src/products/native-config'
import { getProductDefinition } from '../../src/products/registry'

describe('external products', () => {
  const originalHome = process.env.HOME
  const originalCodexHome = process.env.CODEX_HOME
  let homeDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'start-products-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME
  })

  afterEach(() => {
    process.env.HOME = originalHome
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME
    }
    else {
      process.env.CODEX_HOME = originalCodexHome
    }
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('writes Codex profile TOML and API key env', () => {
    const definition = getProductDefinition('codex')
    const manager = ExternalProductConfigManager.getInstance('codex')
    manager.addConfig({
      name: 'Work Codex',
      authMode: 'api-key',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.5',
      isDefault: true,
    })

    const config = manager.getDefaultConfig()
    expect(config?.name).toBe('Work Codex')

    const env: NodeJS.ProcessEnv = {}
    const native = prepareNativeConfig(definition, config!, env)
    expect(native.args).toEqual(['--profile', 'start_work_codex'])
    expect(env.OPENAI_API_KEY).toBe('sk-test')

    const profile = readFileSync(join(homeDir, '.codex', 'start_work_codex.config.toml'), 'utf-8')
    expect(profile).toContain('model = "gpt-5.5"')
    expect(profile).toContain('model_provider = "start_work_codex_provider"')
    expect(profile).toContain('base_url = "https://api.openai.com/v1"')
  })

  it('writes Codex profile TOML under CODEX_HOME when configured', () => {
    const definition = getProductDefinition('codex')
    const codexHome = join(homeDir, 'isolated-codex-home')
    const env: NodeJS.ProcessEnv = {
      CODEX_HOME: codexHome,
    }

    const native = prepareNativeConfig(definition, {
      name: 'Isolated Codex',
      authMode: 'api-key',
      apiKey: 'sk-test',
      model: 'gpt-5.5',
    }, env)

    expect(native.args).toEqual(['--profile', 'start_isolated_codex'])
    const profile = readFileSync(join(codexHome, 'start_isolated_codex.config.toml'), 'utf-8')
    expect(profile).toContain('model = "gpt-5.5"')
  })

  it('keeps the default flag when updating a product config by name', () => {
    const manager = ExternalProductConfigManager.getInstance('codex')
    manager.addConfig({
      name: 'Default Codex',
      authMode: 'api-key',
      apiKey: 'sk-original',
      isDefault: true,
    })

    manager.addConfig({
      name: 'Default Codex',
      authMode: 'api-key',
      apiKey: 'sk-updated',
      isDefault: true,
    })

    const config = manager.getDefaultConfig()
    expect(config?.name).toBe('Default Codex')
    expect(config?.apiKey).toBe('sk-updated')
  })

  it('writes Gemini settings and provider env', () => {
    const definition = getProductDefinition('gemini')
    const env: NodeJS.ProcessEnv = {}

    prepareNativeConfig(definition, {
      name: 'Gemini Proxy',
      authMode: 'api-key',
      apiKey: 'AIza-test',
      apiKeyEnvVar: 'GEMINI_API_KEY',
      baseUrl: 'https://gemini-proxy.example.com',
      model: 'gemini-3-flash-preview',
    }, env)

    expect(env.GEMINI_API_KEY).toBe('AIza-test')
    expect(env.GEMINI_MODEL).toBe('gemini-3-flash-preview')
    expect(env.GOOGLE_GEMINI_BASE_URL).toBe('https://gemini-proxy.example.com')

    const settings = JSON.parse(readFileSync(join(homeDir, '.gemini', 'settings.json'), 'utf-8'))
    expect(settings.model.name).toBe('gemini-3-flash-preview')
  })

  it('maps Gemini custom API key env vars to GEMINI_API_KEY for the native CLI', () => {
    const definition = getProductDefinition('gemini')
    const env: NodeJS.ProcessEnv = {
      WORK_GEMINI_KEY: 'AIza-from-env',
      GOOGLE_API_KEY: 'AIza-old-google',
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_GEMINI_BASE_URL: 'https://old-gateway.example.com',
    }

    prepareNativeConfig(definition, {
      name: 'Gemini Custom Env',
      authMode: 'api-key',
      apiKeyEnvVar: 'WORK_GEMINI_KEY',
      baseUrl: '',
      model: 'gemini-3-flash-preview',
    }, env)

    expect(env.GEMINI_API_KEY).toBe('AIza-from-env')
    expect(env.WORK_GEMINI_KEY).toBe('AIza-from-env')
    expect(env.GOOGLE_API_KEY).toBeUndefined()
    expect(env.GOOGLE_GENAI_USE_VERTEXAI).toBeUndefined()
    expect(env.GOOGLE_GEMINI_BASE_URL).toBeUndefined()
  })

  it('cleans Gemini API env vars for account-login configs', () => {
    const definition = getProductDefinition('gemini')
    const env: NodeJS.ProcessEnv = {
      GEMINI_API_KEY: 'AIza-old',
      GOOGLE_API_KEY: 'AIza-old-google',
      GOOGLE_GEMINI_BASE_URL: 'https://old-gateway.example.com',
      GOOGLE_VERTEX_BASE_URL: 'https://old-vertex.example.com',
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_GENAI_USE_GCA: 'true',
    }

    prepareNativeConfig(definition, {
      name: 'Gemini Login',
      authMode: 'oauth',
      model: 'gemini-3-flash-preview',
    }, env)

    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.GOOGLE_API_KEY).toBeUndefined()
    expect(env.GOOGLE_GEMINI_BASE_URL).toBeUndefined()
    expect(env.GOOGLE_VERTEX_BASE_URL).toBeUndefined()
    expect(env.GOOGLE_GENAI_USE_VERTEXAI).toBeUndefined()
    expect(env.GOOGLE_GENAI_USE_GCA).toBeUndefined()
    expect(env.GEMINI_MODEL).toBe('gemini-3-flash-preview')
  })

  it('sets Vertex AI env vars for Gemini configs', () => {
    const definition = getProductDefinition('gemini')
    const env: NodeJS.ProcessEnv = {
      GEMINI_API_KEY: 'AIza-old',
      GOOGLE_API_KEY: 'AIza-old',
      GOOGLE_GENAI_USE_GCA: 'true',
      GOOGLE_GEMINI_BASE_URL: 'https://old-gateway.example.com',
    }

    prepareNativeConfig(definition, {
      name: 'Gemini Vertex',
      authMode: 'vertex-ai',
      baseUrl: 'https://vertex-proxy.example.com',
      model: 'gemini-3-flash-preview',
      googleCloudProject: 'my-project',
      googleCloudLocation: 'us-central1',
      googleApplicationCredentials: '/tmp/service-account.json',
    }, env)

    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.GOOGLE_API_KEY).toBeUndefined()
    expect(env.GOOGLE_GENAI_USE_GCA).toBeUndefined()
    expect(env.GOOGLE_GEMINI_BASE_URL).toBeUndefined()
    expect(env.GOOGLE_GENAI_USE_VERTEXAI).toBe('true')
    expect(env.GOOGLE_CLOUD_PROJECT).toBe('my-project')
    expect(env.GOOGLE_CLOUD_LOCATION).toBe('us-central1')
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe('/tmp/service-account.json')
    expect(env.GOOGLE_VERTEX_BASE_URL).toBe('https://vertex-proxy.example.com')
  })

  it('passes native product commands through instead of treating them as Start configs', () => {
    const invocation = resolveProductInvocationArgs(
      ['exec', '--config', 'model="gpt-5.5"', 'hello'],
      name => name === 'exec',
    )

    expect(shouldHandleStartupDirectly(['exec', 'hello'])).toBe(true)
    expect(invocation.configName).toBeUndefined()
    expect(invocation.passThroughArgs).toEqual(['exec', '--config', 'model="gpt-5.5"', 'hello'])
  })

  it('keeps Codex native --config key=value overrides in passthrough args', () => {
    const invocation = resolveProductInvocationArgs(
      ['--config', 'model="gpt-5.5"', 'exec', 'hello'],
      name => name === 'model',
    )

    expect(shouldHandleStartupDirectly(['--config', 'model="gpt-5.5"', 'exec'])).toBe(true)
    expect(invocation.configName).toBeUndefined()
    expect(invocation.passThroughArgs).toEqual(['--config', 'model="gpt-5.5"', 'exec', 'hello'])
  })

  it('recognizes current Codex and Gemini native commands', () => {
    expect(shouldHandleStartupDirectly(['archive'])).toBe(true)
    expect(shouldHandleStartupDirectly(['execpolicy'])).toBe(true)
    expect(shouldHandleStartupDirectly(['gemma'])).toBe(true)
    expect(shouldHandleStartupDirectly(['skills', 'list'])).toBe(true)
    expect(shouldHandleStartupDirectly(['hooks', 'list'])).toBe(true)

    const invocation = resolveProductInvocationArgs(
      ['skills', 'list'],
      name => name === 'skills',
    )

    expect(invocation.configName).toBeUndefined()
    expect(invocation.passThroughArgs).toEqual(['skills', 'list'])
  })

  it('uses product-specific native command names when resolving implicit configs', () => {
    const codexInvocation = resolveProductInvocationArgs(
      ['gemma'],
      name => name === 'gemma',
      'codex',
    )
    const geminiInvocation = resolveProductInvocationArgs(
      ['gemma'],
      name => name === 'gemma',
      'gemini',
    )

    expect(codexInvocation.configName).toBe('gemma')
    expect(codexInvocation.passThroughArgs).toEqual([])
    expect(geminiInvocation.configName).toBeUndefined()
    expect(geminiInvocation.passThroughArgs).toEqual(['gemma'])
  })

  it('supports explicit Start config selection without forwarding selector args', () => {
    const invocation = resolveProductInvocationArgs(
      ['--start-config', 'work', 'exec', '--model', 'gpt-5.5'],
      name => name === 'work',
    )

    expect(invocation.configName).toBe('work')
    expect(invocation.passThroughArgs).toEqual(['exec', '--model', 'gpt-5.5'])
  })

  it('expands short --model aliases in passthrough args', () => {
    const invocation = resolveProductInvocationArgs(
      ['--start-config', 'work', 'exec', '--model', 'gpt', '--model=opus'],
      name => name === 'work',
    )

    expect(invocation.configName).toBe('work')
    expect(invocation.passThroughArgs).toEqual([
      'exec',
      '--model',
      'gpt-5.6-sol',
      '--model=claude-opus-5',
    ])
  })

  it('keeps backward-compatible --config selection for saved Start configs', () => {
    const invocation = resolveProductInvocationArgs(
      ['--config', 'work', 'exec'],
      name => name === 'work',
    )

    expect(invocation.configName).toBe('work')
    expect(invocation.passThroughArgs).toEqual(['exec'])
  })
})
