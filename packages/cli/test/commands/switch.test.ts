import type { ClaudeConfig } from '../../src/config/types'
import type { MockInstance } from 'vitest'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getSettings: vi.fn(),
  syncClaudeProviderSettings: vi.fn(),
  buildProxyClaudeProviderConfig: vi.fn((config: ClaudeConfig, options: { port?: number, authToken?: string } = {}) => ({
    ...config,
    profileType: 'default',
    baseUrl: `http://localhost:${options.port ?? 2333}`,
    apiKey: undefined,
    authToken: options.authToken ?? 'sk-claude-proxy-server',
    authorization: undefined,
    customHeaders: undefined,
  })),
  getProxyStatus: vi.fn(),
  sendProxySwitchRequest: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  verbose: vi.fn(),
}))

vi.mock('../../src/config/manager', () => ({
  ConfigManager: {
    getInstance: () => ({
      getConfig: mocks.getConfig,
      getSettings: mocks.getSettings,
    }),
  },
}))

vi.mock('../../src/utils/claude/provider-settings', () => ({
  buildProxyClaudeProviderConfig: mocks.buildProxyClaudeProviderConfig,
  syncClaudeProviderSettings: mocks.syncClaudeProviderSettings,
}))

vi.mock('../../src/utils/network/proxy-control', () => ({
  getProxyStatus: mocks.getProxyStatus,
  sendProxySwitchRequest: mocks.sendProxySwitchRequest,
}))

vi.mock('../../src/utils/cli/ui', () => ({
  UILogger: vi.fn().mockImplementation(() => ({
    displayError: mocks.error,
    displayInfo: mocks.info,
    displaySuccess: mocks.success,
    displayWarning: mocks.warning,
    displayGrey: vi.fn(),
    displayVerbose: mocks.verbose,
    error: mocks.error,
    info: mocks.info,
    success: mocks.success,
    warning: mocks.warning,
    verbose: mocks.verbose,
  })),
}))

