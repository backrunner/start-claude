import { describe, it, expect, vi } from 'vitest'
import { promisify } from 'node:util'
import { checkClaudeInstallation } from '@/detection'

// Mock the child_process and util modules
vi.mock('node:child_process')
vi.mock('node:util')

const mockPromisify = vi.mocked(promisify)

describe('checkClaudeInstallation', () => {
  it('should return installed true with version when claude is available', async () => {
    const mockExecAsync = vi.fn().mockResolvedValue({
      stdout: 'claude version 1.0.0\n',
      stderr: '',
    })
    
    mockPromisify.mockReturnValue(mockExecAsync)

    const result = await checkClaudeInstallation()
    
    expect(result).toEqual({
      isInstalled: true,
      version: 'claude version 1.0.0',
    })
    expect(mockExecAsync).toHaveBeenCalledWith('claude --version')
  })

  it('should return installed false with error when claude is not available', async () => {
    const mockError = new Error('Command not found: claude')
    const mockExecAsync = vi.fn().mockRejectedValue(mockError)
    
    mockPromisify.mockReturnValue(mockExecAsync)

    const result = await checkClaudeInstallation()
    
    expect(result.isInstalled).toBe(false)
    expect(result.error).toBe('Command not found: claude')
    expect(mockExecAsync).toHaveBeenCalledWith('claude --version')
  })

  it('should handle unknown error types', async () => {
    const mockExecAsync = vi.fn().mockRejectedValue('string error')
    
    mockPromisify.mockReturnValue(mockExecAsync)

    const result = await checkClaudeInstallation()
    
    expect(result.isInstalled).toBe(false)
    expect(result.error).toBe('Unknown error')
  })
})