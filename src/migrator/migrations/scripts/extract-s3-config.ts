/**
 * Migration script for extracting S3 configuration to separate file
 * This handles the complex logic that was previously hardcoded in file-operations.ts
 */
import fs from 'node:fs'

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
 * Validate if S3 config extraction is needed and safe to perform
 */
function validateMigrationNeeded(config: ConfigWithS3, s3ConfigPath: string): { needed: boolean, reason: string } {
  // Check if S3 config exists in settings
  if (!config.settings?.s3Sync) {
    return { needed: false, reason: 'No S3 config found in settings' }
  }

  // Check if S3 config file already exists
  if (fs.existsSync(s3ConfigPath)) {
    try {
      const existingContent = fs.readFileSync(s3ConfigPath, 'utf8')
      const existingConfig = JSON.parse(existingContent) as S3ConfigFile

      // Verify the existing file has valid structure
      if (existingConfig.s3Config && existingConfig.metadata) {
        return { needed: false, reason: 'S3 config file already exists and is valid' }
      }
    }
    catch (error) {
      console.warn(`Existing S3 config file is invalid: ${error instanceof Error ? error.message : 'Unknown error'}`)
      // Continue with migration to fix the invalid file
    }
  }

  // Validate S3 config structure
  const s3Config = config.settings.s3Sync
  const requiredFields = ['bucket', 'region', 'accessKeyId', 'secretAccessKey', 'key']
  const missingFields = requiredFields.filter(field => !s3Config[field as keyof typeof s3Config])

  if (missingFields.length > 0) {
    return {
      needed: false,
      reason: `S3 config missing required fields: ${missingFields.join(', ')}`,
    }
  }

  return { needed: true, reason: 'S3 config needs to be extracted to separate file' }
}

/**
 * Migration function to extract S3 config
 * @param config - The configuration object to migrate
 * @param args - Migration arguments (contains configDir path)
 */
export default async function migrateS3Config(config: ConfigWithS3, args?: { configDir?: string }): Promise<ConfigWithS3> {
  try {
    // Import necessary modules dynamically to avoid circular dependencies
    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')

    const configDir = args?.configDir || path.join(os.homedir(), '.start-claude')
    const s3ConfigPath = path.join(configDir, 's3-config.json')

    // Validate if migration is needed
    const validation = validateMigrationNeeded(config, s3ConfigPath)
    if (!validation.needed) {
      console.log(`⏭️ Skipping S3 config extraction: ${validation.reason}`)
      return config
    }

    console.log(`🔄 Extracting S3 configuration: ${validation.reason}`)

    // Create the S3 config file structure
    const s3ConfigFile: S3ConfigFile = {
      version: 1,
      s3Config: config.settings.s3Sync!,
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

    // Verify the file was written correctly
    if (!fs.existsSync(s3ConfigPath)) {
      throw new Error('S3 config file was not created successfully')
    }

    // Verify the file content
    const verificationContent = fs.readFileSync(s3ConfigPath, 'utf8')
    const verificationConfig = JSON.parse(verificationContent) as S3ConfigFile

    if (!verificationConfig.s3Config || !verificationConfig.metadata) {
      throw new Error('S3 config file content is invalid after creation')
    }

    console.log(`✅ S3 configuration extracted to separate file: ${s3ConfigPath}`)

    // Remove S3 config from main config
    const updatedConfig = { ...config }
    delete updatedConfig.settings.s3Sync

    // Verify S3 config was removed from main config
    if (updatedConfig.settings.s3Sync) {
      throw new Error('Failed to remove S3 config from main configuration')
    }

    return updatedConfig
  }
  catch (error) {
    console.error(`❌ Failed to extract S3 configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)

    // Return config unchanged if migration fails
    // This prevents the migration from being marked as completed
    throw error
  }
}
