import type { LLMProvider, UnifiedChatRequest } from './llm'

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

export interface Transformer {
  transformRequestIn?: (
    request: UnifiedChatRequest,
    provider: LLMProvider
  ) => Promise<Record<string, any>>
  transformResponseIn?: (response: Response, context?: TransformerContext) => Promise<Response>

  // 将请求格式转换为通用的格式
  transformRequestOut?: (request: any) => Promise<UnifiedChatRequest>
  // 将相应格式转换为通用的格式
  transformResponseOut?: (response: Response) => Promise<Response>

  endPoint?: string
  name?: string
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
