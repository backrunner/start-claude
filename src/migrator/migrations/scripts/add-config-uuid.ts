import { randomUUID } from 'node:crypto'

/**
 * Migration script to add UUID to all configurations
 * This enables unique identification of configs independent of their names
 */
export function migrate(config: any): any {
  console.log('Adding UUIDs to configurations...')

  if (!config.configs || !Array.isArray(config.configs)) {
    console.log('No configurations found to migrate')
    return config
  }

  let updatedCount = 0

  config.configs = config.configs.map((cfg: any) => {
    // Only add UUID if it doesn't already exist
    if (!cfg.id) {
      cfg.id = randomUUID()
      updatedCount++
      console.log(`Added UUID ${cfg.id} to config: ${cfg.name}`)
    }
    return cfg
  })

  console.log(`✅ Added UUIDs to ${updatedCount} configurations`)

  return config
}

export default migrate
