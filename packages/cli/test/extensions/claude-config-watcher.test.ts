import type { ExtensionsLibrary, SystemSettings } from '../../src/config/types'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ClaudeConfigWatcher } from '../../src/extensions/claude-config-watcher'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('ClaudeConfigWatcher', () => {
  it('reports newly imported extensions as default-enabled', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'start-claude-watcher-'))
    tempDirs.push(projectRoot)
    writeFileSync(join(projectRoot, '.mcp.json'), JSON.stringify({
      mcpServers: {
        imported: {
          command: 'npx',
          args: ['-y', 'imported-mcp'],
        },
      },
    }))

    const initialLibrary: ExtensionsLibrary = {
      mcpServers: {},
      skills: {},
      subagents: {},
    }
    let updatedLibrary: ExtensionsLibrary | undefined
    let addedDefaults: NonNullable<SystemSettings['defaultEnabledExtensions']> | undefined
    const watcher = new ClaudeConfigWatcher(projectRoot, undefined, { debounceMs: 0 })

    watcher.start(initialLibrary, (library, defaultEnabled) => {
      updatedLibrary = library
      addedDefaults = defaultEnabled
    })

    await (watcher as unknown as { performSync: () => Promise<void> }).performSync()
    watcher.stop()

    expect(updatedLibrary?.mcpServers.imported).toMatchObject({
      command: 'npx',
      args: ['-y', 'imported-mcp'],
    })
    expect(addedDefaults).toEqual({
      mcpServers: ['imported'],
      skills: [],
      subagents: [],
    })
  })
})
