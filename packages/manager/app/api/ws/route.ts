import { existsSync, readFileSync, statSync, unwatchFile, watchFile } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { S3ConfigFileManager } from '@start-claude/cli/src/config/s3-config'
import { LoadBalancerStrategy, SpeedTestStrategy } from '@start-claude/cli/src/config/types'
import { NextResponse } from 'next/server'
import { WebSocketServer } from 'ws'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Store WebSocket server instance
let wsServer: any = null

// Store active WebSocket connections
const activeConnections = new Set<any>()

// Config file watcher state
let configWatcher: { cleanup: () => void } | null = null
let s3ConfigWatcher: { cleanup: () => void } | null = null

// Get config file paths
const CONFIG_FILE = path.join(os.homedir(), '.start-claude', 'config.json')
const S3_CONFIG_FILE = path.join(os.homedir(), '.start-claude', 's3-config.json')

// Helper function to load complete settings including S3 config
async function loadCompleteSettings(): Promise<any> {
  try {
    const configManager = ConfigManager.getInstance()
    const s3ConfigManager = S3ConfigFileManager.getInstance()

    const configFileData = await configManager.load()
    const configs = configFileData.configs || []
    const settings = configFileData.settings || { overrideClaudeCommand: false }

    // Ensure balanceMode structure exists with defaults
    if (!settings.balanceMode) {
      settings.balanceMode = {
        enableByDefault: false,
        strategy: LoadBalancerStrategy.Fallback,
        healthCheck: {
          enabled: true,
          intervalMs: 30000,
        },
        failedEndpoint: {
          banDurationSeconds: 300,
        },
        speedFirst: {
          responseTimeWindowMs: 300000,
          minSamples: 2,
          speedTestIntervalSeconds: 300,
          speedTestStrategy: SpeedTestStrategy.ResponseTime,
        },
      }
    }

    // Load S3 config from s3-config.json
    let s3Sync
    try {
      const s3ConfigFile = s3ConfigManager.load()
      if (s3ConfigFile) {
        s3Sync = s3ConfigFile.s3Config
      }
    }
    catch (loadError) {
      console.error('Error loading S3 config:', loadError)
    }

    const completeSettings = {
      ...settings,
      s3Sync: s3Sync || undefined,
    }

    return { configs, settings: completeSettings }
  }
  catch (error) {
    console.error('Error loading complete settings:', error)
    return {
      configs: [],
      settings: {
        overrideClaudeCommand: false,
        balanceMode: {
          enableByDefault: false,
          strategy: LoadBalancerStrategy.Fallback,
          healthCheck: {
            enabled: true,
            intervalMs: 30000,
          },
          failedEndpoint: {
            banDurationSeconds: 300,
          },
          speedFirst: {
            responseTimeWindowMs: 300000,
            minSamples: 2,
            speedTestIntervalSeconds: 300,
            speedTestStrategy: SpeedTestStrategy.ResponseTime,
          },
        },
        s3Sync: undefined,
      },
    }
  }
}

// Initialize config file watcher
function initConfigWatcher(): void {
  if (configWatcher) {
    return // Already watching
  }

  try {
    // Get the actual config path (could be cloud or local)
    const configFileManager = ConfigManager.getInstance()
    const configFile = (configFileManager as any).configFileManager?.getActualConfigPath?.() || CONFIG_FILE

    console.log('[Config Watcher] Watching config file at:', configFile)

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

            // Load updated configs and settings (including S3 config)
            const { configs, settings } = await loadCompleteSettings()

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

// Initialize S3 config file watcher
function initS3ConfigWatcher(): void {
  if (s3ConfigWatcher) {
    return // Already watching
  }

  try {
    // Get the actual S3 config path (could be cloud or local)
    // S3ConfigFileManager uses getActualS3ConfigPath() internally when loading/saving
    // For watching, we need to determine the actual path based on sync config
    let s3ConfigFile = S3_CONFIG_FILE

    try {
      const syncConfigFile = path.join(os.homedir(), '.start-claude', 'sync.json')
      if (existsSync(syncConfigFile)) {
        const syncConfigContent = readFileSync(syncConfigFile, 'utf-8')
        const syncConfig = JSON.parse(syncConfigContent)

        // Only use cloud path for iCloud, OneDrive, or custom sync (not S3)
        if (syncConfig.enabled && syncConfig.provider !== 's3') {
          const cloudPath = syncConfig.cloudPath || syncConfig.customPath
          if (cloudPath) {
            const cloudS3ConfigPath = path.join(cloudPath, '.start-claude', 's3-config.json')
            // Check if cloud S3 config exists
            if (existsSync(cloudS3ConfigPath)) {
              s3ConfigFile = cloudS3ConfigPath
            }
          }
        }
      }
    }
    catch (error) {
      // Fall back to local path
      console.log('[S3 Config Watcher] Using local S3 config path:', error)
    }

    console.log('[S3 Config Watcher] Watching S3 config file at:', s3ConfigFile)

    // S3 config file might not exist initially, that's okay
    if (!existsSync(s3ConfigFile)) {
      console.log('S3 config file does not exist yet, will watch for creation')
      // We'll still set up the watcher in case the file is created later
    }

    let lastModified = 0

    // Get initial modification time if file exists
    if (existsSync(s3ConfigFile)) {
      const stats = statSync(s3ConfigFile)
      lastModified = stats.mtime.getTime()
    }

    const watchCallback = (): void => {
      void (async () => {
        try {
          const stats = existsSync(s3ConfigFile) ? statSync(s3ConfigFile) : null

          // Handle file creation or modification
          if (stats && stats.mtime.getTime() !== lastModified) {
            lastModified = stats.mtime.getTime()

            console.log('S3 config file changed, broadcasting update to WebSocket clients')

            // Load updated configs and settings (including S3 config)
            // S3ConfigFileManager will automatically load from the actual path
            const { configs, settings } = await loadCompleteSettings()

            broadcastConfigUpdate(configs, settings)
          }
          // Handle file deletion
          else if (!stats && lastModified !== 0) {
            lastModified = 0
            console.log('S3 config file deleted, broadcasting update to WebSocket clients')

            // Load updated configs and settings (S3 config will be undefined)
            const { configs, settings } = await loadCompleteSettings()

            broadcastConfigUpdate(configs, settings)
          }
        }
        catch (error) {
          console.error('Error in S3 config file watcher:', error)
        }
      })()
    }

    // Start watching
    watchFile(s3ConfigFile, { interval: 1000 }, watchCallback)

    s3ConfigWatcher = {
      cleanup: () => {
        unwatchFile(s3ConfigFile, watchCallback)
        s3ConfigWatcher = null
        console.log('S3 config file watcher stopped')
      },
    }

    console.log('S3 config file watcher started for:', s3ConfigFile)
  }
  catch (error) {
    console.error('Failed to setup S3 config file watcher:', error)
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

    // Initialize file watchers when WebSocket server starts
    initConfigWatcher()
    initS3ConfigWatcher()

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

  // Clean up watchers
  if (configWatcher) {
    configWatcher.cleanup()
  }
  if (s3ConfigWatcher) {
    s3ConfigWatcher.cleanup()
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
