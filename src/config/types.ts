export interface ClaudeConfig {
  name: string
  profileType?: 'default' | 'official'
  baseUrl?: string
  apiKey?: string
  model?: string
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  transformerEnabled?: boolean // Enable transformer for this configuration
  transformer?: string // Specific transformer to use: "auto", "openai", "gemini", "openrouter", etc.
  isDefault?: boolean
  order?: number // Lower numbers are prioritized first (0 = highest priority)
  enabled?: boolean // Configuration is enabled/disabled
  deletedAt?: string // ISO timestamp when config was deleted, for soft deletion tracking
  isDeleted?: boolean // Simple flag to mark config as deleted (tombstone)

  // Environment variables for Claude Code
  authToken?: string
  customHeaders?: string
  smallFastModel?: string
  smallFastModelAwsRegion?: string
  awsBearerTokenBedrock?: string
  bashDefaultTimeoutMs?: number
  bashMaxTimeoutMs?: number
  bashMaxOutputLength?: number
  maintainProjectWorkingDir?: boolean
  apiKeyHelperTtlMs?: number
  ideSkipAutoInstall?: boolean
  maxOutputTokens?: number
  useBedrock?: boolean
  useVertex?: boolean
  skipBedrockAuth?: boolean
  skipVertexAuth?: boolean
  disableNonessentialTraffic?: boolean
  disableTerminalTitle?: boolean
  disableAutoupdater?: boolean
  disableBugCommand?: boolean
  disableCostWarnings?: boolean
  disableErrorReporting?: boolean
  disableNonEssentialModelCalls?: boolean
  disableTelemetry?: boolean
  httpProxy?: string
  httpsProxy?: string
  maxThinkingTokens?: number
  mcpTimeout?: number
  mcpToolTimeout?: number
  maxMcpOutputTokens?: number
  vertexRegionHaiku?: string
  vertexRegionSonnet?: string
  vertexRegion37Sonnet?: string
  vertexRegion40Opus?: string
  vertexRegion40Sonnet?: string
}

/**
 * Load balancer strategy types
 */
export type LoadBalancerStrategy = 'Fallback' | 'Polling' | 'Speed First'

/**
 * Status line configuration interface
 */
export interface StatusLineConfig {
  enabled: boolean
  config?: {
    // ccstatusline configuration
    [key: string]: any
  }
}

/**
 * System settings interface
 */
export interface SystemSettings {
  overrideClaudeCommand: boolean
  statusLine?: StatusLineConfig
  balanceMode?: {
    enableByDefault: boolean
    strategy: LoadBalancerStrategy
    healthCheck: {
      enabled: boolean
      intervalMs: number
    }
    failedEndpoint: {
      banDurationSeconds: number
    }
    speedFirst?: {
      responseTimeWindowMs: number // Time window for calculating average response times
      minSamples: number // Minimum number of samples before reordering
    }
  }
  s3Sync?: {
    bucket: string
    region: string
    accessKeyId: string
    secretAccessKey: string
    key: string
    endpointUrl?: string
    remoteConfigCheckIntervalMinutes?: number // Default: 60 (1 hour)
  }
}

/**
 * Versioned configuration file structure
 */
export interface ConfigFile {
  version: number
  configs: ClaudeConfig[]
  settings: SystemSettings
}

/**
 * Legacy configuration file (pre-versioning)
 */
export interface LegacyConfigFile {
  configs: ClaudeConfig[]
  settings: {
    overrideClaudeCommand: boolean
    s3Sync?: {
      bucket: string
      region: string
      accessKeyId: string
      secretAccessKey: string
      key: string
      endpointUrl?: string
    }
  }
}

/**
 * Current configuration file version
 */
export const CURRENT_CONFIG_VERSION = 2

/**
 * Migration information interface
 */
export interface MigrationInfo {
  fromVersion: number
  toVersion: number
  description: string
  timestamp: number
}
