import { describe, expect, it } from 'vitest'
import {
  configNamesMatch,
  findConfigByName,
  findNameConflict,
  getNameConflictMessage,
  normalizeConfigName,
} from '../../src/config/name-utils'

describe('normalizeConfigName', () => {
  it('should convert to lowercase', () => {
    expect(normalizeConfigName('MyAPI')).toBe('myapi')
    expect(normalizeConfigName('MY API')).toBe('myapi')
  })

  it('should remove spaces', () => {
    expect(normalizeConfigName('my api')).toBe('myapi')
    expect(normalizeConfigName('my  api')).toBe('myapi')
  })

  it('should remove hyphens', () => {
    expect(normalizeConfigName('my-api')).toBe('myapi')
    expect(normalizeConfigName('my--api')).toBe('myapi')
  })

  it('should remove underscores', () => {
    // Underscores are now preserved (not normalized)
    expect(normalizeConfigName('my_api')).toBe('my_api')
    expect(normalizeConfigName('my__api')).toBe('my__api')
  })

  it('should trim whitespace', () => {
    expect(normalizeConfigName('  my api  ')).toBe('myapi')
  })

  it('should handle mixed separators', () => {
    // Hyphens and spaces are removed, but underscores are preserved
    expect(normalizeConfigName('my-api test_config')).toBe('myapitest_config')
  })
})

describe('configNamesMatch', () => {
  it('should match identical names', () => {
    expect(configNamesMatch('my api', 'my api')).toBe(true)
  })

  it('should match names with different cases', () => {
    expect(configNamesMatch('My API', 'my api')).toBe(true)
    expect(configNamesMatch('MY API', 'my api')).toBe(true)
  })

  it('should match names with spaces and hyphens', () => {
    expect(configNamesMatch('my api', 'my-api')).toBe(true)
    // Underscores are now treated as distinct
    expect(configNamesMatch('my-api', 'my_api')).toBe(false)
    expect(configNamesMatch('my api', 'my_api')).toBe(false)
  })

  it('should match names with extra whitespace', () => {
    expect(configNamesMatch('  my api  ', 'my-api')).toBe(true)
  })

  it('should not match different names', () => {
    expect(configNamesMatch('my api', 'your api')).toBe(false)
    expect(configNamesMatch('api1', 'api2')).toBe(false)
  })

  it('should match complex real-world examples', () => {
    expect(configNamesMatch('OpenAI GPT-4', 'openai-gpt-4')).toBe(true)
    expect(configNamesMatch('Claude 3.5 Sonnet', 'claude-3.5-sonnet')).toBe(true)
    // Underscores are now treated as distinct
    expect(configNamesMatch('My Custom API', 'my_custom_api')).toBe(false)
    expect(configNamesMatch('My Custom API', 'my-custom-api')).toBe(true)
  })
})

describe('findConfigByName', () => {
  const configs = [
    { name: 'My API', id: '1' },
    { name: 'test-config', id: '2' },
    { name: 'production_server', id: '3' },
  ]

  it('should find config with exact name match', () => {
    const result = findConfigByName(configs, 'My API')
    expect(result?.id).toBe('1')
  })

  it('should find config with case-insensitive match', () => {
    const result = findConfigByName(configs, 'my api')
    expect(result?.id).toBe('1')
  })

  it('should find config with space/hyphen equivalence', () => {
    const result = findConfigByName(configs, 'my-api')
    expect(result?.id).toBe('1')
  })

  it('should find config with underscore/hyphen equivalence', () => {
    // Underscores are now treated as distinct, so this should NOT match
    const result = findConfigByName(configs, 'production-server')
    expect(result).toBeUndefined()
  })

  it('should not match underscore with hyphen', () => {
    // production_server should only match exactly or with case variations
    const result = findConfigByName(configs, 'PRODUCTION_SERVER')
    expect(result?.id).toBe('3')
  })

  it('should return undefined for non-existent config', () => {
    const result = findConfigByName(configs, 'nonexistent')
    expect(result).toBeUndefined()
  })

  it('should handle mixed case and separators', () => {
    const result = findConfigByName(configs, 'TEST CONFIG')
    expect(result?.id).toBe('2')
  })
})

describe('findNameConflict', () => {
  const configs = [
    { name: 'My API', id: '1' },
    { name: 'test-config', id: '2' },
    { name: 'production_server', id: '3' },
  ]

  it('should find conflict with existing config', () => {
    const result = findNameConflict(configs, 'my-api')
    expect(result?.id).toBe('1')
  })

  it('should not find conflict with same config when excluded', () => {
    const result = findNameConflict(configs, 'my-api', configs[0])
    expect(result).toBeUndefined()
  })

  it('should find conflict case-insensitively', () => {
    const result = findNameConflict(configs, 'TEST CONFIG')
    expect(result?.id).toBe('2')
  })

  it('should not find conflict for new name', () => {
    const result = findNameConflict(configs, 'new-config')
    expect(result).toBeUndefined()
  })

  it('should exclude the specified config from conflict check', () => {
    // Updating config[1] name to something that matches config[0]
    const result = findNameConflict(configs, 'my-api', configs[1])
    expect(result?.id).toBe('1') // Should find config[0] as conflict
  })
})

describe('getNameConflictMessage', () => {
  it('should return simple message for exact match', () => {
    const message = getNameConflictMessage('My API', 'My API')
    expect(message).toContain('already exists')
    expect(message).toContain('My API')
  })

  it('should return detailed message for variant match', () => {
    const message = getNameConflictMessage('my-api', 'My API')
    expect(message).toContain('conflicts with existing configuration')
    expect(message).toContain('my-api')
    expect(message).toContain('My API')
    expect(message).toContain('ignoring case and spaces/hyphens')
  })
})
