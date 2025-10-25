import type { LLMChatRequest, LLMProvider } from './llm'

export interface TransformerOptions {
  [key: string]: any
}

interface TransformerWithStaticName {
  new (options?: TransformerOptions): Transformer
  TransformerName?: string
}

export type TransformerConstructor = TransformerWithStaticName

export interface TransformerContext {
  [key: string]: any
}

export interface NormalizeResult {
  body: Record<string, any>
  config: {
    url: URL
    headers: Record<string, string>
  }
}

export interface Transformer {
  // Convert LLMChatRequest to intermediate format (Claude → Unified)
  normalizeRequest?: (
    request: LLMChatRequest,
    provider: LLMProvider
  ) => Promise<NormalizeResult>

  // Convert intermediate format to provider-specific format (Unified → Provider)
  formatRequest?: (request: Record<string, any>) => Promise<Record<string, any>>

  // Convert provider response back to unified format
  normalizeResponse?: (response: Response, context?: TransformerContext) => Promise<Response>

  // Additional response transformation for the provider
  formatResponse?: (response: Response) => Promise<Response>

  domain?: string // Domain this transformer should handle (e.g., 'api.openai.com')
  isDefault?: boolean // Whether this transformer is the default fallback
  auth?: (request: any, provider: LLMProvider) => Promise<any>
}

export interface TransformerConfig {
  name: string
  type: 'class' | 'module'
  path?: string
  options?: TransformerOptions
}

export interface ProxyMode {
  enableLoadBalance?: boolean
  enableTransform?: boolean
  transformers?: string[]
  verbose?: boolean
  debug?: boolean
}

export interface ProxyConfig {
  name: string
  profileType?: 'default' | 'official'
  baseUrl?: string
  apiKey?: string
  model?: string
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  isDefault?: boolean
  order?: number
  // Proxy configuration
  proxyMode?: ProxyMode
  transformers?: TransformerConfig[]
  // Environment variables for Claude Code
  authToken?: string
  authorization?: string
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
  vertexRegion45Sonnet?: string
}
