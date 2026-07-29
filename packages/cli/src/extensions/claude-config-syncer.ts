import type { ExtensionsLibrary, McpServerDefinition, SkillDefinition, SubagentDefinition } from '../config/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { UILogger } from '../utils/cli/ui'
import {
  getFrontmatterString,
  getFrontmatterStringList,
  parseMarkdownFrontmatter,
} from './frontmatter'
import { isSafeSkillName, isSafeSubagentName } from './names'

/**
 * Result of syncing Claude configuration files
 */
export interface SyncResult {
  mcpServersAdded: number
  skillsAdded: number
  subagentsAdded: number
  mcpServersUpdated: number
  skillsUpdated: number
  subagentsUpdated: number
  totalAdded: number
  totalUpdated: number
  totalChanged: number
}

interface SyncChanges {
  added: string[]
  updated: string[]
}

type UpsertStatus = 'added' | 'updated' | 'unchanged'

/**
 * ClaudeConfigSyncer - Scans Claude Code configuration files (.mcp.json, .claude/skills/, .claude/agents/)
 * and syncs them into the extensionsLibrary.
 *
 * This allows users to manage extensions through Claude Code's native config files and have them
 * automatically appear in Start Claude's manager UI.
 */
export class ClaudeConfigSyncer {
  private projectRoot: string
  private ui: UILogger

  constructor(projectRoot: string = process.cwd(), ui?: UILogger) {
    this.projectRoot = projectRoot
    this.ui = ui || new UILogger(false)
  }

  /**
   * Sync Claude Code configuration files into the extensions library
   * Only adds new extensions, doesn't overwrite existing ones
   *
   * @param existingLibrary - Current extensions library
   * @returns Updated library and sync stats
   */
  async syncClaudeConfig(existingLibrary: ExtensionsLibrary): Promise<{
    library: ExtensionsLibrary
    result: SyncResult
    defaultEnabled: {
      mcpServers: string[]
      skills: string[]
      subagents: string[]
    }
  }> {
    const result: SyncResult = {
      mcpServersAdded: 0,
      skillsAdded: 0,
      subagentsAdded: 0,
      mcpServersUpdated: 0,
      skillsUpdated: 0,
      subagentsUpdated: 0,
      totalAdded: 0,
      totalUpdated: 0,
      totalChanged: 0,
    }

    const library: ExtensionsLibrary = {
      mcpServers: { ...existingLibrary.mcpServers },
      skills: { ...existingLibrary.skills },
      subagents: { ...existingLibrary.subagents },
    }

    const defaultEnabled = {
      mcpServers: [] as string[],
      skills: [] as string[],
      subagents: [] as string[],
    }

    // Sync MCP servers from .mcp.json
    const mcpChanges = await this.syncMcpServers(library)
    result.mcpServersAdded = mcpChanges.added.length
    result.mcpServersUpdated = mcpChanges.updated.length
    defaultEnabled.mcpServers = mcpChanges.added

    // Sync skills from .claude/skills/
    const skillChanges = await this.syncSkills(library)
    result.skillsAdded = skillChanges.added.length
    result.skillsUpdated = skillChanges.updated.length
    defaultEnabled.skills = skillChanges.added

    // Sync subagents from .claude/agents/
    const subagentChanges = await this.syncSubagents(library)
    result.subagentsAdded = subagentChanges.added.length
    result.subagentsUpdated = subagentChanges.updated.length
    defaultEnabled.subagents = subagentChanges.added

    result.totalAdded = result.mcpServersAdded + result.skillsAdded + result.subagentsAdded
    result.totalUpdated = result.mcpServersUpdated + result.skillsUpdated + result.subagentsUpdated
    result.totalChanged = result.totalAdded + result.totalUpdated

    return { library, result, defaultEnabled }
  }

