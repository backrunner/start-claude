import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Get the current directory path that works in both ESM and CommonJS environments
 * For ESM: uses import.meta.url to get current file URL, then converts to path and gets directory
 * For CJS: gets transformed by bundler to use __filename appropriately
 */
export function getCurrentDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}
