export interface ClaudeConfig {
  name: string
  profileType?: 'default' | 'official'
  baseUrl?: string
  apiKey?: string
  model?: string
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  transformerEnabled?: boolean // Enable transformer for this configuration
  transformer?: string // Specific transformer to use: "auto", "openai", "gemini", "openrouter", etc.
  transformerHeaders?: Record<string, string> // Additional headers to send when using transformers
  isDefault?: boolean
  order?: number // Lower numbers are prioritized first (0 = highest priority)
  enabled?: boolean // Configuration is enabled/disabled
  deletedAt?: string // ISO timestamp when config was deleted, for soft deletion tracking
  isDeleted?: boolean // Simple flag to mark config as deleted (tombstone)

  // Environment variables map - conflicts resolved by individual properties taking precedence
  env?: Record<string, string>

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
 * Speed test strategy types
 */
export enum SpeedTestStrategy {
  ResponseTime = 'response-time', // Default: Send minimal request and measure response time
  HeadRequest = 'head-request', // Send HEAD request to measure network latency
  Ping = 'ping', // Use ping-like approach to measure connection time
}

/**
 * Load balancer strategy types
 */
export enum LoadBalancerStrategy {
  Fallback = 'Fallback',
  Polling = 'Polling',
  SpeedFirst = 'Speed First',
}

export type LoadBalancerStrategyType = LoadBalancerStrategy

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
 * MCP server configuration interface
 */
export interface McpServerConfig {
  type?: 'stdio' | 'sse'
  command: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * MCP sync configuration interface
 */
export interface McpSyncConfig {
  enabled: boolean
  servers: Record<string, McpServerConfig>
  lastSyncTime?: string
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
      speedTestIntervalSeconds?: number // How often to perform speed tests in seconds (default: 300s = 5 minutes)
      speedTestStrategy?: SpeedTestStrategy // Strategy for speed testing (default: response-time)
    }
  }
  sync?: {
    enabled: boolean
    provider: 'icloud' | 'onedrive' | 'custom' | 's3'
    cloudPath?: string
    customPath?: string
    s3Config?: {
      bucket: string
      region: string
      key: string
      endpointUrl?: string
    }
    linkedAt: string
    lastVerified?: string
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
  mcpSync?: McpSyncConfig
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
 * Current S3 configuration file version
 */
export const CURRENT_S3_CONFIG_VERSION = 1

/**
 * S3 configuration file structure
 */
export interface S3ConfigFile {
  version: number
  s3Config: {
    bucket: string
    region: string
    accessKeyId: string
    secretAccessKey: string
    key: string
    endpointUrl?: string
    remoteConfigCheckIntervalMinutes?: number // Default: 60 (1 hour)
  }
  metadata: {
    createdAt: string
    lastModified: string
    migratedFrom?: 'system-settings' // Track if migrated from old location
  }
}

/**
 * Migration information interface
 */
export interface MigrationInfo {
  fromVersion: number
  toVersion: number
  description: string
  timestamp: number
}
