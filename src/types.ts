export interface ClaudeConfig {
  name: string
  baseUrl?: string
  apiKey?: string
  model?: string
  isDefault?: boolean
  description?: string
}

export interface ConfigFile {
  configs: ClaudeConfig[]
  settings: {
    overrideClaudeCommand: boolean
  }
}
