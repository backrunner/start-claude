import type { CodexConfig } from '../config/types'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CODEX_DIR = join(homedir(), '.codex')
const CONFIG_TOML_PATH = join(CODEX_DIR, 'config.toml')
const AUTH_JSON_PATH = join(CODEX_DIR, 'auth.json')

/**
 * Ensure .codex directory exists
 */
function ensureCodexDir(): void {
  if (!existsSync(CODEX_DIR)) {
    mkdirSync(CODEX_DIR, { recursive: true })
  }
}

/**
 * Convert CodexConfig to TOML format
 */
export function configToToml(config: CodexConfig): string {
  const lines: string[] = []

  // Basic model configuration
  if (config.model) {
    lines.push(`model = "${config.model}"`)
  }

  // Default settings for reasonable behavior
  lines.push('')
  lines.push('# Default settings')
  lines.push('approval_policy = "on-request"')
  lines.push('sandbox_mode = "workspace-write"')

  // Features section
  lines.push('')
  lines.push('[features]')
  lines.push('streamable_shell = true')
  lines.push('web_search_request = true')
  lines.push('view_image_tool = true')

  // Shell environment policy
  lines.push('')
  lines.push('[shell_environment_policy]')
  lines.push('include_only = ["PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL"]')

  // Sandbox workspace write settings
  lines.push('')
  lines.push('[sandbox_workspace_write]')
  lines.push('network_access = true')
  lines.push('exclude_tmpdir_env_var = false')
  lines.push('exclude_slash_tmp = false')

  return lines.join('\n')
}

/**
 * Create auth.json for API key authentication
 */
export function createAuthJson(config: CodexConfig): string {
  if (!config.apiKey) {
    throw new Error('API key is required for Codex configuration')
  }

  const auth = {
    api_key: config.apiKey,
  }

  // If custom base URL is provided, include it
  if (config.baseUrl) {
    Object.assign(auth, {
      base_url: config.baseUrl,
    })
  }

  return JSON.stringify(auth, null, 2)
}

/**
 * Write Codex configuration files to ~/.codex/
 */
export function writeCodexConfig(config: CodexConfig): void {
  ensureCodexDir()

  // Write config.toml
  const tomlContent = configToToml(config)
  writeFileSync(CONFIG_TOML_PATH, tomlContent, 'utf-8')

  // Write auth.json
  const authContent = createAuthJson(config)
  writeFileSync(AUTH_JSON_PATH, authContent, 'utf-8')
}

/**
 * Get paths for testing/debugging
 */
export function getCodexPaths(): { dir: string, configToml: string, authJson: string } {
  return {
    dir: CODEX_DIR,
    configToml: CONFIG_TOML_PATH,
    authJson: AUTH_JSON_PATH,
  }
}
