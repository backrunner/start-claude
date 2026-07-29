import type { ConfigManager } from '../../config/manager'
import type { McpServerConfig, McpSyncConfig } from '../../config/types'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import dayjs from 'dayjs'
import { UILogger } from '../cli/ui'

export interface ClaudeDesktopConfig {
  mcpServers?: Record<string, McpServerConfig>
}

export interface ClaudeCodeConfig {
  mcpServers?: Record<string, McpServerConfig>
  [key: string]: unknown
}

export class McpSyncManager {
  private static instance: McpSyncManager

  private readonly CLAUDE_DESKTOP_CONFIG_PATH_MACOS: string
  private readonly CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS: string
  private readonly CLAUDE_CODE_CONFIG_PATH: string
  private readonly CLAUDE_CODE_LEGACY_SETTINGS_PATH: string

  constructor(paths: {
    claudeDesktopConfigPathMacos?: string
    claudeDesktopConfigPathWindows?: string
    claudeCodeConfigPath?: string
    claudeCodeLegacySettingsPath?: string
  } = {}) {
    this.CLAUDE_DESKTOP_CONFIG_PATH_MACOS = paths.claudeDesktopConfigPathMacos
      ?? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    this.CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS = paths.claudeDesktopConfigPathWindows
      ?? join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
    this.CLAUDE_CODE_CONFIG_PATH = paths.claudeCodeConfigPath ?? join(homedir(), '.claude.json')
    this.CLAUDE_CODE_LEGACY_SETTINGS_PATH = paths.claudeCodeLegacySettingsPath
      ?? join(homedir(), '.claude', 'settings.json')
  }

  static getInstance(): McpSyncManager {
    if (!McpSyncManager.instance) {
      McpSyncManager.instance = new McpSyncManager()
    }
    return McpSyncManager.instance
  }

  private getClaudeDesktopConfigPath(): string | null {
    if (process.platform === 'darwin') {
      return existsSync(this.CLAUDE_DESKTOP_CONFIG_PATH_MACOS) ? this.CLAUDE_DESKTOP_CONFIG_PATH_MACOS : null
    }
    else if (process.platform === 'win32') {
      return existsSync(this.CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS) ? this.CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS : null
    }
    return null
  }

  private async getConfigManager(): Promise<ConfigManager> {
    const { ConfigManager } = await import('../../config/manager')
    return ConfigManager.getInstance()
  }

