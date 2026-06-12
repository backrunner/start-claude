export type ExternalProductId = 'codex' | 'gemini'

export type ExternalAuthMode = 'api-key' | 'oauth' | 'vertex-ai'

export interface ExternalProductConfig {
  id?: string
  name: string
  authMode?: ExternalAuthMode
  baseUrl?: string
  apiKey?: string
  apiKeyEnvVar?: string
  model?: string
  wireApi?: 'responses' | 'chat'
  approvalPolicy?: 'untrusted' | 'on-request' | 'on-failure' | 'never'
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'
  googleCloudProject?: string
  googleCloudLocation?: string
  googleApplicationCredentials?: string
  isDefault?: boolean
  order?: number
  enabled?: boolean
  deletedAt?: string
  isDeleted?: boolean
  env?: Record<string, string>
}

export interface ExternalProductSettings {
  sync?: {
    enabled: boolean
    provider: 'icloud' | 'onedrive' | 'custom'
    cloudPath?: string
    customPath?: string
    linkedAt?: string
    lastVerified?: string
  }
}

export interface ExternalProductConfigFile {
  version: number
  configs: ExternalProductConfig[]
  settings: ExternalProductSettings
}

export interface ExternalProductDefinition {
  id: ExternalProductId
  title: string
  shortTitle: string
  description: string
  configDirName: string
  nativeConfigDirName: string
  cliCommand: string
  packageName: string
  docsUrl: string
  managerPath: string
  defaultModel: string
  defaultApiKeyEnvVar: string
  supportsBaseUrl: boolean
  supportsSandbox: boolean
  authModes: ExternalAuthMode[]
}

export const CURRENT_EXTERNAL_PRODUCT_CONFIG_VERSION = 1
