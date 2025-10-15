import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { filterProxyArgs } from '../../src/commands/proxy'

describe('proxy command argument filtering', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    // Save original argv
  })

  afterEach(() => {
    // Restore original argv after each test
    process.argv = originalArgv
  })

  describe('filterProxyArgs', () => {
    it('should filter out proxy command', () => {
      process.argv = ['node', 'start-claude', 'proxy', 'config1']
      const result = filterProxyArgs()
      expect(result).toEqual([])
      expect(result).not.toContain('proxy')
      expect(result).not.toContain('config1')
    })

    it('should filter out proxy command and multiple config names', () => {
      process.argv = ['node', 'start-claude', 'proxy', 'config1', 'config2', 'config3']
      const result = filterProxyArgs()
      expect(result).toEqual([])
      expect(result).not.toContain('proxy')
      expect(result).not.toContain('config1')
      expect(result).not.toContain('config2')
      expect(result).not.toContain('config3')
    })

    it('should filter out --strategy flag and its value', () => {
      process.argv = ['node', 'start-claude', 'proxy', '--strategy', 'speedfirst', 'config1']
      const result = filterProxyArgs()
      expect(result).toEqual([])
      expect(result).not.toContain('--strategy')
      expect(result).not.toContain('speedfirst')
      expect(result).not.toContain('proxy')
    })

    it('should filter out --all flag', () => {
      process.argv = ['node', 'start-claude', 'proxy', '--all']
      const result = filterProxyArgs()
      expect(result).toEqual([])
      expect(result).not.toContain('proxy')
      expect(result).not.toContain('--all')
    })

    it('should filter out --skip-health-check flag', () => {
      process.argv = ['node', 'start-claude', 'proxy', '--skip-health-check', 'config1']
      const result = filterProxyArgs()
      expect(result).toEqual([])
      expect(result).not.toContain('--skip-health-check')
      expect(result).not.toContain('proxy')
    })

    it('should preserve other flags that should go to Claude Code', () => {
      process.argv = ['node', 'start-claude', 'proxy', '--verbose', '--debug', 'config1']
      const result = filterProxyArgs()
      expect(result).toEqual(['--verbose', '--debug'])
      expect(result).toContain('--verbose')
      expect(result).toContain('--debug')
      expect(result).not.toContain('proxy')
      expect(result).not.toContain('config1')
    })

    it('should handle complex proxy command with multiple flags', () => {
      process.argv = [
        'node',
        'start-claude',
        'proxy',
        '--strategy',
        'polling',
        '--verbose',
        '--skip-health-check',
        'config1',
        'config2',
      ]
      const result = filterProxyArgs()
      expect(result).toEqual(['--verbose'])
      expect(result).not.toContain('proxy')
      expect(result).not.toContain('--strategy')
      expect(result).not.toContain('polling')
      expect(result).not.toContain('--skip-health-check')
      expect(result).not.toContain('config1')
      expect(result).not.toContain('config2')
    })

    it('should handle proxy command without any config names', () => {
      process.argv = ['node', 'start-claude', 'proxy', '--all', '--strategy', 'fallback']
      const result = filterProxyArgs()
      expect(result).toEqual([])
      expect(result).not.toContain('proxy')
      expect(result).not.toContain('--all')
      expect(result).not.toContain('--strategy')
      expect(result).not.toContain('fallback')
    })
  })
})
