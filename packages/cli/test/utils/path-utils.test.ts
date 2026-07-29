import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveClaudeProjectRoot,
  START_CLAUDE_PROJECT_ROOT_ENV,
} from '../../src/utils/system/path-utils'

describe('resolveClaudeProjectRoot', () => {
  it('prefers the project root passed by the manager launcher', () => {
    expect(resolveClaudeProjectRoot({
      [START_CLAUDE_PROJECT_ROOT_ENV]: '/workspace/project',
      INIT_CWD: '/workspace/package',
    }, '/workspace/manager')).toBe(resolve('/workspace/project'))
  })

  it('uses the package-manager invocation directory in development', () => {
    expect(resolveClaudeProjectRoot({
      PWD: '/workspace/project',
    }, '/workspace/project/packages/manager')).toBe(resolve('/workspace/project'))
  })

  it('falls back to the current working directory', () => {
    expect(resolveClaudeProjectRoot({}, '/workspace/project')).toBe(resolve('/workspace/project'))
  })
})