  /**
   * Sync MCP servers from .mcp.json
   */
  private async syncMcpServers(library: ExtensionsLibrary): Promise<SyncChanges> {
    const mcpConfigPath = path.join(this.projectRoot, '.mcp.json')

    if (!fs.existsSync(mcpConfigPath)) {
      return createEmptyChanges()
    }

    try {
      const content = fs.readFileSync(mcpConfigPath, 'utf-8')
      const mcpConfig = JSON.parse(content) as unknown

      if (!isRecord(mcpConfig) || !isRecord(mcpConfig.mcpServers)) {
        return createEmptyChanges()
      }

      const changes = createEmptyChanges()

      for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
        try {
          if (!isRecord(serverConfig)) {
            throw new Error('configuration must be an object')
          }

          const baseId = this.generateId(serverName)
          const type = getMcpTransport(serverConfig.type)

          const { id, status } = this.upsertExtension(
            library.mcpServers,
            baseId,
            serverName,
            (id, existing): McpServerDefinition => {
              const server: McpServerDefinition = {
                id,
                name: serverName,
                description: existing?.description || `Imported from .mcp.json`,
                type,
                scope: existing?.scope,
              }

              if (type === 'stdio') {
                server.command = getRequiredString(serverConfig, 'command')
                server.args = getStringArray(serverConfig, 'args')
                server.env = getStringRecord(serverConfig, 'env')
              }
              else {
                server.url = getRequiredString(serverConfig, 'url')
                server.headers = getStringRecord(serverConfig, 'headers')
              }

              return server
            },
          )

          if (status === 'added') {
            changes.added.push(id)
          }
          else if (status === 'updated') {
            changes.updated.push(id)
          }
        }
        catch (error) {
          this.ui.error(`Error syncing MCP server "${serverName}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      return changes
    }
    catch (error) {
      this.ui.error(`Error syncing MCP servers: ${error instanceof Error ? error.message : String(error)}`)
      return createEmptyChanges()
    }
  }

  /**
   * Sync skills from .claude/skills/ directory
   */
  private async syncSkills(library: ExtensionsLibrary): Promise<SyncChanges> {
    const skillsDir = path.join(this.projectRoot, '.claude', 'skills')

    if (!fs.existsSync(skillsDir)) {
      return createEmptyChanges()
    }

    try {
      const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())

      const changes = createEmptyChanges()

      for (const dirent of skillDirs) {
        try {
          const skillDir = path.join(skillsDir, dirent.name)
          const skillFile = path.join(skillDir, 'SKILL.md')

          if (!fs.existsSync(skillFile)) {
            continue
          }

          const content = fs.readFileSync(skillFile, 'utf-8')
          const { attributes } = parseMarkdownFrontmatter(content)
          const skillName = getFrontmatterString(attributes, 'name') || dirent.name
          if (!isSafeSkillName(skillName)) {
            throw new Error(`unsafe cross-platform skill name: ${skillName}`)
          }
          const baseId = this.generateId(skillName)
          const unchangedManagedSkill = Object.entries(library.skills).find(([id, skill]) => (
            skill.content === content
            && (id === baseId || skill.name.toLowerCase() === skillName.toLowerCase())
          ))

          if (unchangedManagedSkill) {
            continue
          }

          const { id, status } = this.upsertExtension(
            library.skills,
            baseId,
            skillName,
            (id): SkillDefinition => ({
              id,
              name: skillName,
              description: getFrontmatterString(attributes, 'description') || `Imported from .claude/skills/${dirent.name}`,
              content,
              allowedTools: getFrontmatterStringList(attributes, 'allowed-tools'),
            }),
          )

          if (status === 'added') {
            changes.added.push(id)
          }
          else if (status === 'updated') {
            changes.updated.push(id)
          }
        }
        catch (error) {
          this.ui.error(`Error syncing skill "${dirent.name}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      return changes
    }
    catch (error) {
      this.ui.error(`Error syncing skills: ${error instanceof Error ? error.message : String(error)}`)
      return createEmptyChanges()
    }
  }

  /**
   * Sync subagents from .claude/agents/ directory
   */
  private async syncSubagents(library: ExtensionsLibrary): Promise<SyncChanges> {
    const agentsDir = path.join(this.projectRoot, '.claude', 'agents')

    if (!fs.existsSync(agentsDir)) {
      return createEmptyChanges()
    }

    try {
      const agentFiles = fs.readdirSync(agentsDir, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'))

      const changes = createEmptyChanges()

      for (const dirent of agentFiles) {
        try {
          const agentFile = path.join(agentsDir, dirent.name)
          const content = fs.readFileSync(agentFile, 'utf-8')
          const { attributes, body } = parseMarkdownFrontmatter(content)

          const agentNameFromFile = dirent.name.replace(/\.md$/, '')
          const agentName = getFrontmatterString(attributes, 'name') || agentNameFromFile
          if (!isSafeSubagentName(agentName)) {
            throw new Error(`unsafe subagent name: ${agentName}`)
          }
          const baseId = this.generateId(agentName)
          const { id, status } = this.upsertExtension(
            library.subagents,
            baseId,
            agentName,
            (id): SubagentDefinition => ({
              id,
              name: agentName,
              description: getFrontmatterString(attributes, 'description') || `Imported from .claude/agents/${dirent.name}`,
              systemPrompt: body,
              tools: getFrontmatterStringList(attributes, 'tools'),
              model: getSubagentModel(attributes.model),
            }),
          )

          if (status === 'added') {
            changes.added.push(id)
          }
          else if (status === 'updated') {
            changes.updated.push(id)
          }
        }
        catch (error) {
          this.ui.error(`Error syncing subagent "${dirent.name}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      return changes
    }
    catch (error) {
      this.ui.error(`Error syncing subagents: ${error instanceof Error ? error.message : String(error)}`)
      return createEmptyChanges()
    }
  }

  /**
   * Generate ID from name (lowercase, hyphenated)
   */
  private generateId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'extension'
  }

  /**
   * Get unique ID by adding -2, -3, etc. suffix if needed
   */
  private getUniqueId<T>(baseId: string, existing: Record<string, T>): string {
    if (!existing[baseId]) {
      return baseId
    }

    let counter = 2
    let id = `${baseId}-${counter}`

    while (existing[id]) {
      counter++
      id = `${baseId}-${counter}`
    }

    return id
  }

  private upsertExtension<T extends { id: string, name: string }>(
    collection: Record<string, T>,
    baseId: string,
    name: string,
    build: (id: string, existing?: T) => T,
  ): { id: string, status: UpsertStatus } {
    const normalizedName = name.toLowerCase()
    const existingByName = Object.entries(collection)
      .find(([, item]) => item.name.toLowerCase() === normalizedName)?.[0]
    const existingById = collection[baseId]?.name.toLowerCase() === normalizedName
      ? baseId
      : undefined
    const existingId = existingByName || existingById
    const id = existingId || this.getUniqueId(baseId, collection)
    const existing = collection[id]
    const next = build(id, existing)

    if (!existing) {
      collection[id] = next
      return { id, status: 'added' }
    }

    if (JSON.stringify(existing) !== JSON.stringify(next)) {
      collection[id] = next
      return { id, status: 'updated' }
    }

    return { id, status: 'unchanged' }
  }
}

function createEmptyChanges(): SyncChanges {
  return {
    added: [],
    updated: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getMcpTransport(value: unknown): McpServerDefinition['type'] {
  if (value === undefined || value === 'stdio') {
    return 'stdio'
  }
  if (value === 'http' || value === 'sse') {
    return value
  }
  throw new Error(`unsupported transport type: ${String(value)}`)
}

function getRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`"${key}" must be a non-empty string`)
  }
  return value
}

function getStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(`"${key}" must be an array of strings`)
  }
  return value
}

function getStringRecord(record: Record<string, unknown>, key: string): Record<string, string> {
  const value = record[key]
  if (value === undefined) {
    return {}
  }
  if (!isRecord(value) || !Object.values(value).every(item => typeof item === 'string')) {
    throw new Error(`"${key}" must be an object with string values`)
  }
  return value as Record<string, string>
}

function getSubagentModel(value: unknown): SubagentDefinition['model'] {
  return value === 'sonnet' || value === 'opus' || value === 'haiku' || value === 'inherit'
    ? value
    : undefined
}