describe('switch command', () => {
  let exitSpy: MockInstance

  beforeEach(() => {
    mocks.getConfig.mockReset()
    mocks.getSettings.mockReset().mockResolvedValue({
      overrideClaudeCommand: false,
      syncClaudeProviderSettings: true,
    })
    mocks.syncClaudeProviderSettings.mockReset()
    mocks.buildProxyClaudeProviderConfig.mockClear()
    mocks.getProxyStatus.mockReset()
    mocks.sendProxySwitchRequest.mockReset()
    mocks.error.mockReset()
    mocks.info.mockReset()
    mocks.success.mockReset()
    mocks.warning.mockReset()
    mocks.verbose.mockReset()

    mocks.getProxyStatus.mockRejectedValue(new Error('connect ECONNREFUSED'))

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`)
    }) as never)
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  it('writes Claude Code provider settings for the selected config when enabled', async () => {
    const config: ClaudeConfig = {
      name: 'prod',
      baseUrl: 'https://api.example.com',
      authToken: 'sk-prod',
    }
    mocks.getConfig.mockResolvedValue(config)
    mocks.syncClaudeProviderSettings.mockResolvedValue({
      settingsPath: '/home/user/.claude/settings.json',
      env: {},
    })

    const { handleSwitchCommand } = await import('../../src/commands/switch')
    await handleSwitchCommand('prod')

    expect(mocks.getConfig).toHaveBeenCalledWith('prod')
    expect(mocks.syncClaudeProviderSettings).toHaveBeenCalledWith(config)
    expect(mocks.getProxyStatus).toHaveBeenCalledWith(2333)
    expect(mocks.sendProxySwitchRequest).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenCalledWith('Claude Code provider settings switched to "prod"')
    expect(mocks.info).toHaveBeenCalledWith('Updated: /home/user/.claude/settings.json')
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('does not write Claude Code provider settings when disabled', async () => {
    const config: ClaudeConfig = {
      name: 'prod',
      baseUrl: 'https://api.example.com',
      authToken: 'sk-prod',
    }
    mocks.getConfig.mockResolvedValue(config)
    mocks.getSettings.mockResolvedValue({
      overrideClaudeCommand: false,
      syncClaudeProviderSettings: false,
    })

    const { handleSwitchCommand } = await import('../../src/commands/switch')
    await handleSwitchCommand('prod')

    expect(mocks.syncClaudeProviderSettings).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith('Claude Code provider settings file was not updated because sync is disabled in system settings')
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('switches a running transformer proxy to the selected transformer config', async () => {
    const config: ClaudeConfig = {
      name: 'openai-transformer',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-openai',
      model: 'gpt-4.1',
      transformerEnabled: true,
      transformer: 'openai',
    }
    mocks.getConfig.mockResolvedValue(config)
    mocks.syncClaudeProviderSettings.mockResolvedValue({
      settingsPath: '/home/user/.claude/settings.json',
      env: {},
    })
    mocks.getProxyStatus.mockResolvedValue({
      total: 1,
      healthy: 1,
      unhealthy: 0,
      loadBalance: false,
      transform: true,
    })
    mocks.sendProxySwitchRequest.mockResolvedValue({
      success: true,
      message: 'Successfully switched to 1 new configurations (1 healthy)',
      healthyEndpoints: 1,
      totalEndpoints: 1,
    })

    const { handleSwitchCommand } = await import('../../src/commands/switch')
    await handleSwitchCommand('openai-transformer', { port: '2444' })

    expect(mocks.getProxyStatus).toHaveBeenCalledWith(2444)
    expect(mocks.syncClaudeProviderSettings).toHaveBeenCalledWith(expect.objectContaining({
      name: 'openai-transformer',
      baseUrl: 'http://localhost:2444',
      authToken: 'sk-claude-proxy-server',
      apiKey: undefined,
      authorization: undefined,
      customHeaders: undefined,
    }))
    expect(mocks.sendProxySwitchRequest).toHaveBeenCalledWith(2444, [config])
    expect(mocks.success).toHaveBeenCalledWith('Running transformer proxy switched to "openai-transformer"')
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('does not switch a running transformer proxy to a non-transformer config', async () => {
    const config: ClaudeConfig = {
      name: 'prod',
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-prod',
    }
    mocks.getConfig.mockResolvedValue(config)
    mocks.syncClaudeProviderSettings.mockResolvedValue({
      settingsPath: '/home/user/.claude/settings.json',
      env: {},
    })
    mocks.getProxyStatus.mockResolvedValue({
      total: 1,
      healthy: 1,
      unhealthy: 0,
      loadBalance: false,
      transform: true,
    })

    const { handleSwitchCommand } = await import('../../src/commands/switch')
    await handleSwitchCommand('prod')

    expect(mocks.sendProxySwitchRequest).not.toHaveBeenCalled()
    expect(mocks.syncClaudeProviderSettings).toHaveBeenCalledWith(config)
    expect(mocks.warning).toHaveBeenCalledWith('Running transformer proxy was not switched because "prod" is not transformer-enabled')
  })

  it('does not write provider settings when running transformer proxy switch fails', async () => {
    const config: ClaudeConfig = {
      name: 'openai-transformer',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-openai',
      model: 'gpt-4.1',
      transformerEnabled: true,
      transformer: 'openai',
    }
    mocks.getConfig.mockResolvedValue(config)
    mocks.getProxyStatus.mockResolvedValue({
      total: 1,
      healthy: 1,
      unhealthy: 0,
      loadBalance: false,
      transform: true,
    })
    mocks.sendProxySwitchRequest.mockResolvedValue({
      success: false,
      message: 'No healthy endpoints',
    })

    const { handleSwitchCommand } = await import('../../src/commands/switch')
    await expect(handleSwitchCommand('openai-transformer')).rejects.toThrow('process.exit(1)')

    expect(mocks.sendProxySwitchRequest).toHaveBeenCalledWith(2333, [config])
    expect(mocks.syncClaudeProviderSettings).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('Failed to switch Claude Code provider settings or running proxy: Running transformer proxy switch failed: No healthy endpoints')
  })

  it('exits nonzero when the config is missing', async () => {
    mocks.getConfig.mockResolvedValue(undefined)

    const { handleSwitchCommand } = await import('../../src/commands/switch')
    await expect(handleSwitchCommand('missing')).rejects.toThrow('process.exit(1)')

    expect(mocks.error).toHaveBeenCalledWith('Configuration "missing" not found')
    expect(mocks.syncClaudeProviderSettings).not.toHaveBeenCalled()
    expect(mocks.getProxyStatus).not.toHaveBeenCalled()
  })
})
