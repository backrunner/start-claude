import * as fs from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkAndHandleExistingProxy, removeLockFile } from '../../src/utils/network/proxy-lock'

const LOCK_FILE = path.join(os.tmpdir(), 'start-claude-proxy.lock')

describe('proxy lock', () => {
  beforeEach(() => {
    // Clean up any existing lock file
    removeLockFile()
  })

  afterEach(() => {
    // Clean up lock file after each test
    removeLockFile()
  })

  it('should allow starting proxy when port is free', async () => {
    const result = await checkAndHandleExistingProxy()
    expect(result).toBe(true)

    // Should create lock file
    expect(fs.existsSync(LOCK_FILE)).toBe(true)

    // Lock file should contain current process PID
    const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim()
    expect(Number.parseInt(pid, 10)).toBe(process.pid)
  })

  it('should detect existing proxy when port is in use and lock file exists', async () => {
    // Create a server on the proxy port
    const server = net.createServer()

    await new Promise<void>((resolve) => {
      server.listen(2333, () => {
        // Create lock file with current PID (simulating running proxy)
        fs.writeFileSync(LOCK_FILE, process.pid.toString(), 'utf8')

        checkAndHandleExistingProxy().then((result) => {
          expect(result).toBe(false) // Should not start new proxy

          server.close(() => {
            resolve()
          })
        }).catch((error) => {
          server.close(() => {
            throw error
          })
        })
      })
    })
  })

  it('should handle stale lock file when process is not running', async () => {
    // Create lock file with a fake PID that doesn't exist
    const fakePid = 999999
    fs.writeFileSync(LOCK_FILE, fakePid.toString(), 'utf8')

    const result = await checkAndHandleExistingProxy()
    expect(result).toBe(true) // Should allow starting new proxy

    // Should create new lock file with current PID
    expect(fs.existsSync(LOCK_FILE)).toBe(true)
    const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim()
    expect(Number.parseInt(pid, 10)).toBe(process.pid)
  })

  it('should handle port in use by another application', async () => {
    // Create a server on the proxy port without lock file
    const server = net.createServer()

    await new Promise<void>((resolve) => {
      server.listen(2333, () => {
        checkAndHandleExistingProxy().then((result) => {
          expect(result).toBe(false) // Should not start proxy

          // Should not create lock file
          expect(fs.existsSync(LOCK_FILE)).toBe(false)

          server.close(() => {
            resolve()
          })
        }).catch((error) => {
          server.close(() => {
            throw error
          })
        })
      })
    })
  })

  it('should clean up lock file on removal', () => {
    // Create lock file
    fs.writeFileSync(LOCK_FILE, process.pid.toString(), 'utf8')
    expect(fs.existsSync(LOCK_FILE)).toBe(true)

    // Remove lock file
    removeLockFile()
    expect(fs.existsSync(LOCK_FILE)).toBe(false)
  })
})
