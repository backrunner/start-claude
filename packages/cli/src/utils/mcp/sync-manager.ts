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
  [key: string]: any
}

export class McpSyncManager {
  private static instance: McpSyncManager

  private readonly CLAUDE_DESKTOP_CONFIG_PATH_MACOS = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  private readonly CLAUDE_DESKTOP_CONFIG_PATH_WINDOWS = join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
  private readonly CLAUDE_CODE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

  constructor() {}

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

  private async getConfigManager(): Promise<any> {
    const { ConfigManager } = await import('../../config/manager')
    return ConfigManager.getInstance()
  }

  /**
   * Extract MCP server configurations from Claude Desktop config
   */
  extractMcpFromClaudeDesktop(options: { verbose?: boolean } = {}): McpServerConfig[] | null {
    const logger = new UILogger(options.verbose)
    const configPath = this.getClaudeDesktopConfigPath()

    if (!configPath) {
      logger.displayVerbose('🔍 Claude Desktop config not found')
      return null
    }

    try {
      logger.displayVerbose(`📁 Reading Claude Desktop config: ${configPath}`)
      const configData = readFileSync(configPath, 'utf8')
      const config: ClaudeDesktopConfig = JSON.parse(configData)

      if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
        logger.displayVerbose('📋 No MCP servers found in Claude Desktop config')
        return null
      }

      const serverConfigs: McpServerConfig[] = Object.values(config.mcpServers)
      logger.displayVerbose(`✅ Found ${serverConfigs.length} MCP server(s) in Claude Desktop config`)

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
  extractMcpFromClaudeCodeSettings(options: { verbose?: boolean } = {}): McpServerConfig[] | null {
    const logger = new UILogger(options.verbose)

    if (!existsSync(this.CLAUDE_CODE_SETTINGS_PATH)) {
      logger.displayVerbose('📁 ~/.claude/settings.json not found')
      return null
    }

    try {
      logger.displayVerbose(`📁 Reading ~/.claude/settings.json`)
      const configData = readFileSync(this.CLAUDE_CODE_SETTINGS_PATH, 'utf8')
      const config: ClaudeCodeConfig = JSON.parse(configData)

      if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
        logger.displayVerbose('📋 No MCP servers found in ~/.claude/settings.json')
        return null
      }

      const serverConfigs: McpServerConfig[] = Object.values(config.mcpServers)
      logger.displayVerbose(`✅ Found ${serverConfigs.length} MCP server(s) in ~/.claude/settings.json`)

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
    const settings = configManager.getSettings()

    // Check if MCP sync is enabled
    if (!settings.mcpSync?.enabled && !options.force) {
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
    const allServers: Record<string, McpServerConfig> = {}

    // First add servers from ~/.claude/settings.json
    if (codeServers) {
      codeServers.forEach((server, index) => {
        const serverName = `code-server-${index}`
        allServers[serverName] = server
      })
    }

    // Then add/override with servers from Claude Desktop config
    if (desktopServers) {
      desktopServers.forEach((server, index) => {
        const serverName = `desktop-server-${index}`
        allServers[serverName] = server
      })
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
    const settings = configManager.getSettings()

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
    const settings = configManager.getSettings()
    const mcpSync = settings.mcpSync

    return {
      enabled: mcpSync?.enabled ?? false,
      serverCount: mcpSync?.servers ? Object.keys(mcpSync.servers).length : 0,
      lastSync: mcpSync?.lastSyncTime,
    }
  }

  /**
   * Enable/disable MCP sync
   */
  async setMcpSyncEnabled(enabled: boolean): Promise<void> {
    const configManager = await this.getConfigManager()
    const settings = configManager.getSettings()

    await configManager.updateSettings({
      mcpSync: {
        ...settings.mcpSync,
        enabled,
        servers: settings.mcpSync?.servers ?? {},
      },
    })
  }
}
