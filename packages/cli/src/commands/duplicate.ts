import type { ClaudeConfig } from '../config/types'
import process from 'node:process'
import inquirer from 'inquirer'
import { ConfigManager } from '../config/manager'
import { UILogger } from '../utils/cli/ui'

/**
 * Generate a new configuration name with -2, -3, etc. suffix
 */
function generateNewName(baseName: string, existingConfigs: ClaudeConfig[]): string {
  // Extract base name and existing number suffix
  const match = baseName.match(/^(.*?)(-(\d+))?$/)
  const base = match?.[1] || baseName
  const existingNum = match?.[3] ? parseInt(match[3], 10) : 1

  // Find the next available number
  let num = existingNum + 1
  let newName = `${base}-${num}`

  while (existingConfigs.some(c => c.name === newName)) {
    num++
    newName = `${base}-${num}`
  }

  return newName
}

/**
 * Handle the duplicate command
 * Duplicates an existing configuration with a new name
 */
export async function handleDuplicateCommand(
  originalName: string,
  newName?: string,
): Promise<void> {
  const ui = new UILogger()
  const configManager = ConfigManager.getInstance()

  // Get the original configuration
  const originalConfig = await configManager.getConfig(originalName)
  if (!originalConfig) {
    ui.displayError(`Configuration "${originalName}" not found`)
    process.exit(1)
  }

  // Get all existing configurations
  const allConfigs = await configManager.listConfigs()

  // Generate or validate the new name
  let finalNewName: string
  if (!newName) {
    // Auto-generate name with -2, -3, etc. suffix
    const generatedName = generateNewName(originalConfig.name, allConfigs)
    ui.displayInfo(`Auto-generated new name: ${generatedName}`)

    // Ask for confirmation or allow user to change the name
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'newName',
        message: 'Enter new configuration name (press Enter to use the generated name):',
        default: generatedName,
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'Configuration name cannot be empty'
          }
          if (allConfigs.some(c => c.name === input.trim())) {
            return `Configuration "${input.trim()}" already exists`
          }
          return true
        },
      },
    ])
    finalNewName = answers.newName.trim()
  }
  else {
    // Validate that the provided new name doesn't already exist
    if (allConfigs.some(c => c.name === newName)) {
      ui.displayError(`Configuration "${newName}" already exists`)
      process.exit(1)
    }
    finalNewName = newName
  }

  // Create the duplicated configuration
  // Remove id, isDefault, and order as they should be reset for new configs
  const { id, isDefault, order, ...configWithoutId } = originalConfig
  const duplicatedConfig: ClaudeConfig = {
    ...configWithoutId,
    name: finalNewName,
    isDefault: false, // New config should not be default
  }

  try {
    // Add the new configuration
    await configManager.addConfig(duplicatedConfig)
    ui.displaySuccess(
      `Configuration "${originalName}" duplicated as "${finalNewName}" successfully!`,
    )
  }
  catch (error) {
    ui.displayError(
      `Failed to duplicate configuration: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}
