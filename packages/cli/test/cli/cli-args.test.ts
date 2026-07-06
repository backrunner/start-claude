import { afterEach, describe, expect, it } from 'vitest'
import type { ClaudeConfig } from '../../src/config/types'
import { buildClaudeArgs, buildCliOverrides, filterProcessArgs, parseBalanceStrategy, resolveStartConfigSelector } from '../../src/cli/common.ts'

describe('cLI argument filtering', () => {
  const originalArgv = process.argv

  afterEach(() => {
    // Restore original argv after each test
    process.argv = originalArgv
  })

  describe('filterProcessArgs', () => {
    it('should preserve file arguments', () => {
      process.argv = ['node', 'start-claude', 'file1.txt', 'file2.txt', '--some-unknown-flag']
      const result = filterProcessArgs()
      expect(result).toEqual(['file1.txt', 'file2.txt', '--some-unknown-flag'])
    })

    it('should filter config argument when provided', () => {
      process.argv = ['node', 'start-claude', '--config', 'myconfig', 'file.txt']
      const result = filterProcessArgs('myconfig')
      expect(result).toEqual(['file.txt'])
      expect(result).not.toContain('myconfig')
      expect(result).not.toContain('--config')
    })

    it('should filter multiple start-claude specific flags', () => {
      process.argv = [
        'node',
        'start-claude',
        '--config',
        'test-config',
        '--verbose',
        '--debug',
        '--model',
        'claude-sonnet-4-5-20250929',
        'remaining-file.txt',
      ]
      const result = filterProcessArgs('test-config')
      expect(result).toEqual(['remaining-file.txt'])
      expect(result).not.toContain('test-config')
      expect(result).not.toContain('claude-sonnet-4-5-20250929')
      expect(result).not.toContain('--verbose')
      expect(result).not.toContain('--debug')
    })

    it('should filter proxy command', () => {
      process.argv = ['node', 'start-claude', 'proxy', 'config1', 'config2']
      const result = filterProcessArgs()
      // filterProcessArgs filters 'proxy' command itself, but not the config names
      // Config names should be handled by filterProxyArgs in proxy command module
      expect(result).toEqual(['config1', 'config2'])
      expect(result).not.toContain('proxy')
    })

    it('should not drop prompt arguments after an explicit config selector', () => {
      process.argv = ['node', 'start-claude', '--config', 'myconfig', 'fix this bug']
      const selector = resolveStartConfigSelector(process.argv.slice(2), {
        optionConfig: 'myconfig',
        positionalConfig: 'fix this bug',
      })

      expect(selector).toEqual({ value: 'myconfig', source: 'option' })
      expect(filterProcessArgs(selector)).toEqual(['fix this bug'])
    })

    it('should preserve Claude flags whose names only share handled prefixes', () => {
      process.argv = [
        'node',
        'start-claude',
        '--debug-file',
        'debug.log',
        '--remote-control-session-name-prefix',
        'desk',
        'prompt.txt',
      ]

      expect(filterProcessArgs()).toEqual(['prompt.txt'])
    })

    it('should filter variadic and optional Claude values without using first matching index', () => {
      process.argv = [
        'node',
        'start-claude',
        '--add-dir',
        'same',
        'same',
        '--debug',
        'api',
        '--resume',
        'session-id',
        'prompt.txt',
      ]

      expect(filterProcessArgs()).toEqual(['prompt.txt'])
    })

    it('should preserve tmux prompts and inline tmux modes', () => {
      process.argv = ['node', 'start-claude', '--tmux', 'fix prompt']
      expect(filterProcessArgs({ source: 'none' })).toEqual(['fix prompt'])

      process.argv = ['node', 'start-claude', '--tmux=classic', 'fix prompt']
      expect(filterProcessArgs({ source: 'none' })).toEqual(['--tmux=classic', 'fix prompt'])
    })

    it('should keep bare positional prompts when they are not existing configs', () => {
      process.argv = ['node', 'start-claude', 'write tests']
      const selector = resolveStartConfigSelector(process.argv.slice(2), {
        positionalConfig: 'write tests',
        configExists: name => name === 'work',
      })

      expect(selector).toEqual({ source: 'none' })
      expect(filterProcessArgs(selector)).toEqual(['write tests'])
    })
  })

  describe('parseBalanceStrategy', () => {
    it('should parse speedfirst strategy correctly', () => {
      const result = parseBalanceStrategy('speedfirst')
      expect(result).toEqual({ enabled: true, strategy: 'Speed First' })
    })

    it('should parse speed-first variant correctly', () => {
      const result = parseBalanceStrategy('speed-first')
      expect(result).toEqual({ enabled: true, strategy: 'Speed First' })
    })

    it('should parse polling strategy correctly', () => {
      const result = parseBalanceStrategy('polling')
      expect(result).toEqual({ enabled: true, strategy: 'Polling' })
    })

    it('should parse fallback strategy correctly', () => {
      const result = parseBalanceStrategy('fallback')
      expect(result).toEqual({ enabled: true, strategy: 'Fallback' })
    })

    it('should handle boolean true', () => {
      const result = parseBalanceStrategy(true)
      expect(result).toEqual({ enabled: true })
    })

    it('should handle boolean false', () => {
      const result = parseBalanceStrategy(false)
      expect(result).toEqual({ enabled: false })
    })

    it('should handle undefined', () => {
      const result = parseBalanceStrategy(undefined)
      expect(result).toEqual({ enabled: false })
    })

    it('should fallback to Fallback strategy for unknown values', () => {
      const result = parseBalanceStrategy('unknown-strategy')
      expect(result).toEqual({ enabled: true, strategy: 'Fallback' })
    })
  })

  describe('buildClaudeArgs', () => {
    it('should pass auto permission mode from config', () => {
      const config: ClaudeConfig = {
        name: 'auto-mode-config',
        permissionMode: 'auto',
      }

      expect(buildClaudeArgs({}, config)).toEqual(['--permission-mode', 'auto'])
    })

    it('should prefer CLI permission mode over config permission mode', () => {
      const config: ClaudeConfig = {
        name: 'auto-mode-config',
        permissionMode: 'auto',
      }

      expect(buildClaudeArgs({ permissionMode: 'dontAsk' }, config)).toEqual(['--permission-mode', 'dontAsk'])
    })

    it('should expand short model aliases', () => {
      expect(buildClaudeArgs({ model: 'gpt' })).toEqual(['--model', 'gpt-5.5'])
      expect(buildClaudeArgs({ model: 'Opus' })).toEqual(['--model', 'claude-opus-4-8[1m]'])
      expect(buildClaudeArgs({ model: 'fable' })).toEqual(['--model', 'claude-fable-5[1m]'])
      expect(buildClaudeArgs({ model: 'deepseek' })).toEqual(['--model', 'deepseek-v4-pro'])
      expect(buildClaudeArgs({ model: 'kimi-highspeed' })).toEqual(['--model', 'kimi-k2.7-code-highspeed'])
      expect(buildClaudeArgs({ model: 'glm' })).toEqual(['--model', 'glm-5.2'])
    })

    it('should expand CLI override model aliases', () => {
      expect(buildCliOverrides({ model: 'sonnet' }).model).toBe('claude-sonnet-5[1m]')
      expect(buildCliOverrides({ model: 'gpt-4.1' }).model).toBe('gpt-4.1')
    })

    it('should build latest Claude optional and variadic args', () => {
      expect(buildClaudeArgs({
        addDir: ['src', 'tests'],
        allowedTools: ['Bash(git *)', 'Edit'],
        debug: 'api,hooks',
        resume: 'session-id',
        fromPr: '123',
        sessionPersistence: false,
        pluginDir: ['plugins/a', 'plugins/b'],
      })).toEqual([
        '--add-dir',
        'src',
        'tests',
        '--allowedTools',
        'Bash(git *)',
        'Edit',
        '-d',
        'api,hooks',
        '--from-pr',
        '123',
        '--no-session-persistence',
        '--plugin-dir',
        'plugins/a',
        '--plugin-dir',
        'plugins/b',
        '--resume',
        'session-id',
      ])
    })
  })
})
