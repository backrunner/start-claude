import { randomUUID } from 'node:crypto'

/**
 * Migration script to add UUID to all configurations
 * This enables unique identification of configs independent of their names
 */

/**
 * Validate if UUID migration is needed and safe to perform
 */
function validateMigrationNeeded(config: any): { needed: boolean, reason: string, configsToUpdate: any[] } {
  if (!config.configs || !Array.isArray(config.configs)) {
    return { needed: false, reason: 'No configurations found to migrate', configsToUpdate: [] }
  }

  // Find configs that need UUIDs
  const configsToUpdate = config.configs.filter((cfg: any) => !cfg.id)

  if (configsToUpdate.length === 0) {
    return { needed: false, reason: 'All configurations already have UUIDs', configsToUpdate: [] }
  }

  // Validate that all configs have at least a name
  const configsWithoutNames = configsToUpdate.filter((cfg: any) => !cfg.name || typeof cfg.name !== 'string')
  if (configsWithoutNames.length > 0) {
    return {
      needed: false,
      reason: `${configsWithoutNames.length} configurations missing required 'name' field`,
      configsToUpdate: [],
    }
  }

  return {
    needed: true,
    reason: `${configsToUpdate.length} configurations need UUIDs`,
    configsToUpdate,
  }
}

/**
 * Migration function to add UUIDs to configurations
 */
export function migrate(config: any): any {
  console.log('🔄 Adding UUIDs to configurations...')

  // Validate migration
  const validation = validateMigrationNeeded(config)
  if (!validation.needed) {
    console.log(`⏭️ Skipping UUID migration: ${validation.reason}`)
    return config
  }

  console.log(`📝 ${validation.reason}`)

  let updatedCount = 0
  const addedUUIDs: string[] = []

  try {
    // Create a copy of the config to avoid mutations
    const updatedConfig = { ...config }
    updatedConfig.configs = config.configs.map((cfg: any) => {
      // Only add UUID if it doesn't already exist
      if (!cfg.id) {
        const newUUID = randomUUID()
        const updatedCfg = { ...cfg, id: newUUID }

        updatedCount++
        addedUUIDs.push(newUUID)
        console.log(`  ✅ Added UUID ${newUUID} to config: ${cfg.name}`)

        return updatedCfg
      }
      return cfg
    })

    // Verify all configs now have UUIDs
    const configsStillMissingUUIDs = updatedConfig.configs.filter((cfg: any) => !cfg.id)
    if (configsStillMissingUUIDs.length > 0) {
      throw new Error(`${configsStillMissingUUIDs.length} configurations still missing UUIDs after migration`)
    }

    // Verify no duplicate UUIDs were created
    const allUUIDs = updatedConfig.configs.map((cfg: any) => cfg.id)
    const uniqueUUIDs = new Set(allUUIDs)
    if (allUUIDs.length !== uniqueUUIDs.size) {
      throw new Error('Duplicate UUIDs detected after migration')
    }

    console.log(`✅ Successfully added UUIDs to ${updatedCount} configurations`)

    return updatedConfig
  }
  catch (error) {
    console.error(`❌ Failed to add UUIDs to configurations: ${error instanceof Error ? error.message : 'Unknown error'}`)

    // Re-throw the error to prevent the migration from being marked as completed
    throw error
  }
}

export default migrate
