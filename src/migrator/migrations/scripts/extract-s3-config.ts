/**
 * Migration script for extracting S3 configuration to separate file
 * This handles the complex logic that was previously hardcoded in file-operations.ts
 */

interface ConfigWithS3 {
  version: number
  settings: {
    s3Sync?: {
      bucket: string
      region: string
      accessKeyId: string
      secretAccessKey: string
      key: string
      endpointUrl?: string
      remoteConfigCheckIntervalMinutes?: number
    }
    [key: string]: any
  }
  [key: string]: any
}

interface S3ConfigFile {
  version: number
  s3Config: ConfigWithS3['settings']['s3Sync']
  metadata: {
    createdAt: string
    lastModified: string
    migratedFrom: string
  }
}

/**
 * Migration function to extract S3 config
 * @param config - The configuration object to migrate
 * @param args - Migration arguments (contains configDir path)
 */
export default async function migrateS3Config(config: ConfigWithS3, args?: { configDir?: string }): Promise<ConfigWithS3> {
  // Check if S3 config exists in settings
  if (!config.settings?.s3Sync) {
    // No S3 config to migrate
    return config
  }

  try {
    // Import necessary modules dynamically to avoid circular dependencies
    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')

    const configDir = args?.configDir || path.join(os.homedir(), '.start-claude')
    const s3ConfigPath = path.join(configDir, 's3-config.json')

    // Create the S3 config file structure
    const s3ConfigFile: S3ConfigFile = {
      version: 1,
      s3Config: config.settings.s3Sync,
      metadata: {
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        migratedFrom: 'system-settings',
      },
    }

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Write the S3 config file
    fs.writeFileSync(s3ConfigPath, JSON.stringify(s3ConfigFile, null, 2), 'utf8')

    // Log successful migration
    console.log(`✅ S3 configuration extracted to separate file: ${s3ConfigPath}`)

    // Remove S3 config from main config
    const updatedConfig = { ...config }
    delete updatedConfig.settings.s3Sync

    return updatedConfig
  }
  catch (error) {
    console.error(`❌ Failed to extract S3 configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)

    // Return config unchanged if migration fails
    return config
  }
}
