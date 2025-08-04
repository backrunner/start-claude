import { describe, it, expect, vi } from 'vitest'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { startClaude } from '@/claude'
import type { ClaudeConfig } from '@/types'

// Mock child_process
vi.mock('node:child_process')
vi.mock('node:process', () => ({
  default: {
    env: {
      PATH: '/usr/bin',
    },
  },
}))

const mockSpawn = vi.mocked(spawn)
const mockProcess = vi.mocked(process)

// Create a mock EventEmitter for the child process
const createMockChildProcess = () => {
  const mockChild = {
    on: vi.fn(),
    listeners: new Map(),
  }
  
  mockChild.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
    mockChild.listeners.set(event, callback)
    return mockChild
  })
  
  return mockChild
}

describe('startClaude', () => {
  beforeEach(() => {
    mockProcess.env = { PATH: '/usr/bin' }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should spawn claude with environment variables', async () => {
    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild as any)

    const config: ClaudeConfig = {
      name: 'test',
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
    }

    const promise = startClaude(config, ['arg1', 'arg2'])
    
    // Simulate successful close
    const closeCallback = mockChild.listeners.get('close')
    if (closeCallback) {
      closeCallback(0)
    }

    const result = await promise

    expect(mockSpawn).toHaveBeenCalledWith('claude', ['arg1', 'arg2'], {
      stdio: 'inherit',
      env: {
        PATH: '/usr/bin',
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_API_KEY: 'test-key',
      },
    })
    expect(result).toBe(0)
  })

  it('should not set environment variables when they are undefined', async () => {
    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild as any)

    const config: ClaudeConfig = {
      name: 'test',
    }

    const promise = startClaude(config)
    
    // Simulate successful close
    const closeCallback = mockChild.listeners.get('close')
    if (closeCallback) {
      closeCallback(0)
    }

    await promise

    expect(mockSpawn).toHaveBeenCalledWith('claude', [], {
      stdio: 'inherit',
      env: {
        PATH: '/usr/bin',
      },
    })
  })

  it('should not set environment variables when they are empty strings', async () => {
    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild as any)

    const config: ClaudeConfig = {
      name: 'test',
      baseUrl: '',
      apiKey: '',
    }

    const promise = startClaude(config)
    
    // Simulate successful close
    const closeCallback = mockChild.listeners.get('close')
    if (closeCallback) {
      closeCallback(0)
    }

    await promise

    expect(mockSpawn).toHaveBeenCalledWith('claude', [], {
      stdio: 'inherit',
      env: {
        PATH: '/usr/bin',
      },
    })
  })

  it('should handle process close with non-zero exit code', async () => {
    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild as any)

    const config: ClaudeConfig = {
      name: 'test',
    }

    const promise = startClaude(config)
    
    // Simulate process close with exit code 1
    const closeCallback = mockChild.listeners.get('close')
    if (closeCallback) {
      closeCallback(1)
    }

    const result = await promise
    expect(result).toBe(1)
  })

  it('should handle process close with null exit code', async () => {
    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild as any)

    const config: ClaudeConfig = {
      name: 'test',
    }

    const promise = startClaude(config)
    
    // Simulate process close with null exit code
    const closeCallback = mockChild.listeners.get('close')
    if (closeCallback) {
      closeCallback(null)
    }

    const result = await promise
    expect(result).toBe(0)
  })

  it('should handle process error', async () => {
    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild as any)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const config: ClaudeConfig = {
      name: 'test',
    }

    const promise = startClaude(config)
    
    // Simulate process error
    const errorCallback = mockChild.listeners.get('error')
    if (errorCallback) {
      errorCallback(new Error('Command not found'))
    }

    const result = await promise
    
    expect(result).toBe(1)
    expect(consoleSpy).toHaveBeenCalledWith('Failed to start Claude:', 'Command not found')
    consoleSpy.mockRestore()
  })
})