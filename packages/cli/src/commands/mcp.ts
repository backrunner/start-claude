import type { ExtensionsLibrary, McpServerDefinition } from '../config/types'
import { ConfigManager } from '../config/manager'
import { UILogger } from '../utils/cli/ui'

const configManager = ConfigManager.getInstance()

/**
 * Server config from JSON input
 */
interface ServerConfigJson {
  type: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  description?: string
}

/**
 * Generate ID from name (lowercase, hyphenated)
 */
function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Get unique ID by adding -2, -3, etc. suffix if needed
 */
function getUniqueId(baseId: string, existing: Record<string, McpServerDefinition>): string {
  if (!existing[baseId])
    return baseId

  let counter = 2
  let id = `${baseId}-${counter}`

  while (existing[id]) {
    counter++
    id = `${baseId}-${counter}`
  }

  return id
}

/**
 * Parse environment variables from --env options
 */
function parseEnvVars(envOptions: string[]): Record<string, string> {
  const env: Record<string, string> = {}

  for (const envStr of envOptions) {
    const match = envStr.match(/^([^=]+)=(.*)$/)
    if (match) {
      env[match[1]] = match[2]
    }
  }

  return env
}

/**
 * Parse headers from --header options
 */
function parseHeaders(headerOptions: string[]): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const headerStr of headerOptions) {
    const colonIndex = headerStr.indexOf(':')
    if (colonIndex !== -1) {
      const key = headerStr.slice(0, colonIndex).trim()
      const value = headerStr.slice(colonIndex + 1).trim()
      headers[key] = value
    }
  }

  return headers
}

/**
 * Find -- separator in args
 */
function findSeparator(args: string[]): number {
  return args.indexOf('--')
}

/**
 * Add MCP server with command-line arguments
 */
export async function handleMcpAddCommand(
  name: string,
  args: string[],
  options: {
    transport?: string
    scope?: string
    env?: string[]
    header?: string[]
    verbose?: boolean
  } = {},
): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const transport = options.transport || 'stdio'
  const scope = options.scope || 'user'

  // Validate transport type
  if (!['stdio', 'http', 'sse'].includes(transport)) {
    ui.displayError(`Invalid transport type: ${transport}. Must be stdio, http, or sse.`)
    return
  }

  // Validate scope
  if (!['local', 'user'].includes(scope)) {
    ui.displayError(`Invalid scope: ${scope}. Must be local or user.`)
    return
  }

  const configFile = await configManager.load()
  const library: ExtensionsLibrary = configFile.settings.extensionsLibrary || {
    mcpServers: {},
    skills: {},
    subagents: {},
  }

  const baseId = generateId(name)
  const id = getUniqueId(baseId, library.mcpServers)

  const server: McpServerDefinition = {
    id,
    name,
    type: transport as 'stdio' | 'http' | 'sse',
    scope: scope as 'local' | 'user' | 'project',
  }

  if (transport === 'stdio') {
    // For stdio, args should contain: [url-or-command, ...remaining-args]
    // Or with -- separator: [-- command, ...args]
    const separatorIndex = findSeparator(args)

    if (separatorIndex !== -1) {
      // Everything after -- is the command and args
      const commandArgs = args.slice(separatorIndex + 1)
      if (commandArgs.length === 0) {
        ui.displayError('No command specified after -- separator')
        return
      }
      server.command = commandArgs[0]
      server.args = commandArgs.slice(1)
    }
    else {
      // First arg is command, rest are args
      if (args.length === 0) {
        ui.displayError('No command specified for stdio transport')
        return
      }
      server.command = args[0]
      server.args = args.slice(1)
    }

    // Parse environment variables
    if (options.env && options.env.length > 0) {
      server.env = parseEnvVars(options.env)
    }
  }
  else if (transport === 'http' || transport === 'sse') {
    // For HTTP/SSE, first arg should be the URL
    if (args.length === 0) {
      ui.displayError(`No URL specified for ${transport} transport`)
      return
    }

    server.url = args[0]

    // Parse headers
    if (options.header && options.header.length > 0) {
      server.headers = parseHeaders(options.header)
    }
  }

  // Add to library
  library.mcpServers[id] = server

  // Handle scope
  if (scope === 'user') {
    // Add to defaultEnabledExtensions
    const defaultEnabled = configFile.settings.defaultEnabledExtensions || {
      mcpServers: [],
      skills: [],
      subagents: [],
    }

    if (!defaultEnabled.mcpServers.includes(id)) {
      defaultEnabled.mcpServers.push(id)
    }

    configFile.settings.defaultEnabledExtensions = defaultEnabled
  }
  else if (scope === 'local') {
    // For local scope, we would add to the current profile's overrides
    // But since we don't have a current profile context in this command,
    // we'll just add to the library and let the user enable it per profile
    ui.displayInfo(`Server added to library with scope: ${scope}`)
    ui.displayInfo('To enable for a specific profile, use the manager UI or modify the profile config.')
  }

  // Save config
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ MCP server "${name}" added successfully!`)
  ui.displayInfo(`   ID: ${id}`)
  ui.displayInfo(`   Type: ${transport}`)
  ui.displayInfo(`   Scope: ${scope}`)

  if (server.type === 'stdio') {
    ui.displayInfo(`   Command: ${server.command}`)
    if (server.args && server.args.length > 0) {
      ui.displayInfo(`   Args: ${server.args.join(' ')}`)
    }
  }
  else {
    ui.displayInfo(`   URL: ${server.url}`)
  }
}

/**
 * Remove MCP server
 */
export async function handleMcpRemoveCommand(
  name: string,
  options: { verbose?: boolean } = {},
): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || {
    mcpServers: {},
    skills: {},
    subagents: {},
  }

  // Find server by name or ID
  let serverId: string | null = null
  let server: McpServerDefinition | null = null

  // Check if it's an exact ID match
  if (library.mcpServers[name]) {
    serverId = name
    server = library.mcpServers[name]
  }
  else {
    // Search by name
    for (const [id, srv] of Object.entries(library.mcpServers)) {
      if (srv.name === name || srv.name.toLowerCase() === name.toLowerCase()) {
        serverId = id
        server = srv
        break
      }
    }
  }

  if (!serverId || !server) {
    ui.displayError(`MCP server "${name}" not found.`)
    ui.displayInfo('Use "start-claude mcp list" to see available servers.')
    return
  }

  // Remove from library
  delete library.mcpServers[serverId]

  // Remove from defaultEnabledExtensions if present
  const defaultEnabled = configFile.settings.defaultEnabledExtensions
  if (defaultEnabled?.mcpServers) {
    const index = defaultEnabled.mcpServers.indexOf(serverId)
    if (index !== -1) {
      defaultEnabled.mcpServers.splice(index, 1)
    }
  }

  // Save config
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ MCP server "${server.name}" removed successfully!`)
}

