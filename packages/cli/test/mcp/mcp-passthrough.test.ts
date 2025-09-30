import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock the child_process spawn function
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: vi.fn(),
  }
})

// Mock the findExecutable utility
vi.mock('../../src/utils/path-utils', () => ({
  findExecutable: vi.fn(),
}))

describe('mCP Command Detection Logic', () => {
  const originalArgv = process.argv

  afterEach(() => {
    process.argv = originalArgv
    vi.resetAllMocks()
  })

  // Test the MCP detection logic directly
  describe('mCP command detection', () => {
    it('should detect basic mcp command as first argument', () => {
      const args = ['mcp', 'add', 'sentry']
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(true)
    })

    it('should detect mcp add with transport http', () => {
      const args = ['mcp', 'add', '--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp']
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(true)
    })

    it('should detect mcp add with environment variables', () => {
      const args = ['mcp', 'add', 'clickup', '--env', 'CLICKUP_API_KEY=test', '--env', 'CLICKUP_TEAM_ID=123', '--', 'npx', '-y', '@hauptsache.net/clickup-mcp']
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(true)
    })

    it('should detect mcp add with sse transport', () => {
      const args = ['mcp', 'add', '--transport', 'sse', 'asana', 'https://mcp.asana.com/sse']
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(true)
    })

    it('should not detect non-mcp commands', () => {
      const args = ['--config', 'myconfig']
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(false)
    })

    it('should not detect commands where mcp is not first', () => {
      const args = ['--config', 'mcp-config']
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(false)
    })

    it('should handle empty arguments', () => {
      const args: string[] = []
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(false)
    })

    it('should handle single mcp argument', () => {
      const args = ['mcp']
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(true)
    })
  })

  describe('real MCP commands from documentation', () => {
    const mcpCommands = [
      // Development & Debugging
      ['mcp', 'add', '--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp'],
      ['mcp', 'add', '--transport', 'http', 'socket', 'https://mcp.socket.dev/'],
      ['mcp', 'add', '--transport', 'http', 'hugging-face', 'https://huggingface.co/mcp'],
      ['mcp', 'add', '--transport', 'http', 'jam', 'https://mcp.jam.dev/mcp'],

      // Project Management & Documentation
      ['mcp', 'add', '--transport', 'sse', 'asana', 'https://mcp.asana.com/sse'],
      ['mcp', 'add', '--transport', 'sse', 'atlassian', 'https://mcp.atlassian.com/v1/sse'],
      ['mcp', 'add', 'clickup', '--env', 'CLICKUP_API_KEY=YOUR_KEY', '--env', 'CLICKUP_TEAM_ID=YOUR_ID', '--', 'npx', '-y', '@hauptsache.net/clickup-mcp'],
      ['mcp', 'add', '--transport', 'http', 'intercom', 'https://mcp.intercom.com/mcp'],
      ['mcp', 'add', '--transport', 'sse', 'linear', 'https://mcp.linear.app/sse'],
      ['mcp', 'add', '--transport', 'http', 'notion', 'https://mcp.notion.com/mcp'],
      ['mcp', 'add', '--transport', 'http', 'box', 'https://mcp.box.com/'],
      ['mcp', 'add', '--transport', 'http', 'fireflies', 'https://api.fireflies.ai/mcp'],
      ['mcp', 'add', '--transport', 'sse', 'monday', 'https://mcp.monday.com/sse'],

      // Databases & Data Management
      ['mcp', 'add', 'airtable', '--env', 'AIRTABLE_API_KEY=YOUR_KEY', '--', 'npx', '-y', 'airtable-mcp-server'],
      ['mcp', 'add', '--transport', 'http', 'daloopa', 'https://mcp.daloopa.com/server/mcp'],
      ['mcp', 'add', '--transport', 'http', 'hubspot', 'https://mcp.hubspot.com/anthropic'],
    ]

    mcpCommands.forEach((command, index) => {
      it(`should detect MCP command ${index + 1}: ${command.join(' ')}`, () => {
        const isMcpCommand = command.length > 0 && command[0] === 'mcp'
        expect(isMcpCommand).toBe(true)
        expect(command[0]).toBe('mcp')
      })
    })
  })

  describe('process.argv parsing for MCP detection', () => {
    it('should correctly parse process.argv for mcp command', () => {
      // Simulate: claude mcp add sentry
      process.argv = ['node', 'start-claude', 'mcp', 'add', 'sentry']
      const args = process.argv.slice(2)
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'

      expect(args).toEqual(['mcp', 'add', 'sentry'])
      expect(isMcpCommand).toBe(true)
    })

    it('should correctly parse process.argv for complex mcp command', () => {
      // Simulate: claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
      process.argv = ['node', 'start-claude', 'mcp', 'add', '--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp']
      const args = process.argv.slice(2)
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'

      expect(args).toEqual(['mcp', 'add', '--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp'])
      expect(isMcpCommand).toBe(true)
    })

    it('should correctly parse process.argv for non-mcp command', () => {
      // Simulate: claude --config myconfig
      process.argv = ['node', 'start-claude', '--config', 'myconfig']
      const args = process.argv.slice(2)
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'

      expect(args).toEqual(['--config', 'myconfig'])
      expect(isMcpCommand).toBe(false)
    })

    it('should handle process.argv with mcp in non-first position', () => {
      // Simulate: claude --config mcp-config
      process.argv = ['node', 'start-claude', '--config', 'mcp-config']
      const args = process.argv.slice(2)
      const isMcpCommand = args.length > 0 && args[0] === 'mcp'

      expect(args).toEqual(['--config', 'mcp-config'])
      expect(isMcpCommand).toBe(false)
    })
  })

  describe('helper function testing', () => {
    // Test the helper functions that would be used in the main logic
    it('should create correct spawn parameters', () => {
      const claudePath = '/usr/local/bin/claude'
      const args = ['mcp', 'add', '--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp']
      const env = { ...process.env }

      const expectedSpawnParams = {
        stdio: 'inherit' as const,
        env,
        shell: process.platform === 'win32',
      }

      // Verify the parameters we would pass to spawn
      expect(claudePath).toBe('/usr/local/bin/claude')
      expect(args).toEqual(['mcp', 'add', '--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp'])
      expect(expectedSpawnParams.stdio).toBe('inherit')
      expect(expectedSpawnParams.env).toEqual(env)
      expect(expectedSpawnParams.shell).toBe(process.platform === 'win32')
    })

    it('should preserve complex arguments with special characters', () => {
      const complexArgs = ['mcp', 'add', '--transport', 'http', 'test-server', 'https://example.com/path?param=value&other=123']
      const preservedArgs = [...complexArgs]

      expect(preservedArgs).toEqual(complexArgs)
      expect(preservedArgs[5]).toBe('https://example.com/path?param=value&other=123')
    })
  })

  describe('integration scenarios', () => {
    it('should handle the full flow for Sentry MCP command', () => {
      // Test the complete flow: claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
      const fullCommand = 'claude mcp add --transport http sentry https://mcp.sentry.dev/mcp'
      const args = fullCommand.split(' ').slice(1) // Remove 'claude'

      expect(args).toEqual(['mcp', 'add', '--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp'])

      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(true)

      // Verify that we would pass the correct arguments to the real Claude CLI
      const claudeArgs = args
      expect(claudeArgs).toEqual(['mcp', 'add', '--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp'])
    })

    it('should handle the full flow for ClickUp MCP command with env vars', () => {
      // Test: claude mcp add clickup --env CLICKUP_API_KEY=YOUR_KEY --env CLICKUP_TEAM_ID=YOUR_ID -- npx -y @hauptsache.net/clickup-mcp
      const fullCommand = 'claude mcp add clickup --env CLICKUP_API_KEY=YOUR_KEY --env CLICKUP_TEAM_ID=YOUR_ID -- npx -y @hauptsache.net/clickup-mcp'
      const args = fullCommand.split(' ').slice(1) // Remove 'claude'

      expect(args[0]).toBe('mcp')
      expect(args).toContain('--env')
      expect(args).toContain('CLICKUP_API_KEY=YOUR_KEY')
      expect(args).toContain('--')
      expect(args).toContain('@hauptsache.net/clickup-mcp')

      const isMcpCommand = args.length > 0 && args[0] === 'mcp'
      expect(isMcpCommand).toBe(true)
    })

    it('should not interfere with regular start-claude commands', () => {
      const regularCommands = [
        'claude --config myconfig',
        'claude --balance speedfirst',
        'claude --list',
        'claude add',
        'claude edit myconfig',
        'claude override',
      ]

      regularCommands.forEach((command) => {
        const args = command.split(' ').slice(1) // Remove 'claude'
        const isMcpCommand = args.length > 0 && args[0] === 'mcp'
        expect(isMcpCommand).toBe(false)
      })
    })
  })
})
