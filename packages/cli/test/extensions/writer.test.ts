import type { ClaudeConfig, ExtensionsLibrary, SystemSettings } from '../../src/config/types'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseMarkdownFrontmatter } from '../../src/extensions/frontmatter'
import { ExtensionsWriter } from '../../src/extensions/writer'

describe('ExtensionsWriter', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'start-claude-writer-'))
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it('updates managed skill frontmatter and preserves bundled resources', async () => {
    const originalContent = [
      '---',
      'name: code-review',
      'description: Old description',
      'user-invocable: false',
      '---',
      '',
      'Review the current change.',
    ].join('\n')
    const skillDir = join(projectRoot, '.claude', 'skills', 'code-review')
    mkdirSync(join(skillDir, 'scripts'), { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), originalContent)
    writeFileSync(join(skillDir, 'scripts', 'check.sh'), 'exit 0\n')

    const library = createLibrary()
    library.skills['code-review'] = {
      id: 'code-review',
      name: 'code-review',
      description: 'Review: current changes',
      content: originalContent,
      allowedTools: ['Read', 'Grep'],
    }

    const writer = new ExtensionsWriter(projectRoot)
    await writer.writeSkills(['code-review'], library)

    const written = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')
    const parsed = parseMarkdownFrontmatter(written)
    expect(parsed.attributes).toMatchObject({
      name: 'code-review',
      description: 'Review: current changes',
      'allowed-tools': 'Read, Grep',
      'user-invocable': false,
    })
    expect(parsed.body).toBe('Review the current change.')
    expect(readFileSync(join(skillDir, 'scripts', 'check.sh'), 'utf-8')).toBe('exit 0\n')

    await writer.writeSkills([], library)

    expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(false)
    expect(existsSync(join(skillDir, 'scripts', 'check.sh'))).toBe(true)
    expect(existsSync(join(projectRoot, '.claude', 'skills'))).toBe(true)
  })

  it('reconciles managed skill edits and renames without losing assets', () => {
    const originalContent = [
      '---',
      'name: old-skill',
      'description: Old description',
      '---',
      '',
      'Old instructions.',
    ].join('\n')
    const oldDir = join(projectRoot, '.claude', 'skills', 'old-skill')
    mkdirSync(join(oldDir, 'assets'), { recursive: true })
    writeFileSync(join(oldDir, 'SKILL.md'), originalContent)
    writeFileSync(join(oldDir, 'assets', 'prompt.txt'), 'asset')

    const previousLibrary = createLibrary()
    previousLibrary.skills['old-skill'] = {
      id: 'old-skill',
      name: 'old-skill',
      description: 'Old description',
      content: originalContent,
    }
    const nextLibrary = structuredClone(previousLibrary)
    nextLibrary.skills['old-skill'] = {
      id: 'old-skill',
      name: 'new-skill',
      description: 'New description',
      content: 'New instructions.',
    }

    const writer = new ExtensionsWriter(projectRoot)
    writer.reconcileLibraryChanges(previousLibrary, nextLibrary)

    const newDir = join(projectRoot, '.claude', 'skills', 'new-skill')
    expect(existsSync(oldDir)).toBe(false)
    expect(readFileSync(join(newDir, 'assets', 'prompt.txt'), 'utf-8')).toBe('asset')
    const parsed = parseMarkdownFrontmatter(readFileSync(join(newDir, 'SKILL.md'), 'utf-8'))
    expect(parsed.attributes).toMatchObject({
      name: 'new-skill',
      description: 'New description',
    })
    expect(parsed.body).toBe('New instructions.')

    writer.reconcileLibraryChanges(nextLibrary, createLibrary())
    expect(existsSync(join(newDir, 'SKILL.md'))).toBe(false)
    expect(existsSync(join(newDir, 'assets', 'prompt.txt'))).toBe(true)
  })

  it('supports safe SkillsCat directory names that contain spaces', async () => {
    const skillDir = join(projectRoot, '.claude', 'skills', 'Code Review')
    mkdirSync(join(skillDir, 'assets'), { recursive: true })
    const content = [
      '---',
      'name: Code Review',
      'description: Review code changes',
      '---',
      '',
      'Review the current change.',
    ].join('\n')
    writeFileSync(join(skillDir, 'SKILL.md'), content)
    writeFileSync(join(skillDir, 'assets', 'checklist.txt'), 'checklist')

    const library = createLibrary()
    library.skills['code-review'] = {
      id: 'code-review',
      name: 'Code Review',
      description: 'Review code changes',
      content,
    }

    await new ExtensionsWriter(projectRoot).writeSkills(['code-review'], library)

    expect(readFileSync(join(skillDir, 'assets', 'checklist.txt'), 'utf-8')).toBe('checklist')
    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')).toContain('name: Code Review')
  })

  it('does not overwrite native MCP changes that no longer match the library', () => {
    writeFileSync(join(projectRoot, '.mcp.json'), JSON.stringify({
      mcpServers: {
        linear: {
          command: 'externally-edited',
        },
      },
    }, null, 2))

    const previousLibrary = createLibrary()
    previousLibrary.mcpServers.linear = {
      id: 'linear',
      name: 'linear',
      type: 'stdio',
      command: 'npx',
    }

    new ExtensionsWriter(projectRoot).reconcileLibraryChanges(previousLibrary, createLibrary())

    const nativeConfig = JSON.parse(readFileSync(join(projectRoot, '.mcp.json'), 'utf-8'))
    expect(nativeConfig.mcpServers.linear.command).toBe('externally-edited')
  })

  it('reconciles managed subagent edits, renames, and deletions', () => {
    const agentsDir = join(projectRoot, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'old-agent.md'), [
      '---',
      'name: old-agent',
      'description: Old agent',
      'tools:',
      '  - Read',
      '  - Grep',
      'model: sonnet',
      '---',
      '',
      'Inspect the old implementation.',
    ].join('\n'))

    const previousLibrary = createLibrary()
    previousLibrary.subagents['old-agent'] = {
      id: 'old-agent',
      name: 'old-agent',
      description: 'Old agent',
      systemPrompt: 'Inspect the old implementation.',
      tools: ['Read', 'Grep'],
      model: 'sonnet',
    }
    const nextLibrary = structuredClone(previousLibrary)
    nextLibrary.subagents['old-agent'] = {
      id: 'old-agent',
      name: 'new-agent',
      description: 'New agent',
      systemPrompt: 'Inspect the new implementation.',
      tools: ['Read'],
      model: 'haiku',
    }

    const writer = new ExtensionsWriter(projectRoot)
    writer.reconcileLibraryChanges(previousLibrary, nextLibrary)

    expect(existsSync(join(agentsDir, 'old-agent.md'))).toBe(false)
    const nextFile = join(agentsDir, 'new-agent.md')
    const parsed = parseMarkdownFrontmatter(readFileSync(nextFile, 'utf-8'))
    expect(parsed.attributes).toMatchObject({
      name: 'new-agent',
      description: 'New agent',
      tools: 'Read',
      model: 'haiku',
    })
    expect(parsed.body).toBe('Inspect the new implementation.')

    writer.reconcileLibraryChanges(nextLibrary, createLibrary())
    expect(existsSync(nextFile)).toBe(false)
  })

  it('preserves externally edited subagent files when disabling them', async () => {
    const agentsDir = join(projectRoot, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    const agentFile = join(agentsDir, 'reviewer.md')
    writeFileSync(agentFile, [
      '---',
      'name: reviewer',
      'description: Edited outside Start Claude',
      '---',
      '',
      'External instructions.',
    ].join('\n'))

    const library = createLibrary()
    library.subagents.reviewer = {
      id: 'reviewer',
      name: 'reviewer',
      description: 'Managed description',
      systemPrompt: 'Managed instructions.',
    }

    await new ExtensionsWriter(projectRoot).writeSubagents([], library)

    expect(existsSync(agentFile)).toBe(true)
  })

  it('validates every output before modifying existing files', async () => {
    const originalMcp = '{"mcpServers":{"keep":{"command":"keep"}}}'
    writeFileSync(join(projectRoot, '.mcp.json'), originalMcp)

    const library = createLibrary()
    library.skills.unsafe = {
      id: 'unsafe',
      name: '../unsafe',
      description: 'Unsafe path',
      content: 'Do not write this.',
    }

    const profile: ClaudeConfig = {
      name: 'test',
      enabledExtensions: {
        skills: ['unsafe'],
      },
    }
    const settings: SystemSettings = {
      overrideClaudeCommand: false,
      extensionsLibrary: library,
    }

    await expect(new ExtensionsWriter(projectRoot).writeExtensions(profile, library, settings)).rejects.toThrow(
      'is not a safe cross-platform directory name',
    )
    expect(readFileSync(join(projectRoot, '.mcp.json'), 'utf-8')).toBe(originalMcp)
    expect(existsSync(join(projectRoot, 'unsafe'))).toBe(false)
  })
})

function createLibrary(): ExtensionsLibrary {
  return {
    mcpServers: {},
    skills: {},
    subagents: {},
  }
}
