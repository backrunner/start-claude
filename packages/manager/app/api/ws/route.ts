import { existsSync, statSync, unwatchFile, watchFile } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { NextResponse } from 'next/server'
import { WebSocketServer } from 'ws'
import { ConfigManager } from '@start-claude/cli/src/config/manager'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Store WebSocket server instance
let wsServer: any = null

// Store active WebSocket connections
const activeConnections = new Set<any>()

// Config file watcher state
let configWatcher: { cleanup: () => void } | null = null

// Get config file path (same as in ConfigFileManager)
const CONFIG_FILE = path.join(os.homedir(), '.start-claude', 'config.json')

// Initialize config file watcher
function initConfigWatcher(): void {
  if (configWatcher) {
    return // Already watching
  }

  try {
    const configFile = CONFIG_FILE

    if (!existsSync(configFile)) {
      console.warn('Config file does not exist, skipping file watcher setup')
      return
    }

    let lastModified = 0

    // Get initial modification time
    const stats = statSync(configFile)
    lastModified = stats.mtime.getTime()

    const watchCallback = (): void => {
      void (async () => {
        try {
          const stats = existsSync(configFile) ? statSync(configFile) : null
          if (stats && stats.mtime.getTime() !== lastModified) {
            lastModified = stats.mtime.getTime()

            console.log('Config file changed, broadcasting update to WebSocket clients')

            // Load updated configs and settings
            const configManager = ConfigManager.getInstance()
            const configFileData = await configManager.load()
            const configs = configFileData.configs || []
            const settings = configFileData.settings || { overrideClaudeCommand: false }

            broadcastConfigUpdate(configs, settings)
          }
        }
        catch (error) {
          console.error('Error in config file watcher:', error)
        }
      })()
    }

    // Start watching
    watchFile(configFile, { interval: 1000 }, watchCallback)

    configWatcher = {
      cleanup: () => {
        unwatchFile(configFile, watchCallback)
        configWatcher = null
        console.log('Config file watcher stopped')
      },
    }

    console.log('Config file watcher started for:', configFile)
  }
  catch (error) {
    console.error('Failed to setup config file watcher:', error)
  }
}

// Initialize WebSocket server if not already created
function initWebSocketServer(): any {
  if (wsServer)
    return wsServer

  try {
    wsServer = new WebSocketServer({
      port: 3001, // Use separate port for WebSocket
      host: 'localhost',
    })

    wsServer.on('connection', (ws: any) => {
      console.log('WebSocket connection established')
      activeConnections.add(ws)

      ws.on('close', () => {
        console.log('WebSocket connection closed')
        activeConnections.delete(ws)
      })

      ws.on('error', (error: any) => {
        console.error('WebSocket error:', error)
        activeConnections.delete(ws)
      })

      // Send ping every 30 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === 1) { // OPEN
          ws.ping()
        }
        else {
          clearInterval(pingInterval)
          activeConnections.delete(ws)
        }
      }, 30000)
    })

    wsServer.on('error', (error: any) => {
      console.error('WebSocket server error:', error)
    })

    console.log('WebSocket server started on port 3001')

    // Initialize config file watcher when WebSocket server starts
    initConfigWatcher()

    return wsServer
  }
  catch (error) {
    console.error('Failed to start WebSocket server:', error)
    return null
  }
}

// HTTP endpoint to get WebSocket connection info
export async function GET(): Promise<NextResponse> {
  try {
    // Initialize WebSocket server
    const server = initWebSocketServer()

    return NextResponse.json({
      websocketUrl: 'ws://localhost:3001',
      connected: activeConnections.size,
      serverRunning: !!server,
    })
  }
  catch (error) {
    console.error('WebSocket endpoint error:', error)
    return NextResponse.json({
      error: 'WebSocket server unavailable',
      websocketUrl: null,
      connected: 0,
      serverRunning: false,
    }, { status: 500 })
  }
}

// Function to broadcast config updates to all connected clients
export function broadcastConfigUpdate(configs: any[], settings: any): void {
  console.log(`Broadcasting config update to ${activeConnections.size} connections`)

  if (activeConnections.size === 0) {
    console.log('No WebSocket connections to notify')
    return
  }

  const message = JSON.stringify({
    type: 'configUpdate',
    data: {
      configs,
      settings,
    },
    timestamp: Date.now(),
  })

  activeConnections.forEach((ws) => {
    try {
      if (ws.readyState === 1) { // OPEN
        ws.send(message)
        console.log('Config update message sent to WebSocket client')
      }
    }
    catch (error) {
      console.error('Error sending config update message:', error)
      activeConnections.delete(ws)
    }
  })
}

// Function to broadcast shutdown message to all connected clients
export function broadcastShutdown(): void {
  console.log(`Broadcasting shutdown to ${activeConnections.size} connections`)

  if (activeConnections.size === 0) {
    console.log('No WebSocket connections to notify')
    return
  }

  const message = JSON.stringify({
    type: 'shutdown',
    timestamp: Date.now(),
  })

  activeConnections.forEach((ws) => {
    try {
      if (ws.readyState === 1) { // OPEN
        ws.send(message)
        console.log('Shutdown message sent to WebSocket client')
      }
    }
    catch (error) {
      console.error('Error sending shutdown message:', error)
      activeConnections.delete(ws)
    }
  })

  // Clean up config watcher
  if (configWatcher) {
    configWatcher.cleanup()
  }

  // Clean up connections after sending shutdown
  setTimeout(() => {
    activeConnections.forEach((ws) => {
      try {
        ws.close()
      }
      catch (error) {
        console.error('Error closing WebSocket:', error)
      }
    })
    activeConnections.clear()

    // Close the WebSocket server if it exists
    if (wsServer) {
      try {
        wsServer.close()
        console.log('WebSocket server closed')
      }
      catch (error) {
        console.error('Error closing WebSocket server:', error)
      }
    }
  }, 100)
}
