import * as net from 'node:net'

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false)
      }
      else {
        resolve(false)
      }
    })

    server.once('listening', () => {
      server.close()
      resolve(true)
    })

    server.listen(port, 'localhost')
  })
}

/**
 * Find an available port starting from the given port
 * @param startPort - The port to start searching from
 * @param maxAttempts - Maximum number of ports to try (default: 10)
 * @returns The first available port found, or null if none available
 */
export async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt
    if (await isPortAvailable(port)) {
      return port
    }
  }
  return null
}
