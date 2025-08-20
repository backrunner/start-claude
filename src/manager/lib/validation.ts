import { z } from 'zod'

// Claude configuration validation schema
export const claudeConfigSchema = z.object({
  name: z.string().min(1, 'Configuration name is required').max(100, 'Name too long'),
  profileType: z.enum(['default', 'official']).optional(),
  baseUrl: z.string().url('Invalid base URL').optional().or(z.literal('')),
  apiKey: z.string().min(1, 'API key is required').optional().or(z.literal('')),
  model: z.string().optional(),
  permissionMode: z.enum(['default', 'acceptEdits', 'plan', 'bypassPermissions']).optional(),
  transformerEnabled: z.boolean().optional().default(false),
  transformer: z.string().optional().default('auto'),
  isDefault: z.boolean().optional().default(false),
  order: z.number().int().min(0).optional(),
  enabled: z.boolean().optional().default(true),

  // Environment variables
  authToken: z.string().optional(),
  customHeaders: z.string().optional(),
  smallFastModel: z.string().optional(),
  smallFastModelAwsRegion: z.string().optional(),
  awsBearerTokenBedrock: z.string().optional(),
  bashDefaultTimeoutMs: z.number().int().min(1000).max(600000).optional(),
  bashMaxTimeoutMs: z.number().int().min(1000).max(3600000).optional(),
  bashMaxOutputLength: z.number().int().min(1).optional(),
  maintainProjectWorkingDir: z.boolean().optional(),
  apiKeyHelperTtlMs: z.number().int().min(0).optional(),
  ideSkipAutoInstall: z.boolean().optional(),
  maxOutputTokens: z.number().int().min(1).max(1000000).optional(),
  useBedrock: z.boolean().optional(),
  useVertex: z.boolean().optional(),
  skipBedrockAuth: z.boolean().optional(),
  skipVertexAuth: z.boolean().optional(),
  disableNonessentialTraffic: z.boolean().optional(),
  disableTerminalTitle: z.boolean().optional(),
  disableAutoupdater: z.boolean().optional(),
  disableBugCommand: z.boolean().optional(),
  disableCostWarnings: z.boolean().optional(),
  disableErrorReporting: z.boolean().optional(),
  disableNonEssentialModelCalls: z.boolean().optional(),
  disableTelemetry: z.boolean().optional(),
  httpProxy: z.string().url().optional().or(z.literal('')),
  httpsProxy: z.string().url().optional().or(z.literal('')),
  maxThinkingTokens: z.number().int().min(0).optional(),
  mcpTimeout: z.number().int().min(1000).optional(),
  mcpToolTimeout: z.number().int().min(1000).optional(),
  maxMcpOutputTokens: z.number().int().min(1).optional(),
  vertexRegionHaiku: z.string().optional(),
  vertexRegionSonnet: z.string().optional(),
  vertexRegion37Sonnet: z.string().optional(),
  vertexRegion40Opus: z.string().optional(),
  vertexRegion40Sonnet: z.string().optional(),
}).refine((data) => {
  // If baseUrl is provided, apiKey should also be provided for balance mode
  if (data.baseUrl && data.baseUrl !== '') {
    return data.apiKey && data.apiKey !== ''
  }
  return true
}, {
  message: 'API key is required when base URL is provided',
  path: ['apiKey'],
})

// S3 sync configuration schema
export const s3SyncSchema = z.object({
  bucket: z.string().min(1, 'S3 bucket name is required'),
  region: z.string().min(1, 'S3 region is required'),
  accessKeyId: z.string().min(1, 'Access Key ID is required'),
  secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
  key: z.string().min(1, 'S3 key (filename) is required').default('configs.json'),
  endpointUrl: z.string().url('Invalid endpoint URL').optional().or(z.literal('')),
})

// Balance mode configuration schema
export const balanceModeSchema = z.object({
  enableByDefault: z.boolean().default(false),
  strategy: z.enum(['Fallback', 'Polling', 'Speed First']).default('Fallback'),
  healthCheck: z.object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().int().min(10000).max(300000).default(30000), // 10s to 5min
  }),
  failedEndpoint: z.object({
    banDurationSeconds: z.number().int().min(60).max(3600).default(300), // 1min to 1hour
  }),
  speedFirst: z.object({
    responseTimeWindowMs: z.number().int().min(60000).max(3600000).default(300000), // 1min to 1hour
    minSamples: z.number().int().min(1).max(20).default(2), // 1 to 20 samples, reduced default
  }).optional(),
})

// Sync configuration schema
export const syncConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['icloud', 'onedrive', 'custom']),
  cloudPath: z.string().optional(),
  customPath: z.string().optional(),
  linkedAt: z.string(),
  lastVerified: z.string().optional(),
}).optional()

// System settings schema
export const systemSettingsSchema = z.object({
  overrideClaudeCommand: z.boolean().default(false),
  balanceMode: balanceModeSchema.optional(),
  sync: syncConfigSchema,
  s3Sync: s3SyncSchema.optional(),
})

// API request schemas
export const configCreateRequestSchema = z.object({
  config: claudeConfigSchema,
})

export const configUpdateRequestSchema = z.object({
  configs: z.array(claudeConfigSchema).min(0),
})

export const settingsUpdateRequestSchema = z.object({
  settings: systemSettingsSchema,
})

// Type exports for use in components
export type ClaudeConfigInput = z.input<typeof claudeConfigSchema>
export type ClaudeConfigOutput = z.output<typeof claudeConfigSchema>
export type SystemSettingsInput = z.input<typeof systemSettingsSchema>
export type SystemSettingsOutput = z.output<typeof systemSettingsSchema>
