import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { McpSyncManager } from '../../src/utils/mcp/sync-manager'

describe('McpSyncManager', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'start-claude-mcp-sync-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('preserves server names and prefers ~/.claude.json over legacy settings', () => {
    const modernPath = join(tempDir, '.claude.json')
    const legacyPath = join(tempDir, '.claude', 'settings.json')
    mkdirSync(join(tempDir, '.claude'), { recursive: true })

    writeFileSync(legacyPath, JSON.stringify({
      mcpServers: {
        shared: {
          command: 'legacy-command',
        },
        legacy: {
          command: 'legacy-only',
        },
      },
    }))
    writeFileSync(modernPath, JSON.stringify({
      mcpServers: {
        shared: {
          type: 'http',
          url: 'https://example.com/mcp',
        },
        invalid: {
          type: 'stdio',
        },
      },
    }))

    const manager = new McpSyncManager({
      claudeCodeConfigPath: modernPath,
      claudeCodeLegacySettingsPath: legacyPath,
    })

    expect(manager.extractMcpFromClaudeCodeSettings()).toEqual({
      shared: {
        type: 'http',
        url: 'https://example.com/mcp',
      },
      legacy: {
        command: 'legacy-only',
      },
    })
  })

  it('keeps valid servers when another Claude Code config is malformed', () => {
    const modernPath = join(tempDir, '.claude.json')
    const legacyPath = join(tempDir, '.claude', 'settings.json')
    mkdirSync(join(tempDir, '.claude'), { recursive: true })
    writeFileSync(legacyPath, '{ invalid json')
    writeFileSync(modernPath, JSON.stringify({
      mcpServers: {
        valid: {
          command: 'valid-command',
        },
      },
    }))

    const manager = new McpSyncManager({
      claudeCodeConfigPath: modernPath,
      claudeCodeLegacySettingsPath: legacyPath,
    })

    expect(manager.extractMcpFromClaudeCodeSettings()).toEqual({
      valid: {
        command: 'valid-command',
      },
    })
  })
})
