import type { SkillDefinition } from '../config/types'
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
function getUniqueId(baseId: string, existing: Record<string, SkillDefinition>): string {
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
 * List all skills
 */
export async function handleSkillListCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const skills = library.skills

  if (Object.keys(skills).length === 0) {
    ui.displayInfo('No skills found.')
    ui.displayInfo('Use "start-claude skill add" to add a new skill.')
    return
  }

  ui.displayInfo(`\n🎯 Skills (${Object.keys(skills).length}):\n`)

  for (const [id, skill] of Object.entries(skills)) {
    ui.displayInfo(`  • ${skill.name} (${id})`)
    ui.displayInfo(`    ${skill.description}`)

    if (options.verbose) {
      if (skill.allowedTools && skill.allowedTools.length > 0) {
        ui.displayVerbose(`    Allowed tools: ${skill.allowedTools.join(', ')}`)
      }
      ui.displayVerbose(`    Content length: ${skill.content.length} characters`)
    }
    ui.displayInfo('')
  }
}

/**
 * Show details of a specific skill
 */
export async function handleSkillShowCommand(skillId: string, options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const skill = library.skills[skillId]

  if (!skill) {
    ui.displayError(`Skill "${skillId}" not found.`)
    return
  }

  ui.displayInfo(`\n🎯 Skill: ${skill.name}\n`)
  ui.displayInfo(`  ID: ${skill.id}`)
  ui.displayInfo(`  Name: ${skill.name}`)
  ui.displayInfo(`  Description: ${skill.description}`)

  if (skill.allowedTools && skill.allowedTools.length > 0) {
    ui.displayInfo(`  Allowed tools: ${skill.allowedTools.join(', ')}`)
  }

  ui.displayInfo(`\n  Content (SKILL.md):\n`)
  ui.displayInfo(skill.content)
}

/**
 * Add a new skill
 */
export async function handleSkillAddCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }

  const questions = [
    {
      type: 'input',
      name: 'name',
      message: 'Skill name (lowercase, hyphens only):',
      validate: (input: string) => {
        const name = input.trim()
        if (!name)
          return 'Name is required'

        const nameRegex = /^[a-z0-9-]+$/
        if (!nameRegex.test(name)) {
          return 'Name must be lowercase with hyphens only (e.g., my-skill)'
        }

        const id = generateId(name)
        if (library.skills[id]) {
          return `A skill with ID "${id}" already exists. Please use a different name.`
        }
        return true
      },
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (when should this skill be used):',
      validate: (input: string) => input.trim() ? true : 'Description is required',
    },
    {
      type: 'editor',
      name: 'content',
      message: 'Skill content (SKILL.md) - will open in editor:',
      validate: (input: string) => input.trim() ? true : 'Content is required',
    },
    {
      type: 'input',
      name: 'allowedTools',
      message: 'Allowed tools (comma-separated, optional):',
    },
  ]

  const answers = await inquirer.prompt(questions)

  // Parse allowed tools
  const allowedTools = answers.allowedTools?.trim()
    ? answers.allowedTools.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
    : undefined

  const skill: SkillDefinition = {
    id: getUniqueId(generateId(answers.name), library.skills),
    name: answers.name.trim(),
    description: answers.description.trim(),
    content: answers.content.trim(),
    allowedTools,
  }

  // Save to config
  library.skills[skill.id] = skill
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ Skill "${skill.name}" added successfully!`)
  ui.displayInfo(`   ID: ${skill.id}`)
}

/**
 * Edit an existing skill
 */
export async function handleSkillEditCommand(skillId: string, options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const skill = library.skills[skillId]

  if (!skill) {
    ui.displayError(`Skill "${skillId}" not found.`)
    return
  }

  ui.displayInfo(`\n✏️  Editing skill: ${skill.name}\n`)

  // Ask which field to edit
  const fieldAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'field',
      message: 'What would you like to edit?',
      choices: [
        { name: 'Name', value: 'name' },
        { name: 'Description', value: 'description' },
        { name: 'Content (SKILL.md)', value: 'content' },
        { name: 'Allowed tools', value: 'allowedTools' },
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
          default: skill.name,
          validate: (input: string) => {
            const name = input.trim()
            if (!name)
              return 'Name is required'

            const nameRegex = /^[a-z0-9-]+$/
            if (!nameRegex.test(name)) {
              return 'Name must be lowercase with hyphens only (e.g., my-skill)'
            }
            return true
          },
        },
      ])
      skill.name = nameAnswer.name.trim()
      break
    }

    case 'description': {
      const descAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'New description:',
          default: skill.description,
          validate: (input: string) => input.trim() ? true : 'Description is required',
        },
      ])
      skill.description = descAnswer.description.trim()
      break
    }

    case 'content': {
      const contentAnswer = await inquirer.prompt([
        {
          type: 'editor',
          name: 'content',
          message: 'Edit content (SKILL.md) - will open in editor:',
          default: skill.content,
          validate: (input: string) => input.trim() ? true : 'Content is required',
        },
      ])
      skill.content = contentAnswer.content.trim()
      break
    }

    case 'allowedTools': {
      const currentTools = skill.allowedTools ? skill.allowedTools.join(', ') : ''
      const toolsAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'allowedTools',
          message: 'Allowed tools (comma-separated, leave empty to clear):',
          default: currentTools,
        },
      ])

      skill.allowedTools = toolsAnswer.allowedTools?.trim()
        ? toolsAnswer.allowedTools.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
        : undefined
      break
    }
  }

  // Save changes
  library.skills[skillId] = skill
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ Skill "${skill.name}" updated successfully!`)
}

/**
 * Delete a skill
 */
export async function handleSkillDeleteCommand(skillId: string, options: { verbose?: boolean, yes?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  ui.displayWelcome()

  const configFile = await configManager.load()
  const library = configFile.settings.extensionsLibrary || { mcpServers: {}, skills: {}, subagents: {} }
  const skill = library.skills[skillId]

  if (!skill) {
    ui.displayError(`Skill "${skillId}" not found.`)
    return
  }

  // Confirm deletion unless --yes flag is provided
  if (!options.yes) {
    const confirmAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to delete skill "${skill.name}"?`,
        default: false,
      },
    ])

    if (!confirmAnswer.confirm) {
      ui.displayInfo('Deletion cancelled.')
      return
    }
  }

  // Delete the skill
  delete library.skills[skillId]
  configFile.settings.extensionsLibrary = library
  await configManager.save(configFile)

  ui.displaySuccess(`✅ Skill "${skill.name}" deleted successfully!`)
}
