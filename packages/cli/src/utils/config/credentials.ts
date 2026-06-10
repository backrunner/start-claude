import type { ClaudeConfig } from '../../config/types'

export function getConfigApiKey(config: ClaudeConfig): string | undefined {
  const apiKey = config.apiKey?.trim()
  if (apiKey) {
    return apiKey
  }

  const authToken = config.authToken?.trim()
  return authToken || undefined
}

export function hasConfigApiCredentials(config: ClaudeConfig): boolean {
  return Boolean(config.baseUrl?.trim() && getConfigApiKey(config))
}
