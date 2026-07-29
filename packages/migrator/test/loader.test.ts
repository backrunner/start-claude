import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveMigrationsDir } from '../src/core/loader'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('resolveMigrationsDir', () => {
  it('finds source migrations from a Next.js development server directory', () => {
    const root = createTempDir()
    const startDir = join(root, 'packages', 'manager', '.next', 'server')
    const migrationsDir = join(root, 'packages', 'migrator', 'migrations', 'definitions')
    mkdirSync(startDir, { recursive: true })
    mkdirSync(migrationsDir, { recursive: true })

    expect(resolveMigrationsDir(startDir).path).toBe(migrationsDir)
  })

  it('finds packaged migrations from a Next.js server chunk directory', () => {
    const root = createTempDir()
    const startDir = join(root, 'bin', 'manager', '.next', 'server', 'chunks')
    const migrationsDir = join(root, 'bin', 'migrations', 'definitions')
    mkdirSync(startDir, { recursive: true })
    mkdirSync(migrationsDir, { recursive: true })

    expect(resolveMigrationsDir(startDir).path).toBe(migrationsDir)
  })

  it('returns the bounded search paths when migrations are missing', () => {
    const root = createTempDir()
    const resolution = resolveMigrationsDir(join(root, 'nested', 'runtime'))

    expect(resolution.path).toBeUndefined()
    expect(resolution.attemptedPaths.length).toBeLessThanOrEqual(36)
  })
})

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'start-claude-migrations-'))
  tempDirs.push(dir)
  return dir
}
