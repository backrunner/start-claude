import type { SubagentDefinition } from '../config/types'
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
function getUniqueId(baseId: string, existing: Record<string, SubagentDefinition>): string {
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
 * List all subagents
 */
export async function handleAgentListCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const subagents = library.subagents

  if (Object.keys(subagents).length === 0) {
    ui.displayInfo('No subagents found.')
    ui.displayInfo('Use "start-claude agent add" to add a new subagent.')
    return
  }

  ui.displayInfo(`\n🤖 Subagents (${Object.keys(subagents).length}):\n`)

  for (const [id, subagent] of Object.entries(subagents)) {
    ui.displayInfo(`  • ${subagent.name} (${id})`)
    ui.displayInfo(`    ${subagent.description}`)
    if (subagent.model) {
      ui.displayInfo(`    Model: ${subagent.model}`)
    }

    if (options.verbose) {
      if (subagent.tools && subagent.tools.length > 0) {
        ui.displayVerbose(`    Tools: ${subagent.tools.join(', ')}`)
      }
      ui.displayVerbose(`    System prompt length: ${subagent.systemPrompt.length} characters`)
    }
    ui.displayInfo('')
  }
}

/**
 * Show details of a specific subagent
 */
export async function handleAgentShowCommand(agentId: string, options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const subagent = library.subagents[agentId]

  if (!subagent) {
    ui.displayError(`Subagent "${agentId}" not found.`)
    return
  }

  ui.displayInfo(`\n🤖 Subagent: ${subagent.name}\n`)
  ui.displayInfo(`  ID: ${subagent.id}`)
  ui.displayInfo(`  Name: ${subagent.name}`)
  ui.displayInfo(`  Description: ${subagent.description}`)

  if (subagent.model) {
    ui.displayInfo(`  Model: ${subagent.model}`)
  }
  else {
    ui.displayInfo(`  Model: inherit (uses parent's model)`)
  }

  if (subagent.tools && subagent.tools.length > 0) {
    ui.displayInfo(`  Tools: ${subagent.tools.join(', ')}`)
  }
  else {
    ui.displayInfo(`  Tools: inherit (all tools available)`)
  }

  ui.displayInfo(`\n  System Prompt:\n`)
  ui.displayInfo(subagent.systemPrompt)
}

/**
 * Add a new subagent
 */
