import type { ClaudeConfig } from './types'
import { spawn } from 'node:child_process'

import process from 'node:process'

export async function startClaude(config: ClaudeConfig, args: string[] = []): Promise<number> {
  return new Promise((resolve) => {
    const env = { ...process.env }

    if (config.baseUrl !== undefined && config.baseUrl.length > 0) {
      env.ANTHROPIC_BASE_URL = config.baseUrl
    }

    if (config.apiKey !== undefined && config.apiKey.length > 0) {
      env.ANTHROPIC_API_KEY = config.apiKey
    }

    if (config.model !== undefined && config.model.length > 0) {
      env.ANTHROPIC_MODEL = config.model
    }

    const claude = spawn('claude', args, {
      stdio: 'inherit',
      env,
    })

    claude.on('close', (code) => {
      resolve(code ?? 0)
    })

    claude.on('error', (error) => {
      console.error('Failed to start Claude:', error.message)
      resolve(1)
    })
  })
}
