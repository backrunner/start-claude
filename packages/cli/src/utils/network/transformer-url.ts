/**
 * Utility functions for handling URLs in transformers
 */

/**
 * Creates a URL by properly appending a path to a base URL.
 * Ensures the base URL is treated as a directory by adding a trailing slash if needed.
 *
 * @param path - The path to append (e.g., 'v1/chat/completions')
 * @param baseUrl - The base URL (e.g., 'https://api.openai.com' or 'https://openrouter.ai/api')
 * @param fallbackBaseUrl - Optional fallback URL if baseUrl is undefined
 * @returns A properly constructed URL
 *
 * @example
 * createTransformerUrl('v1/chat/completions', 'https://openrouter.ai/api')
 * // Returns: https://openrouter.ai/api/v1/chat/completions
 *
 * createTransformerUrl('v1/chat/completions', 'https://api.openai.com/')
 * // Returns: https://api.openai.com/v1/chat/completions
 *
 * createTransformerUrl('v1/chat/completions', undefined, 'https://api.openai.com')
 * // Returns: https://api.openai.com/v1/chat/completions
 */
export function createTransformerUrl(path: string, baseUrl: string | undefined, fallbackBaseUrl?: string): URL {
  const effectiveBaseUrl = baseUrl || fallbackBaseUrl
  if (!effectiveBaseUrl) {
    throw new Error('Base URL is required for transformer URL construction')
  }

  // Ensure baseUrl ends with a slash to be treated as a directory
  const normalizedBaseUrl = `${effectiveBaseUrl.replace(/\/$/, '')}/`
  return new URL(path, normalizedBaseUrl)
}