/**
 * List all MCP servers
 */
export async function handleMcpListCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || {
    mcpServers: {},
    skills: {},
    subagents: {},
  }
  const mcpServers = library.mcpServers

  if (Object.keys(mcpServers).length === 0) {
    ui.displayInfo('No MCP servers found.')
    ui.displayInfo('Use "start-claude mcp add" to add a new MCP server.')
    return
  }

  ui.displayInfo(`\n📦 MCP Servers (${Object.keys(mcpServers).length}):\n`)

  for (const [id, server] of Object.entries(mcpServers)) {
    ui.displayInfo(`  • ${server.name} (${id})`)
    if (server.description) {
      ui.displayInfo(`    ${server.description}`)
    }
    ui.displayInfo(`    Type: ${server.type}`)
    if (server.scope) {
      ui.displayInfo(`    Scope: ${server.scope}`)
    }

    if (options.verbose) {
      if (server.type === 'stdio') {
        ui.displayVerbose(`    Command: ${server.command}`)
        if (server.args && server.args.length > 0) {
          ui.displayVerbose(`    Args: ${server.args.join(' ')}`)
        }
        if (server.env && Object.keys(server.env).length > 0) {
          ui.displayVerbose(`    Env vars: ${Object.keys(server.env).join(', ')}`)
        }
      }
      else if (server.type === 'http' || server.type === 'sse') {
        ui.displayVerbose(`    URL: ${server.url}`)
        if (server.headers && Object.keys(server.headers).length > 0) {
          ui.displayVerbose(`    Headers: ${Object.keys(server.headers).join(', ')}`)
        }
      }
    }
    ui.displayInfo('')
  }
}

/**
 * Get details of a specific MCP server
 */
