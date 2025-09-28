import * as fs from 'node:fs'
import * as os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectiCloud, detectOneDrive, getAvailableCloudServices, getCloudStorageStatus } from '../src/utils/cloud-storage/detector'

// Mock the filesystem and OS modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('node:os', () => ({
  homedir: vi.fn(),
}))

vi.mock('node:process', () => ({
  default: {
    platform: 'darwin',
    env: {},
  },
}))

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockProcess = {
  platform: 'darwin',
  env: {},
}

describe('cloud Storage Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOs.homedir.mockReturnValue('/home/user')
    ;(mockProcess as any).platform = 'darwin'
    ;(mockProcess as any).env = {}
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('oneDrive Detection', () => {
    describe('macOS', () => {
      beforeEach(() => {
        mockProcess.platform = 'darwin'
      })

      it('should detect OneDrive when app and folder exist', () => {
        mockFs.existsSync.mockImplementation((path: any) => {
          const pathStr = path.toString()
          return pathStr.includes('OneDrive.app') || pathStr.includes('OneDrive')
        })

        mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)

        const result = detectOneDrive()

        expect(result.isAvailable).toBe(true)
        expect(result.isEnabled).toBe(true)
        expect(result.path).toBe('/home/user/OneDrive')
      })

      it('should detect OneDrive app without folder', () => {
        mockFs.existsSync.mockImplementation((path: any) => {
          const pathStr = path.toString()
          return pathStr.includes('OneDrive.app')
        })

        const result = detectOneDrive()

        expect(result.isAvailable).toBe(true)
        expect(result.isEnabled).toBe(false)
      })

      it('should return not available when OneDrive is not installed', () => {
        mockFs.existsSync.mockReturnValue(false)

        const result = detectOneDrive()

        expect(result.isAvailable).toBe(false)
        expect(result.isEnabled).toBe(false)
        expect(result.error).toBe('OneDrive is not installed')
      })
    })

    describe('windows', () => {
      beforeEach(() => {
        mockProcess.platform = 'win32'
        mockProcess.env = {
          OneDrive: 'C:\\Users\\user\\OneDrive',
          LOCALAPPDATA: 'C:\\Users\\user\\AppData\\Local',
        }
      })

      it('should detect OneDrive when properly configured', () => {
        mockFs.existsSync.mockImplementation((path: any) => {
          const pathStr = path.toString()
          return pathStr.includes('OneDrive') || pathStr.includes('OneDrive.exe')
        })

        mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)

        const result = detectOneDrive()

        expect(result.isAvailable).toBe(true)
        expect(result.isEnabled).toBe(true)
        expect(result.path).toBe('C:\\Users\\user\\OneDrive')
      })

      it('should detect OneDrive installation without configuration', () => {
        mockFs.existsSync.mockImplementation((path: any) => {
          const pathStr = path.toString()
          // Return true only for LOCALAPPDATA Microsoft OneDrive path, not the main OneDrive folder
          return pathStr.includes('Microsoft') && pathStr.includes('OneDrive') && pathStr.includes('AppData')
        })

        const result = detectOneDrive()

        expect(result.isAvailable).toBe(true)
        expect(result.isEnabled).toBe(false)
        expect(result.error).toContain('installed but may not be configured')
      })
    })

    describe('unsupported platforms', () => {
      it('should return not supported for Linux', () => {
        mockProcess.platform = 'linux'

        const result = detectOneDrive()

        expect(result.isAvailable).toBe(false)
        expect(result.isEnabled).toBe(false)
        expect(result.error).toBe('OneDrive is not supported on this platform')
      })
    })
  })

  describe('iCloud Detection', () => {
    describe('macOS', () => {
      beforeEach(() => {
        mockProcess.platform = 'darwin'
      })

      it('should detect iCloud when properly configured', () => {
        mockFs.existsSync.mockImplementation((path: any) => {
          const pathStr = path.toString()
          return pathStr.includes('CloudDocs') || pathStr.includes('iCloud Drive')
        })

        mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)

        const result = detectiCloud()

        expect(result.isAvailable).toBe(true)
        expect(result.isEnabled).toBe(true)
        expect(result.path).toContain('CloudDocs')
      })

      it('should return not enabled when iCloud Drive is disabled', () => {
        mockFs.existsSync.mockReturnValue(false)

        const result = detectiCloud()

        expect(result.isAvailable).toBe(false)
        expect(result.isEnabled).toBe(false)
        expect(result.error).toBe('iCloud Drive is not enabled')
      })
    })

    describe('windows', () => {
      beforeEach(() => {
        mockProcess.platform = 'win32'
        mockProcess.env = {
          APPDATA: 'C:\\Users\\user\\AppData\\Roaming',
        }
      })

      it('should detect iCloud for Windows when installed and configured', () => {
        mockFs.existsSync.mockImplementation((path: any) => {
          const pathStr = path.toString()
          return pathStr.includes('iCloudServices.exe')
            || pathStr.includes('iCloud')
            || pathStr.includes('Apple Computer')
        })

        mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)

        const result = detectiCloud()

        expect(result.isAvailable).toBe(true)
        expect(result.isEnabled).toBe(true)
      })

      it('should return not installed when iCloud for Windows is missing', () => {
        mockFs.existsSync.mockReturnValue(false)

        const result = detectiCloud()

        expect(result.isAvailable).toBe(false)
        expect(result.isEnabled).toBe(false)
        expect(result.error).toBe('iCloud for Windows is not installed')
      })
    })

    describe('unsupported platforms', () => {
      it('should return not supported for Linux', () => {
        mockProcess.platform = 'linux'

        const result = detectiCloud()

        expect(result.isAvailable).toBe(false)
        expect(result.isEnabled).toBe(false)
        expect(result.error).toBe('iCloud is not supported on this platform')
      })
    })
  })

  describe('cloud Storage Status', () => {
    it('should return status for both OneDrive and iCloud', () => {
      mockProcess.platform = 'darwin'
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)

      const status = getCloudStorageStatus()

      expect(status).toHaveProperty('oneDrive')
      expect(status).toHaveProperty('iCloud')
      expect(status.oneDrive).toHaveProperty('isAvailable')
      expect(status.oneDrive).toHaveProperty('isEnabled')
      expect(status.iCloud).toHaveProperty('isAvailable')
      expect(status.iCloud).toHaveProperty('isEnabled')
    })
  })

  describe('available Cloud Services', () => {
    it('should return list of available services', () => {
      mockProcess.platform = 'darwin'
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)

      const services = getAvailableCloudServices()

      expect(Array.isArray(services)).toBe(true)
      expect(services.length).toBeGreaterThan(0)

      services.forEach((service) => {
        expect(service).toHaveProperty('name')
        expect(service).toHaveProperty('isEnabled')
        expect(['OneDrive', 'iCloud']).toContain(service.name)
      })
    })

    it('should return empty array when no services are available', () => {
      mockFs.existsSync.mockReturnValue(false)

      const services = getAvailableCloudServices()

      expect(Array.isArray(services)).toBe(true)
      expect(services.length).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should handle filesystem errors gracefully', () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const oneDriveResult = detectOneDrive()
      const iCloudResult = detectiCloud()

      expect(oneDriveResult.isAvailable).toBe(false)
      expect(oneDriveResult.isEnabled).toBe(false)
      expect(oneDriveResult.error).toContain('Error detecting OneDrive')

      expect(iCloudResult.isAvailable).toBe(false)
      expect(iCloudResult.isEnabled).toBe(false)
      expect(iCloudResult.error).toContain('Error detecting iCloud')
    })
  })
})