  /**
   * Extract MCP server configurations from Claude Desktop config
   */
  extractMcpFromClaudeDesktop(options: { verbose?: boolean } = {}): Record<string, McpServerConfig> | null {
    const logger = new UILogger(options.verbose)
    const configPath = this.getClaudeDesktopConfigPath()

    if (!configPath) {
      logger.displayVerbose('🔍 Claude Desktop config not found')
      return null
    }

    try {
      logger.displayVerbose(`📁 Reading Claude Desktop config: ${configPath}`)
      const configData = readFileSync(configPath, 'utf8')
      const config = JSON.parse(configData) as unknown
      const serverConfigs = getMcpServers(config)

      if (!serverConfigs || Object.keys(serverConfigs).length === 0) {
        logger.displayVerbose('📋 No MCP servers found in Claude Desktop config')
        return null
      }

      logger.displayVerbose(`✅ Found ${Object.keys(serverConfigs).length} MCP server(s) in Claude Desktop config`)

      return serverConfigs
    }
    catch (error) {
      logger.displayVerbose(`⚠️ Error reading Claude Desktop config: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  /**
   * Extract MCP server configurations from ~/.claude/settings.json
   */
  extractMcpFromClaudeCodeSettings(options: { verbose?: boolean } = {}): Record<string, McpServerConfig> | null {
    const logger = new UILogger(options.verbose)
    const configPaths = [
      this.CLAUDE_CODE_LEGACY_SETTINGS_PATH,
      this.CLAUDE_CODE_CONFIG_PATH,
    ].filter(existsSync)

    if (configPaths.length === 0) {
      logger.displayVerbose('📁 Claude Code MCP config not found')
      return null
    }

    try {
      const serverConfigs: Record<string, McpServerConfig> = {}
      for (const configPath of configPaths) {
        try {
          logger.displayVerbose(`📁 Reading Claude Code config: ${configPath}`)
          const configData = readFileSync(configPath, 'utf8')
          const config = JSON.parse(configData) as unknown
          Object.assign(serverConfigs, getMcpServers(config) ?? {})
        }
        catch (error) {
          logger.displayVerbose(`⚠️ Error reading Claude Code config ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      if (Object.keys(serverConfigs).length === 0) {
        logger.displayVerbose('📋 No MCP servers found in Claude Code config')
        return null
      }

      logger.displayVerbose(`✅ Found ${Object.keys(serverConfigs).length} MCP server(s) in ~/.claude/settings.json`)

      return serverConfigs
    }
    catch (error) {
      logger.displayVerbose(`⚠️ Error reading ~/.claude/settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  /**
   * Sync MCP settings from Claude Desktop to CLI tool config
   */
  async syncMcpSettings(options: { verbose?: boolean, force?: boolean } = {}): Promise<boolean> {
    const logger = new UILogger(options.verbose)
    const configManager = await this.getConfigManager()
    const settings = await configManager.getSettings()

    // Check if MCP sync is enabled
    if ((settings.mcpSync?.enabled ?? true) === false && !options.force) {
      logger.displayVerbose('🔄 MCP sync is disabled, skipping')
      return true
    }

    logger.displayVerbose('🔍 Starting MCP settings synchronization...')

    // Extract MCP servers from Claude Desktop
    const desktopServers = this.extractMcpFromClaudeDesktop(options)
    const codeServers = this.extractMcpFromClaudeCodeSettings(options)

    if (!desktopServers && !codeServers) {
      logger.displayVerbose('ℹ️ No MCP servers found to sync')
      return true
    }

    // Merge servers from both sources, with Claude Desktop taking priority
    const allServers: Record<string, McpServerConfig> = {
      ...(codeServers ?? {}),
      ...(desktopServers ?? {}),
    }

    // Update the configuration with synced MCP settings
    const mcpSyncConfig: McpSyncConfig = {
      enabled: settings.mcpSync?.enabled ?? true,
      servers: allServers,
      lastSyncTime: dayjs().toISOString(),
    }

    await configManager.updateSettings({
      mcpSync: mcpSyncConfig,
    })

    const serverCount = Object.keys(allServers).length
    logger.displayVerbose(`✅ MCP sync completed - ${serverCount} server(s) synchronized`)

    return true
  }

  /**
   * Check if MCP sync should occur and perform it
   */
  async checkAndSyncMcp(options: { verbose?: boolean } = {}): Promise<boolean> {
    const logger = new UILogger(options.verbose)
    const configManager = await this.getConfigManager()
    const settings = await configManager.getSettings()

    // Check if MCP sync is enabled (default to enabled if not specified)
    const mcpSyncEnabled = settings.mcpSync?.enabled ?? true

    if (!mcpSyncEnabled) {
      logger.displayVerbose('🔄 MCP sync is disabled')
      return true
    }

    try {
      return await this.syncMcpSettings(options)
    }
    catch (error) {
      logger.displayVerbose(`⚠️ MCP sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Get current MCP sync status
   */
  async getMcpSyncStatus(): Promise<{ enabled: boolean, serverCount: number, lastSync?: string }> {
    const configManager = await this.getConfigManager()
    const settings = await configManager.getSettings()
    const mcpSync = settings.mcpSync

    return {
      enabled: mcpSync?.enabled ?? true,
      serverCount: mcpSync?.servers ? Object.keys(mcpSync.servers).length : 0,
      lastSync: mcpSync?.lastSyncTime,
    }
  }

  /**
   * Enable/disable MCP sync
   */
  async setMcpSyncEnabled(enabled: boolean): Promise<void> {
    const configManager = await this.getConfigManager()
    const settings = await configManager.getSettings()

    await configManager.updateSettings({
      mcpSync: {
        ...settings.mcpSync,
        enabled,
        servers: settings.mcpSync?.servers ?? {},
      },
    })
  }
}

function getMcpServers(config: unknown): Record<string, McpServerConfig> | null {
  if (!isRecord(config) || !isRecord(config.mcpServers)) {
    return null
  }

  const servers: Record<string, McpServerConfig> = {}
  for (const [name, server] of Object.entries(config.mcpServers)) {
    if (isMcpServerConfig(server)) {
      servers[name] = server
    }
  }
  return servers
}

function isMcpServerConfig(value: unknown): value is McpServerConfig {
  if (!isRecord(value)) {
    return false
  }

  const type = value.type ?? 'stdio'
  if (type !== 'stdio' && type !== 'http' && type !== 'sse') {
    return false
  }
  if (type === 'stdio' && (typeof value.command !== 'string' || !value.command.trim())) {
    return false
  }
  if ((type === 'http' || type === 'sse') && (typeof value.url !== 'string' || !value.url.trim())) {
    return false
  }
  if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every(item => typeof item === 'string'))) {
    return false
  }
  if (value.env !== undefined && !isStringRecord(value.env)) {
    return false
  }
  if (value.headers !== undefined && !isStringRecord(value.headers)) {
    return false
  }
  return true
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
