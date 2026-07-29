import type { ConfigFile } from '../../src/config/types'
import { describe, expect, it } from 'vitest'
import { pruneMissingExtensionReferences } from '../../src/extensions/references'

describe('pruneMissingExtensionReferences', () => {
  it('removes deleted extension IDs from defaults, explicit lists, and overrides', () => {
    const configFile: ConfigFile = {
      version: 1,
      settings: {
        overrideClaudeCommand: false,
        extensionsLibrary: {
          mcpServers: {
            keep: {
              id: 'keep',
              name: 'keep',
              type: 'stdio',
              command: 'keep',
            },
          },
          skills: {},
          subagents: {},
        },
        defaultEnabledExtensions: {
          mcpServers: ['keep', 'deleted', 'keep'],
          skills: ['deleted-skill'],
          subagents: [],
        },
      },
      configs: [
        {
          name: 'explicit',
          enabledExtensions: {
            mcpServers: ['keep', 'deleted'],
            skills: ['deleted-skill'],
          },
        },
        {
          name: 'overrides',
          enabledExtensions: {
            useGlobalDefaults: true,
            overrides: {
              mcpServers: {
                add: ['keep', 'deleted'],
                remove: ['deleted'],
              },
              skills: {
                add: ['deleted-skill'],
                remove: ['deleted-skill'],
              },
            },
          },
        },
      ],
    }

    pruneMissingExtensionReferences(configFile)

    expect(configFile.settings.defaultEnabledExtensions).toEqual({
      mcpServers: ['keep'],
      skills: [],
      subagents: [],
    })
    expect(configFile.configs[0].enabledExtensions).toMatchObject({
      mcpServers: ['keep'],
      skills: [],
    })
    expect(configFile.configs[1].enabledExtensions?.overrides).toEqual({
      mcpServers: {
        add: ['keep'],
        remove: [],
      },
      skills: {
        add: [],
        remove: [],
      },
    })
  })
})
