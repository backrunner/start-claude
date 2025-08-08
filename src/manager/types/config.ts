export interface ClaudeConfig {
  name: string
  profileType?: 'default' | 'official'
  baseUrl?: string
  apiKey?: string
  model?: string
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  isDefault?: boolean
  order?: number // Lower numbers are prioritized first (0 = highest priority)
  enabled?: boolean

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

export interface SystemSettings {
  overrideClaudeCommand: boolean
  balanceMode?: {
    enableByDefault: boolean
    healthCheck: {
      enabled: boolean
      intervalMs: number
    }
    failedEndpoint: {
      banDurationSeconds: number
    }
  }
  s3Sync?: {
    bucket: string
    region: string
    accessKeyId: string
    secretAccessKey: string
    key: string
    endpointUrl?: string
  }
}

export interface ConfigFile {
  configs: ClaudeConfig[]
  settings: SystemSettings
}
