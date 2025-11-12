import type { ClaudeConfig, ExtensionsLibrary, SystemSettings } from '../config/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { resolveEnabledExtensions } from './resolver'

/**
 * ExtensionsWriter - Generates Claude Code configuration files for MCP servers, skills, and subagents
 * based on the profile's enabled extensions.
 */
export class ExtensionsWriter {
  private projectRoot: string

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot
  }

  /**
   * Write all extension configurations for a profile
   */
  async writeExtensions(
    profile: ClaudeConfig,
    library: ExtensionsLibrary,
    settings: SystemSettings,
    isProxyMode: boolean = false,
  ): Promise<void> {
    console.log(`[ExtensionsWriter] Writing extensions for profile: ${profile.name}`)
    console.log(`[ExtensionsWriter] Proxy mode: ${isProxyMode}`)

    // Clean up old extension files first
    await this.cleanupExtensionFiles()

    // Resolve which extensions should actually be enabled
    const enabled = resolveEnabledExtensions(profile, settings, isProxyMode)

    console.log(`[ExtensionsWriter] Resolved enabled extensions:`, {
      mcpServers: enabled.mcpServers.length,
      skills: enabled.skills.length,
      subagents: enabled.subagents.length,
    })

    // Write MCP servers
    await this.writeMcpConfig(enabled.mcpServers, library, profile)

    // Write Skills
    await this.writeSkills(enabled.skills, library)

    // Write Subagents
    await this.writeSubagents(enabled.subagents, library)

    console.log('[ExtensionsWriter] All extensions written successfully')
  }

  /**
   * Write MCP configuration to .mcp.json
   */
  async writeMcpConfig(
    enabledIds: string[],
    library: ExtensionsLibrary,
    profile: ClaudeConfig,
  ): Promise<void> {
    if (enabledIds.length === 0) {
      console.log('[ExtensionsWriter] No MCP servers enabled')
      return
    }

    const mcpConfig: {
      mcpServers: Record<string, any>
    } = {
      mcpServers: {},
    }

    for (const id of enabledIds) {
      const server = library.mcpServers[id]
      if (!server) {
        console.warn(`[ExtensionsWriter] MCP server "${id}" not found in library, skipping`)
        continue
      }

      // Build server config based on type
      const serverConfig: any = {}

      if (server.type === 'stdio') {
        serverConfig.command = this.expandEnvVars(server.command || '', profile)
        if (server.args && server.args.length > 0) {
          serverConfig.args = server.args.map(arg => this.expandEnvVars(arg, profile))
        }
        if (server.env && Object.keys(server.env).length > 0) {
          serverConfig.env = {}
          for (const [key, value] of Object.entries(server.env)) {
            serverConfig.env[key] = this.expandEnvVars(value, profile)
          }
        }
      }
      else if (server.type === 'http') {
        serverConfig.type = 'http'
        serverConfig.url = this.expandEnvVars(server.url || '', profile)
        if (server.headers && Object.keys(server.headers).length > 0) {
          serverConfig.headers = {}
          for (const [key, value] of Object.entries(server.headers)) {
            serverConfig.headers[key] = this.expandEnvVars(value, profile)
          }
        }
      }

      // Use server name as the key in mcpServers
      mcpConfig.mcpServers[server.name] = serverConfig
      console.log(`[ExtensionsWriter] Added MCP server: ${server.name} (${server.type})`)
    }

    // Write to .mcp.json
    const mcpConfigPath = path.join(this.projectRoot, '.mcp.json')
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8')
    console.log(`[ExtensionsWriter] MCP config written to: ${mcpConfigPath}`)
  }

  /**
   * Write Skills to .claude/skills/
   */
  async writeSkills(
    enabledIds: string[],
    library: ExtensionsLibrary,
  ): Promise<void> {
    if (enabledIds.length === 0) {
      console.log('[ExtensionsWriter] No skills enabled')
      return
    }

    const skillsDir = path.join(this.projectRoot, '.claude', 'skills')

    // Ensure skills directory exists
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true })
    }

    for (const id of enabledIds) {
      const skill = library.skills[id]
      if (!skill) {
        console.warn(`[ExtensionsWriter] Skill "${id}" not found in library, skipping`)
        continue
      }

      // Create skill directory
      const skillDir = path.join(skillsDir, skill.name)
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true })
      }

      // Build SKILL.md with frontmatter
      let skillContent = '---\n'
      skillContent += `name: ${skill.name}\n`
      skillContent += `description: ${skill.description}\n`
      if (skill.allowedTools && skill.allowedTools.length > 0) {
        skillContent += `allowed-tools: ${skill.allowedTools.join(', ')}\n`
      }
      skillContent += '---\n\n'
      skillContent += skill.content

      // Write SKILL.md
      const skillFilePath = path.join(skillDir, 'SKILL.md')
      fs.writeFileSync(skillFilePath, skillContent, 'utf-8')
      console.log(`[ExtensionsWriter] Written skill: ${skill.name}`)
    }

    console.log(`[ExtensionsWriter] Skills written to: ${skillsDir}`)
  }

  /**
   * Write Subagents to .claude/agents/
   */
  async writeSubagents(
    enabledIds: string[],
    library: ExtensionsLibrary,
  ): Promise<void> {
    if (enabledIds.length === 0) {
      console.log('[ExtensionsWriter] No subagents enabled')
      return
    }

    const agentsDir = path.join(this.projectRoot, '.claude', 'agents')

    // Ensure agents directory exists
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true })
    }

    for (const id of enabledIds) {
      const subagent = library.subagents[id]
      if (!subagent) {
        console.warn(`[ExtensionsWriter] Subagent "${id}" not found in library, skipping`)
        continue
      }

      // Build agent markdown with frontmatter
      let agentContent = '---\n'
      agentContent += `name: ${subagent.name}\n`
      agentContent += `description: ${subagent.description}\n`
      if (subagent.tools && subagent.tools.length > 0) {
        agentContent += `tools: ${subagent.tools.join(', ')}\n`
      }
      if (subagent.model) {
        agentContent += `model: ${subagent.model}\n`
      }
      agentContent += '---\n\n'
      agentContent += subagent.systemPrompt

      // Write agent file
      const agentFilePath = path.join(agentsDir, `${subagent.name}.md`)
      fs.writeFileSync(agentFilePath, agentContent, 'utf-8')
      console.log(`[ExtensionsWriter] Written subagent: ${subagent.name}`)
    }

    console.log(`[ExtensionsWriter] Subagents written to: ${agentsDir}`)
  }

  /**
   * Clean up old extension configuration files
   */
  async cleanupExtensionFiles(): Promise<void> {
    console.log('[ExtensionsWriter] Cleaning up old extension files...')

    // Remove .mcp.json
    const mcpConfigPath = path.join(this.projectRoot, '.mcp.json')
    if (fs.existsSync(mcpConfigPath)) {
      fs.unlinkSync(mcpConfigPath)
      console.log('[ExtensionsWriter] Removed old .mcp.json')
    }

    // Remove .claude/skills/
    const skillsDir = path.join(this.projectRoot, '.claude', 'skills')
    if (fs.existsSync(skillsDir)) {
      fs.rmSync(skillsDir, { recursive: true, force: true })
      console.log('[ExtensionsWriter] Removed old skills directory')
    }

    // Remove .claude/agents/
    const agentsDir = path.join(this.projectRoot, '.claude', 'agents')
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true })
      console.log('[ExtensionsWriter] Removed old agents directory')
    }
  }

  /**
   * Expand environment variables in a string
   * Supports ${VAR} and ${VAR:-default} syntax
   */
  private expandEnvVars(value: string, profile: ClaudeConfig): string {
    if (!value) {
      return value
    }

    // Replace ${VAR:-default} patterns
    let expanded = value.replace(/\$\{([^}:]+):-([^}]+)\}/g, (match, varName, defaultValue) => {
      // Check profile env first, then process.env, then use default
      const envValue = profile.env?.[varName] || process.env[varName]
      return envValue !== undefined ? envValue : defaultValue
    })

    // Replace ${VAR} patterns
    expanded = expanded.replace(/\$\{([^}:]+)\}/g, (match, varName) => {
      // Check profile env first, then process.env
      const envValue = profile.env?.[varName] || process.env[varName]
      return envValue !== undefined ? envValue : match // Keep original if not found
    })

    // Replace special variables
    expanded = expanded.replace(/\$\{HOME\}/g, os.homedir())
    expanded = expanded.replace(/~/g, os.homedir())

    return expanded
  }
}
