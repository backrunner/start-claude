import { describe, expect, it } from 'vitest'
import * as net from 'node:net'
import { findAvailablePort, isPortAvailable } from '../../src/utils/network/port-finder'

describe('port-finder', () => {
  describe('isPortAvailable', () => {
    it('should return true for an available port', async () => {
      // Use a high random port that's likely to be available
      const port = 30000 + Math.floor(Math.random() * 10000)
      const available = await isPortAvailable(port)
      expect(available).toBe(true)
    })

    it('should return false for a port in use', async () => {
      // Create a server to occupy a port
      const server = net.createServer()
      const port = 30000 + Math.floor(Math.random() * 10000)

      await new Promise<void>((resolve) => {
        server.listen(port, 'localhost', () => {
          resolve()
        })
      })

      try {
        const available = await isPortAvailable(port)
        expect(available).toBe(false)
      }
      finally {
        server.close()
      }
    })
  })

  describe('findAvailablePort', () => {
    it('should find an available port starting from given port', async () => {
      const startPort = 35000 + Math.floor(Math.random() * 5000)
      const port = await findAvailablePort(startPort, 10)
      expect(port).not.toBeNull()
      expect(port).toBeGreaterThanOrEqual(startPort)
      expect(port).toBeLessThan(startPort + 10)
    })

    it('should return null if no ports available in range', async () => {
      // Create servers to occupy all ports in the range
      const startPort = 40000
      const servers: net.Server[] = []

      // Occupy 5 consecutive ports
      for (let i = 0; i < 5; i++) {
        const server = net.createServer()
        await new Promise<void>((resolve) => {
          server.listen(startPort + i, 'localhost', () => {
            servers.push(server)
            resolve()
          })
        })
      }

      try {
        const port = await findAvailablePort(startPort, 5)
        expect(port).toBeNull()
      }
      finally {
        // Clean up
        servers.forEach(server => server.close())
      }
    })

    it('should skip occupied ports and find the next available one', async () => {
      const startPort = 45000
      const server = net.createServer()

      // Occupy the first port
      await new Promise<void>((resolve) => {
        server.listen(startPort, 'localhost', () => {
          resolve()
        })
      })

      try {
        const port = await findAvailablePort(startPort, 10)
        expect(port).not.toBeNull()
        expect(port).toBeGreaterThan(startPort)
      }
      finally {
        server.close()
      }
    })
  })
})
