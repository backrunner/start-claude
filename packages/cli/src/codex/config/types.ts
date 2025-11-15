/**
 * Codex configuration types
 * Simplified configuration for OpenAI Codex CLI
 */

/**
 * Individual Codex configuration
 */
export interface CodexConfig {
  id?: string // UUID for unique identification
  name: string
  apiKey?: string // OpenAI API Key
  baseUrl?: string // Custom API endpoint (e.g., for Azure OpenAI)
  model?: string // Model to use (e.g., "gpt-4o", "gpt-5-codex")

  // Configuration metadata
  isDefault?: boolean
  order?: number // Lower numbers are prioritized first (0 = highest priority)
  enabled?: boolean // Configuration is enabled/disabled
  deletedAt?: string // ISO timestamp when config was deleted, for soft deletion tracking
  isDeleted?: boolean // Simple flag to mark config as deleted (tombstone)

  // Environment variables - passed to Codex CLI
  // Common Codex env vars: OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, etc.
  env?: Record<string, string>
}

/**
 * Cloud sync provider types
 */
export type CloudSyncProvider = 'icloud' | 'onedrive' | 'custom' | 's3'

/**
 * Cloud sync configuration
 */
export interface CloudSyncConfig {
  enabled: boolean
  provider: CloudSyncProvider
  cloudPath?: string // For icloud/onedrive/custom
  linkedAt?: string // ISO timestamp when sync was set up
}

/**
 * S3 sync configuration
 */
export interface S3SyncConfig {
  enabled: boolean
  endpoint?: string
  region?: string
  bucket?: string
  accessKeyId?: string
  secretAccessKey?: string
  prefix?: string // S3 key prefix (e.g., "codex-configs/")
  autoSync?: boolean // Auto-sync on config changes
  lastSyncAt?: string // ISO timestamp of last sync
}

/**
 * Codex system settings
 */
export interface CodexSettings {
  // Cloud sync configuration
  sync?: CloudSyncConfig

  // S3 sync configuration
  s3Sync?: S3SyncConfig
}

/**
 * Main Codex configuration file structure
 */
export interface CodexConfigFile {
  version: number // Schema version for migrations
  configs: CodexConfig[] // Array of Codex configurations
  settings: CodexSettings // Global settings
}

/**
 * Current Codex config version
 */
export const CURRENT_CODEX_VERSION = 1

/**
 * Default settings for new Codex config files
 */
export const DEFAULT_CODEX_SETTINGS: CodexSettings = {
  sync: {
    enabled: false,
    provider: 'icloud',
  },
  s3Sync: {
    enabled: false,
    autoSync: false,
  },
}

/**
 * Validation helpers
 */
export function isValidCodexConfig(config: any): config is CodexConfig {
  return (
    typeof config === 'object'
    && config !== null
    && typeof config.name === 'string'
    && config.name.length > 0
  )
}

/**
 * Create a new Codex config with defaults
 */
export function createCodexConfig(
  name: string,
  options: Partial<CodexConfig> = {},
): CodexConfig {
  return {
    id: crypto.randomUUID(),
    name,
    enabled: true,
    isDefault: false,
    order: 0,
    isDeleted: false,
    ...options,
  }
}
