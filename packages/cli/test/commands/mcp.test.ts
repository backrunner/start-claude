import { describe, expect, it } from 'vitest'
import { parseMcpServerConfig } from '../../src/commands/mcp'

describe('parseMcpServerConfig', () => {
  it('accepts valid stdio and remote server configurations', () => {
    expect(parseMcpServerConfig({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'server'],
      env: { API_KEY: 'secret' },
      description: 'Example server',
    })).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'server'],
      env: { API_KEY: 'secret' },
      url: undefined,
      headers: undefined,
      description: 'Example server',
    })

    expect(parseMcpServerConfig({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    })).toMatchObject({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    })
  })

  it.each([null, [], 'stdio', 1])('rejects non-object input: %j', (value) => {
    expect(() => parseMcpServerConfig(value)).toThrow('Configuration must be a JSON object.')
  })

  it.each([
    [{ type: 'stdio', command: '' }, 'Missing "command" field'],
    [{ type: 'http', url: '   ' }, 'Missing "url" field'],
    [{ type: 'invalid', command: 'node' }, 'Invalid or missing "type" field'],
    [{ type: 'stdio', command: 'node', args: ['ok', 1] }, '"args" field must be an array of strings'],
    [{ type: 'stdio', command: 'node', env: { PORT: 3000 } }, '"env" field must be an object with string values'],
    [{ type: 'http', url: 'https://example.com', headers: [] }, '"headers" field must be an object with string values'],
    [{ type: 'stdio', command: 'node', description: true }, '"description" field must be a string'],
  ])('rejects an invalid server configuration', (value, message) => {
    expect(() => parseMcpServerConfig(value)).toThrow(message as string)
  })
})