export async function handleMcpGetCommand(
  name: string,
  options: { verbose?: boolean } = {},
): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || {
    mcpServers: {},
    skills: {},
    subagents: {},
  }

  // Find server by name or ID
  let server: McpServerDefinition | null = null

  // Check if it's an exact ID match
  if (library.mcpServers[name]) {
    server = library.mcpServers[name]
  }
  else {
    // Search by name
    for (const srv of Object.values(library.mcpServers)) {
      if (srv.name === name || srv.name.toLowerCase() === name.toLowerCase()) {
        server = srv
        break
      }
    }
  }

  if (!server) {
    ui.displayError(`MCP server "${name}" not found.`)
    ui.displayInfo('Use "start-claude mcp list" to see available servers.')
    return
  }

  ui.displayInfo(`\n📦 MCP Server: ${server.name}\n`)
  ui.displayInfo(`ID: ${server.id}`)
  ui.displayInfo(`Type: ${server.type}`)

  if (server.scope) {
    ui.displayInfo(`Scope: ${server.scope}`)
  }

  if (server.description) {
    ui.displayInfo(`Description: ${server.description}`)
  }

  if (server.type === 'stdio') {
    ui.displayInfo(`\nCommand Configuration:`)
    ui.displayInfo(`  Command: ${server.command}`)
    if (server.args && server.args.length > 0) {
      ui.displayInfo(`  Args: ${server.args.join(' ')}`)
    }
    if (server.env && Object.keys(server.env).length > 0) {
      ui.displayInfo(`  Environment Variables:`)
      for (const [key, value] of Object.entries(server.env)) {
        ui.displayInfo(`    ${key}=${value}`)
      }
    }
  }
  else if (server.type === 'http' || server.type === 'sse') {
    ui.displayInfo(`\n${server.type.toUpperCase()} Configuration:`)
    ui.displayInfo(`  URL: ${server.url}`)
    if (server.headers && Object.keys(server.headers).length > 0) {
      ui.displayInfo(`  Headers:`)
      for (const [key, value] of Object.entries(server.headers)) {
        ui.displayInfo(`    ${key}: ${value}`)
      }
    }
  }
}

/**
 * Add MCP server from JSON string
 */
export async function handleMcpAddJsonCommand(
  name: string,
  jsonStr: string,
  options: {
    scope?: string
    verbose?: boolean
  } = {},
): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const scope = options.scope || 'user'

  // Validate scope
  if (!['local', 'user'].includes(scope)) {
    ui.displayError(`Invalid scope: ${scope}. Must be local or user.`)
    return
  }

  // Parse JSON
  let serverConfig: ServerConfigJson
  try {
    serverConfig = JSON.parse(jsonStr) as ServerConfigJson
  }
  catch (error) {
    ui.displayError(`Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`)
    return
  }

  // Validate server config
  if (!serverConfig.type || !['stdio', 'http', 'sse'].includes(serverConfig.type)) {
    ui.displayError('Invalid or missing "type" field in JSON. Must be stdio, http, or sse.')
    return
  }

  const configFile = await configManager.load()
  const library: ExtensionsLibrary = configFile.settings.extensionsLibrary || {
    mcpServers: {},
    skills: {},
    subagents: {},
  }

  const baseId = generateId(name)
  const id = getUniqueId(baseId, library.mcpServers)

  const server: McpServerDefinition = {
    id,
    name,
    type: serverConfig.type as 'stdio' | 'http' | 'sse',
    scope: scope as 'local' | 'user' | 'project',
  }

  // Copy relevant fields based on type
  if (serverConfig.type === 'stdio') {
    if (!serverConfig.command) {
      ui.displayError('Missing "command" field for stdio transport')
      return
    }
    server.command = serverConfig.command
    if (serverConfig.args) {
      server.args = serverConfig.args
    }
    if (serverConfig.env) {
      server.env = serverConfig.env
    }
  }
  else if (serverConfig.type === 'http' || serverConfig.type === 'sse') {
    if (!serverConfig.url) {
      ui.displayError(`Missing "url" field for ${serverConfig.type} transport`)
      return
    }
    server.url = serverConfig.url
    if (serverConfig.headers) {
      server.headers = serverConfig.headers
    }
  }

  if (serverConfig.description) {
    server.description = serverConfig.description
  }

  // Add to library
  library.mcpServers[id] = server

  // Handle scope
  if (scope === 'user') {
    const defaultEnabled = configFile.settings.defaultEnabledExtensions || {
      mcpServers: [],
      skills: [],
      subagents: [],
    }

    if (!defaultEnabled.mcpServers.includes(id)) {
      defaultEnabled.mcpServers.push(id)
    }

    configFile.settings.defaultEnabledExtensions = defaultEnabled
  }

  // Save config
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ MCP server "${name}" added successfully!`)
  ui.displayInfo(`   ID: ${id}`)
  ui.displayInfo(`   Type: ${server.type}`)
  ui.displayInfo(`   Scope: ${scope}`)
}
