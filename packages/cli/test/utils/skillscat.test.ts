import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildSkillsCatAddArgs,
  resolveSkillsCatEntrypoint,
  runSkillsCatAdd,
} from '../../src/utils/skills/skillscat'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('SkillsCat CLI integration', () => {
  it('builds a bounded Claude Code install invocation', () => {
    expect(buildSkillsCatAddArgs(' acme/code-review ', {
      force: true,
      repo: true,
      skill: ['review', 'security'],
      verbose: true,
      yes: true,
    })).toEqual([
      '--verbose',
      'add',
      'acme/code-review',
      '--agent',
      'claude-code',
      '--repo',
      '--skill',
      'review',
      'security',
      '--yes',
      '--force',
    ])
  })

  it('resolves the pinned SkillsCat package entrypoint', () => {
    expect(resolveSkillsCatEntrypoint()).toMatch(/skillscat[/\\]dist[/\\]index\.js$/)
  })

  it('resolves SkillsCat relative to the runtime entrypoint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'start-claude-skillscat-runtime-'))
    tempDirs.push(dir)
    const packageDir = join(dir, 'node_modules', 'skillscat')
    const entrypoint = join(packageDir, 'dist', 'index.js')
    mkdirSync(join(dir, 'bin'), { recursive: true })
    mkdirSync(join(packageDir, 'dist'), { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'skillscat', version: '0.0.0' }))
    writeFileSync(entrypoint, '')

    expect(realpathSync(resolveSkillsCatEntrypoint(join(dir, 'bin', 'cli.mjs')))).toBe(realpathSync(entrypoint))
  })

  it('resolves SkillsCat from a pnpm-linked package runtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'start-claude-skillscat-pnpm-'))
    tempDirs.push(dir)
    const virtualNodeModules = join(dir, 'node_modules', '.pnpm', 'start-claude@file', 'node_modules')
    const packageDir = join(virtualNodeModules, 'start-claude')
    const runtimeEntry = join(packageDir, 'bin', 'cli.mjs')
    const skillscatDir = join(virtualNodeModules, 'skillscat')
    const skillscatEntrypoint = join(skillscatDir, 'dist', 'index.js')
    const linkedPackageDir = join(dir, 'node_modules', 'start-claude')

    mkdirSync(join(packageDir, 'bin'), { recursive: true })
    mkdirSync(join(skillscatDir, 'dist'), { recursive: true })
    writeFileSync(runtimeEntry, '')
    writeFileSync(join(skillscatDir, 'package.json'), JSON.stringify({ name: 'skillscat', version: '0.0.0' }))
    writeFileSync(skillscatEntrypoint, '')
    symlinkSync(packageDir, linkedPackageDir, process.platform === 'win32' ? 'junction' : 'dir')

    const linkedRuntimeEntry = join(linkedPackageDir, 'bin', 'cli.mjs')
    expect(realpathSync(resolveSkillsCatEntrypoint(linkedRuntimeEntry))).toBe(realpathSync(skillscatEntrypoint))
  })

  it('rejects values that SkillsCat could parse as options', () => {
    expect(() => buildSkillsCatAddArgs('--global')).toThrow('cannot start with a hyphen')
    expect(() => buildSkillsCatAddArgs('acme/review', {
      skill: ['review', '--global'],
    })).toThrow('cannot start with a hyphen')
  })

  it('executes SkillsCat without a shell and forwards arguments', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'start-claude-skillscat-'))
    tempDirs.push(dir)
    const entrypoint = join(dir, 'skillscat.mjs')
    const outputPath = join(dir, 'args.json')
    writeFileSync(entrypoint, `import { writeFileSync } from 'node:fs'\nwriteFileSync(process.env.SKILLSCAT_TEST_OUTPUT, JSON.stringify(process.argv.slice(2)))\n`, 'utf-8')

    await runSkillsCatAdd('acme/review', { yes: true }, {
      entrypoint,
      env: { ...process.env, SKILLSCAT_TEST_OUTPUT: outputPath },
      stdio: 'ignore',
    })

    expect(JSON.parse(readFileSync(outputPath, 'utf-8'))).toEqual([
      'add',
      'acme/review',
      '--agent',
      'claude-code',
      '--yes',
    ])
  })

  it('rejects a non-zero SkillsCat exit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'start-claude-skillscat-'))
    tempDirs.push(dir)
    const entrypoint = join(dir, 'skillscat.mjs')
    writeFileSync(entrypoint, 'process.exitCode = 7\n', 'utf-8')

    await expect(runSkillsCatAdd('acme/review', {}, {
      entrypoint,
      stdio: 'ignore',
    })).rejects.toThrow('SkillsCat exited with code 7')
  })
})