export async function handleAgentAddCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }

  const questions = [
    {
      type: 'input',
      name: 'name',
      message: 'Agent name (lowercase, hyphens only):',
      validate: (input: string) => {
        const name = input.trim()
        if (!name)
          return 'Name is required'

        const nameRegex = /^[a-z0-9-]+$/
        if (!nameRegex.test(name)) {
          return 'Name must be lowercase with hyphens only (e.g., my-agent)'
        }

        const id = generateId(name)
        if (library.subagents[id]) {
          return `A subagent with ID "${id}" already exists. Please use a different name.`
        }
        return true
      },
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (when should this agent be invoked):',
      validate: (input: string) => input.trim() ? true : 'Description is required',
    },
    {
      type: 'editor',
      name: 'systemPrompt',
      message: 'System prompt (markdown) - will open in editor:',
      validate: (input: string) => input.trim() ? true : 'System prompt is required',
    },
    {
      type: 'list',
      name: 'model',
      message: 'Model to use:',
      choices: [
        { name: 'Inherit (use parent\'s model)', value: 'inherit' },
        { name: 'Sonnet', value: 'sonnet' },
        { name: 'Opus', value: 'opus' },
        { name: 'Haiku', value: 'haiku' },
      ],
      default: 'inherit',
    },
    {
      type: 'input',
      name: 'tools',
      message: 'Tools (comma-separated, leave empty to inherit all):',
    },
  ]

  const answers = await inquirer.prompt(questions)

  // Parse tools
  const tools = answers.tools?.trim()
    ? answers.tools.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
    : undefined

  const subagent: SubagentDefinition = {
    id: getUniqueId(generateId(answers.name), library.subagents),
    name: answers.name.trim(),
    description: answers.description.trim(),
    systemPrompt: answers.systemPrompt.trim(),
    model: answers.model === 'inherit' ? undefined : answers.model,
    tools,
  }

  // Save to config
  library.subagents[subagent.id] = subagent
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ Subagent "${subagent.name}" added successfully!`)
  ui.displayInfo(`   ID: ${subagent.id}`)
}

/**
 * Edit an existing subagent
 */
export async function handleAgentEditCommand(agentId: string, options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const subagent = library.subagents[agentId]

  if (!subagent) {
    ui.displayError(`Subagent "${agentId}" not found.`)
    return
  }

  ui.displayInfo(`\n✏️  Editing subagent: ${subagent.name}\n`)

  // Ask which field to edit
  const fieldAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'field',
      message: 'What would you like to edit?',
      choices: [
        { name: 'Name', value: 'name' },
        { name: 'Description', value: 'description' },
        { name: 'System prompt', value: 'systemPrompt' },
        { name: 'Model', value: 'model' },
        { name: 'Tools', value: 'tools' },
        { name: 'Cancel', value: 'cancel' },
      ],
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
          message: 'New name (lowercase, hyphens only):',
          default: subagent.name,
          validate: (input: string) => {
            const name = input.trim()
            if (!name)
              return 'Name is required'

            const nameRegex = /^[a-z0-9-]+$/
            if (!nameRegex.test(name)) {
              return 'Name must be lowercase with hyphens only (e.g., my-agent)'
            }
            return true
          },
        },
      ])
      subagent.name = nameAnswer.name.trim()
      break
    }

    case 'description': {
      const descAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'New description:',
          default: subagent.description,
          validate: (input: string) => input.trim() ? true : 'Description is required',
        },
      ])
      subagent.description = descAnswer.description.trim()
      break
    }

    case 'systemPrompt': {
      const promptAnswer = await inquirer.prompt([
        {
          type: 'editor',
          name: 'systemPrompt',
          message: 'Edit system prompt - will open in editor:',
          default: subagent.systemPrompt,
          validate: (input: string) => input.trim() ? true : 'System prompt is required',
        },
      ])
      subagent.systemPrompt = promptAnswer.systemPrompt.trim()
      break
    }

    case 'model': {
      const modelAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'model',
          message: 'Select model:',
          choices: [
            { name: 'Inherit (use parent\'s model)', value: 'inherit' },
            { name: 'Sonnet', value: 'sonnet' },
            { name: 'Opus', value: 'opus' },
            { name: 'Haiku', value: 'haiku' },
          ],
          default: subagent.model || 'inherit',
        },
      ])
      subagent.model = modelAnswer.model === 'inherit' ? undefined : modelAnswer.model
      break
    }

    case 'tools': {
      const currentTools = subagent.tools ? subagent.tools.join(', ') : ''
      const toolsAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'tools',
          message: 'Tools (comma-separated, leave empty to inherit all):',
          default: currentTools,
        },
      ])

      subagent.tools = toolsAnswer.tools?.trim()
        ? toolsAnswer.tools.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
        : undefined
      break
    }
  }

  // Save changes
  library.subagents[agentId] = subagent
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ Subagent "${subagent.name}" updated successfully!`)
}

/**
 * Delete a subagent
 */
export async function handleAgentDeleteCommand(agentId: string, options: { verbose?: boolean, yes?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const subagent = library.subagents[agentId]

  if (!subagent) {
    ui.displayError(`Subagent "${agentId}" not found.`)
    return
  }

  // Confirm deletion unless --yes flag is provided
  if (!options.yes) {
    const confirmAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to delete subagent "${subagent.name}"?`,
        default: false,
      },
    ])

    if (!confirmAnswer.confirm) {
      ui.displayInfo('Deletion cancelled.')
      return
    }
  }

  // Delete the subagent
  delete library.subagents[agentId]
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ Subagent "${subagent.name}" deleted successfully!`)
}
