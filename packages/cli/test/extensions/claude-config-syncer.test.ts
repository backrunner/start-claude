import type { ExtensionsLibrary } from '../../src/config/types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeConfigSyncer } from '../../src/extensions/claude-config-syncer'

describe('ClaudeConfigSyncer', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'start-claude-syncer-'))
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it('updates existing extensions from native Claude config files', async () => {
    writeFileSync(join(projectRoot, '.mcp.json'), JSON.stringify({
      mcpServers: {
        linear: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@linear/mcp-server'],
          env: {
            LINEAR_API_KEY: '${LINEAR_API_KEY}',
          },
        },
      },
    }, null, 2))

    const skillsDir = join(projectRoot, '.claude', 'skills', 'code-review')
    mkdirSync(skillsDir, { recursive: true })
    writeFileSync(join(skillsDir, 'SKILL.md'), [
      '---',
      'name: code-review',
      'description: Review changed code paths',
      'allowed-tools: Read, Grep',
      '---',
      '',
      'Check changed files before suggesting fixes.',
    ].join('\n'))

    const agentsDir = join(projectRoot, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'planner.md'), [
      '---',
      'name: planner',
      'description: Plan implementation work',
      'tools: Read, Grep, Edit',
      'model: sonnet',
      '---',
      '',
      'Build a concise implementation plan.',
    ].join('\n'))

    const existingLibrary: ExtensionsLibrary = {
      mcpServers: {
        linear: {
          id: 'linear',
          name: 'linear',
          description: 'Keep this description',
          type: 'stdio',
          scope: 'user',
          command: 'old-linear',
          args: ['old'],
        },
      },
      skills: {
        'code-review': {
          id: 'code-review',
          name: 'code-review',
          description: 'Old description',
          content: 'old content',
        },
      },
      subagents: {
        planner: {
          id: 'planner',
          name: 'planner',
          description: 'Old agent',
          systemPrompt: 'old prompt',
        },
      },
    }

    const syncer = new ClaudeConfigSyncer(projectRoot)
    const { library, result, defaultEnabled } = await syncer.syncClaudeConfig(existingLibrary)

    expect(result.totalAdded).toBe(0)
    expect(result.totalUpdated).toBe(3)
    expect(result.totalChanged).toBe(3)
    expect(defaultEnabled).toEqual({
      mcpServers: [],
      skills: [],
      subagents: [],
    })

    expect(library.mcpServers.linear).toMatchObject({
      description: 'Keep this description',
      scope: 'user',
      command: 'npx',
      args: ['-y', '@linear/mcp-server'],
      env: {
        LINEAR_API_KEY: '${LINEAR_API_KEY}',
      },
    })
    expect(library.skills['code-review']).toMatchObject({
      description: 'Review changed code paths',
      allowedTools: ['Read', 'Grep'],
    })
    expect(library.skills['code-review'].content).toContain('Check changed files')
    expect(library.subagents.planner).toMatchObject({
      description: 'Plan implementation work',
      tools: ['Read', 'Grep', 'Edit'],
      model: 'sonnet',
    })
    expect(library.subagents.planner.systemPrompt.trim()).toBe('Build a concise implementation plan.')
  })

  it('does not overwrite a different extension when generated IDs collide', async () => {
    writeFileSync(join(projectRoot, '.mcp.json'), JSON.stringify({
      mcpServers: {
        linear: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@linear/mcp-server'],
        },
      },
    }, null, 2))

    const existingLibrary: ExtensionsLibrary = {
      mcpServers: {
        linear: {
          id: 'linear',
          name: 'different-server',
          type: 'stdio',
          command: 'keep-me',
        },
      },
      skills: {},
      subagents: {},
    }

    const syncer = new ClaudeConfigSyncer(projectRoot)
    const { library, result, defaultEnabled } = await syncer.syncClaudeConfig(existingLibrary)

    expect(result.mcpServersAdded).toBe(1)
    expect(result.mcpServersUpdated).toBe(0)
    expect(defaultEnabled.mcpServers).toEqual(['linear-2'])
    expect(library.mcpServers.linear).toMatchObject({
      name: 'different-server',
      command: 'keep-me',
    })
    expect(library.mcpServers['linear-2']).toMatchObject({
      name: 'linear',
      command: 'npx',
      args: ['-y', '@linear/mcp-server'],
    })
  })

  it('parses YAML frontmatter with CRLF, quoted values, and tool arrays', async () => {
    const skillsDir = join(projectRoot, '.claude', 'skills', 'code-review')
    mkdirSync(skillsDir, { recursive: true })
    const content = [
      '---',
      'name: code-review',
      'description: "Review: changed code paths"',
      'allowed-tools:',
      '  - Read',
      '  - Grep',
      '---',
      '',
      'Review the current change.',
    ].join('\r\n')
    writeFileSync(join(skillsDir, 'SKILL.md'), content)

    const syncer = new ClaudeConfigSyncer(projectRoot)
    const { library, result } = await syncer.syncClaudeConfig({
      mcpServers: {},
      skills: {},
      subagents: {},
    })

    expect(result.skillsAdded).toBe(1)
    expect(library.skills['code-review']).toMatchObject({
      description: 'Review: changed code paths',
      allowedTools: ['Read', 'Grep'],
      content,
    })
  })

  it('keeps library metadata when the native skill content has not changed', async () => {
    const skillsDir = join(projectRoot, '.claude', 'skills', 'code-review')
    mkdirSync(skillsDir, { recursive: true })
    const content = [
      '---',
      'name: code-review',
      'description: Old description',
      '---',
      '',
      'Review the current change.',
    ].join('\n')
    writeFileSync(join(skillsDir, 'SKILL.md'), content)

    const syncer = new ClaudeConfigSyncer(projectRoot)
    const { library, result } = await syncer.syncClaudeConfig({
      mcpServers: {},
      skills: {
        'code-review': {
          id: 'code-review',
          name: 'code-review',
          description: 'Edited in Start Claude',
          content,
        },
      },
      subagents: {},
    })

    expect(result.skillsUpdated).toBe(0)
    expect(library.skills['code-review'].description).toBe('Edited in Start Claude')
  })

  it('skips skills with unsafe frontmatter names', async () => {
    const skillsDir = join(projectRoot, '.claude', 'skills', 'unsafe-skill')
    mkdirSync(skillsDir, { recursive: true })
    writeFileSync(join(skillsDir, 'SKILL.md'), [
      '---',
      'name: ../unsafe',
      'description: Unsafe path',
      '---',
      '',
      'Do not import this skill.',
    ].join('\n'))

    const syncer = new ClaudeConfigSyncer(projectRoot)
    const { library, result } = await syncer.syncClaudeConfig({
      mcpServers: {},
      skills: {},
      subagents: {},
    })

    expect(result.skillsAdded).toBe(0)
    expect(library.skills).toEqual({})
  })

  it('skips malformed MCP entries without blocking valid servers', async () => {
    writeFileSync(join(projectRoot, '.mcp.json'), JSON.stringify({
      mcpServers: {
        broken: null,
        valid: {
          command: 'npx',
          args: ['-y', 'valid-mcp'],
        },
      },
    }))

    const syncer = new ClaudeConfigSyncer(projectRoot)
    const { library, result } = await syncer.syncClaudeConfig({
      mcpServers: {},
      skills: {},
      subagents: {},
    })

    expect(result.mcpServersAdded).toBe(1)
    expect(library.mcpServers.valid).toMatchObject({
      command: 'npx',
      args: ['-y', 'valid-mcp'],
    })
    expect(library.mcpServers.broken).toBeUndefined()
  })

  it('skips subagents with unsafe frontmatter names', async () => {
    const agentsDir = join(projectRoot, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'unsafe.md'), [
      '---',
      'name: ../unsafe',
      'description: Unsafe path',
      '---',
      '',
      'Do not import this subagent.',
    ].join('\n'))

    const syncer = new ClaudeConfigSyncer(projectRoot)
    const { library, result } = await syncer.syncClaudeConfig({
      mcpServers: {},
      skills: {},
      subagents: {},
    })

    expect(result.subagentsAdded).toBe(0)
    expect(library.subagents).toEqual({})
  })
})
