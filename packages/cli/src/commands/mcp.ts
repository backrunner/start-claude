import type { McpServerDefinition } from '../config/types'
import inquirer from 'inquirer'
import { ConfigManager } from '../config/manager'
import { UILogger } from '../utils/cli/ui'

const configManager = ConfigManager.getInstance()

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
 * List all MCP servers
 */
export async function handleMcpListCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
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
      else if (server.type === 'http') {
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
 * Show details of a specific MCP server
 */
export async function handleMcpShowCommand(serverId: string, options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const server = library.mcpServers[serverId]

  if (!server) {
    ui.displayError(`MCP server "${serverId}" not found.`)
    return
  }

  ui.displayInfo(`\n📦 MCP Server: ${server.name}\n`)
  ui.displayInfo(`  ID: ${server.id}`)
  ui.displayInfo(`  Name: ${server.name}`)
  if (server.description) {
    ui.displayInfo(`  Description: ${server.description}`)
  }
  ui.displayInfo(`  Type: ${server.type}`)

  if (server.type === 'stdio') {
    ui.displayInfo(`  Command: ${server.command}`)
    if (server.args && server.args.length > 0) {
      ui.displayInfo(`  Args: ${server.args.join(' ')}`)
    }
    if (server.env && Object.keys(server.env).length > 0) {
      ui.displayInfo(`  Environment variables:`)
      for (const [key, value] of Object.entries(server.env)) {
        ui.displayInfo(`    ${key}=${value}`)
      }
    }
  }
  else if (server.type === 'http') {
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
 * Add a new MCP server
 */
export async function handleMcpAddCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }

  // Ask for server type first
  const typeAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: 'Server type:',
      choices: [
        { name: 'Stdio (process-based)', value: 'stdio' },
        { name: 'HTTP (web-based)', value: 'http' },
      ],
      default: 'stdio',
    },
  ])

  const questions: any[] = [
    {
      type: 'input',
      name: 'name',
      message: 'Server name:',
      validate: (input: string) => {
        const name = input.trim()
        if (!name)
          return 'Name is required'

        const id = generateId(name)
        if (library.mcpServers[id]) {
          return `An MCP server with ID "${id}" already exists. Please use a different name.`
        }
        return true
      },
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
    },
  ]

  if (typeAnswer.type === 'stdio') {
    questions.push(
      {
        type: 'input',
        name: 'command',
        message: 'Command:',
        validate: (input: string) => input.trim() ? true : 'Command is required',
      },
      {
        type: 'input',
        name: 'args',
        message: 'Arguments (space-separated, optional):',
      },
      {
        type: 'confirm',
        name: 'hasEnv',
        message: 'Add environment variables?',
        default: false,
      },
    )
  }
  else {
    questions.push(
      {
        type: 'input',
        name: 'url',
        message: 'URL:',
        validate: (input: string) => {
          if (!input.trim())
            return 'URL is required'
          try {
            void new URL(input.trim())
            return true
          }
          catch {
            return 'Invalid URL format'
          }
        },
      },
      {
        type: 'confirm',
        name: 'hasHeaders',
        message: 'Add HTTP headers?',
        default: false,
      },
    )
  }

  const answers = await inquirer.prompt(questions)

  // Build the server object
  const server: McpServerDefinition = {
    id: getUniqueId(generateId(answers.name), library.mcpServers),
    name: answers.name.trim(),
    description: answers.description?.trim() || undefined,
    type: typeAnswer.type,
  }

  if (typeAnswer.type === 'stdio') {
    server.command = answers.command.trim()
    server.args = answers.args?.trim() ? answers.args.trim().split(/\s+/) : []

    // Handle environment variables
    if (answers.hasEnv) {
      const env: Record<string, string> = {}
      let addMore = true

      while (addMore) {
        const envAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'key',
            message: 'Environment variable name:',
            validate: (input: string) => input.trim() ? true : 'Name is required',
          },
          {
            type: 'input',
            name: 'value',
            message: 'Environment variable value:',
            validate: (input: string) => input.trim() ? true : 'Value is required',
          },
          {
            type: 'confirm',
            name: 'more',
            message: 'Add another environment variable?',
            default: false,
          },
        ])

        env[envAnswer.key.trim()] = envAnswer.value.trim()
        addMore = envAnswer.more
      }

      if (Object.keys(env).length > 0) {
        server.env = env
      }
    }
  }
  else {
    server.url = answers.url.trim()

    // Handle headers
    if (answers.hasHeaders) {
      const headers: Record<string, string> = {}
      let addMore = true

      while (addMore) {
        const headerAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'key',
            message: 'Header name:',
            validate: (input: string) => input.trim() ? true : 'Name is required',
          },
          {
            type: 'input',
            name: 'value',
            message: 'Header value:',
            validate: (input: string) => input.trim() ? true : 'Value is required',
          },
          {
            type: 'confirm',
            name: 'more',
            message: 'Add another header?',
            default: false,
          },
        ])

        headers[headerAnswer.key.trim()] = headerAnswer.value.trim()
        addMore = headerAnswer.more
      }

      if (Object.keys(headers).length > 0) {
        server.headers = headers
      }
    }
  }

  // Save to config
  library.mcpServers[server.id] = server
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ MCP server "${server.name}" added successfully!`)
  ui.displayInfo(`   ID: ${server.id}`)
}

/**
 * Edit an existing MCP server
 */
export async function handleMcpEditCommand(serverId: string, options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const server = library.mcpServers[serverId]

  if (!server) {
    ui.displayError(`MCP server "${serverId}" not found.`)
    return
  }

  ui.displayInfo(`\n✏️  Editing MCP server: ${server.name}\n`)

  // Ask which field to edit
  const editChoices = [
    { name: 'Name', value: 'name' },
    { name: 'Description', value: 'description' },
  ]

  if (server.type === 'stdio') {
    editChoices.push(
      { name: 'Command', value: 'command' },
      { name: 'Arguments', value: 'args' },
      { name: 'Environment variables', value: 'env' },
    )
  }
  else {
    editChoices.push(
      { name: 'URL', value: 'url' },
      { name: 'Headers', value: 'headers' },
    )
  }

  editChoices.push({ name: 'Cancel', value: 'cancel' })

  const fieldAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'field',
      message: 'What would you like to edit?',
      choices: editChoices,
    },
  ])

  if (fieldAnswer.field === 'cancel')
    return

  // Edit the selected field
  switch (fieldAnswer.field) {
    case 'name': {
      const nameAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'New name:',
          default: server.name,
          validate: (input: string) => input.trim() ? true : 'Name is required',
        },
      ])
      server.name = nameAnswer.name.trim()
      break
    }

    case 'description': {
      const descAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'New description:',
          default: server.description || '',
        },
      ])
      server.description = descAnswer.description.trim() || undefined
      break
    }

    case 'command': {
      const cmdAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'command',
          message: 'New command:',
          default: server.command || '',
          validate: (input: string) => input.trim() ? true : 'Command is required',
        },
      ])
      server.command = cmdAnswer.command.trim()
      break
    }

    case 'args': {
      const argsAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'args',
          message: 'New arguments (space-separated):',
          default: server.args?.join(' ') || '',
        },
      ])
      server.args = argsAnswer.args.trim() ? argsAnswer.args.trim().split(/\s+/) : []
      break
    }

    case 'env': {
      ui.displayInfo('Current environment variables:')
      if (server.env && Object.keys(server.env).length > 0) {
        for (const [key, value] of Object.entries(server.env)) {
          ui.displayInfo(`  ${key}=${value}`)
        }
      }
      else {
        ui.displayInfo('  (none)')
      }

      const envActionAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Add new variable', value: 'add' },
            { name: 'Remove variable', value: 'remove' },
            { name: 'Clear all', value: 'clear' },
            { name: 'Cancel', value: 'cancel' },
          ],
        },
      ])

      if (envActionAnswer.action === 'add') {
        const env = server.env || {}
        const envAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'key',
            message: 'Variable name:',
            validate: (input: string) => input.trim() ? true : 'Name is required',
          },
          {
            type: 'input',
            name: 'value',
            message: 'Variable value:',
            validate: (input: string) => input.trim() ? true : 'Value is required',
          },
        ])
        env[envAnswer.key.trim()] = envAnswer.value.trim()
        server.env = env
      }
      else if (envActionAnswer.action === 'remove' && server.env && Object.keys(server.env).length > 0) {
        const removeAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'key',
            message: 'Which variable to remove?',
            choices: Object.keys(server.env),
          },
        ])
        delete server.env[removeAnswer.key]
        if (Object.keys(server.env).length === 0) {
          server.env = undefined
        }
      }
      else if (envActionAnswer.action === 'clear') {
        server.env = undefined
      }
      break
    }

    case 'url': {
      const urlAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'New URL:',
          default: server.url || '',
          validate: (input: string) => {
            if (!input.trim())
              return 'URL is required'
            try {
              void new URL(input.trim())
              return true
            }
            catch {
              return 'Invalid URL format'
            }
          },
        },
      ])
      server.url = urlAnswer.url.trim()
      break
    }

    case 'headers': {
      ui.displayInfo('Current headers:')
      if (server.headers && Object.keys(server.headers).length > 0) {
        for (const [key, value] of Object.entries(server.headers)) {
          ui.displayInfo(`  ${key}: ${value}`)
        }
      }
      else {
        ui.displayInfo('  (none)')
      }

      const headerActionAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Add new header', value: 'add' },
            { name: 'Remove header', value: 'remove' },
            { name: 'Clear all', value: 'clear' },
            { name: 'Cancel', value: 'cancel' },
          ],
        },
      ])

      if (headerActionAnswer.action === 'add') {
        const headers = server.headers || {}
        const headerAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'key',
            message: 'Header name:',
            validate: (input: string) => input.trim() ? true : 'Name is required',
          },
          {
            type: 'input',
            name: 'value',
            message: 'Header value:',
            validate: (input: string) => input.trim() ? true : 'Value is required',
          },
        ])
        headers[headerAnswer.key.trim()] = headerAnswer.value.trim()
        server.headers = headers
      }
      else if (headerActionAnswer.action === 'remove' && server.headers && Object.keys(server.headers).length > 0) {
        const removeAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'key',
            message: 'Which header to remove?',
            choices: Object.keys(server.headers),
          },
        ])
        delete server.headers[removeAnswer.key]
        if (Object.keys(server.headers).length === 0) {
          server.headers = undefined
        }
      }
      else if (headerActionAnswer.action === 'clear') {
        server.headers = undefined
      }
      break
    }
  }

  // Save changes
  library.mcpServers[serverId] = server
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ MCP server "${server.name}" updated successfully!`)
}

/**
 * Delete an MCP server
 */
export async function handleMcpDeleteCommand(serverId: string, options: { verbose?: boolean, yes?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const server = library.mcpServers[serverId]

  if (!server) {
    ui.displayError(`MCP server "${serverId}" not found.`)
    return
  }

  // Confirm deletion unless --yes flag is provided
  if (!options.yes) {
    const confirmAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to delete MCP server "${server.name}"?`,
        default: false,
      },
    ])

    if (!confirmAnswer.confirm) {
      ui.displayInfo('Deletion cancelled.')
      return
    }
  }

  // Delete the server
  delete library.mcpServers[serverId]
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ MCP server "${server.name}" deleted successfully!`)
}
