import type { ClaudeConfig } from '@/config/types'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the dependencies
vi.mock('node:child_process')
vi.mock('node:fs')
vi.mock('node:os', () => ({
  default: {
    tmpdir: vi.fn().mockReturnValue('/tmp'),
  },
}))
vi.mock('node:path')

const mockSpawn = vi.mocked(spawn)
const mockFs = vi.mocked(fs)
const mockPath = vi.mocked(path)

describe('editor', () => {
  const mockConfig: ClaudeConfig = {
    name: 'test-config',
    baseUrl: 'https://api.test.com',
    apiKey: 'test-key',
    isDefault: true,
  }

  beforeEach(async () => {
    mockPath.join.mockImplementation((...args) => args.join('/'))
    mockFs.writeFileSync.mockImplementation(() => undefined)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
    mockFs.unlinkSync.mockImplementation(() => undefined)
    mockFs.existsSync.mockReturnValue(true)

    // Mock spawn to return a successful process
    const mockProcess: any = {
      on: vi.fn((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10) // Successful completion
        }
        return mockProcess
      }),
    }
    mockSpawn.mockReturnValue(mockProcess)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // Basic test to ensure module loads
  it('should import editor module successfully', async () => {
    const editorModule = await import('@/utils/editor')
    expect(editorModule.createConfigInEditor).toBeDefined()
    expect(editorModule.editConfigInEditor).toBeDefined()
  })
})
