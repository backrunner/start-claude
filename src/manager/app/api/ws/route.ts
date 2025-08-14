import { NextResponse } from 'next/server'
import { WebSocketServer } from 'ws'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Store WebSocket server instance
let wsServer: any = null

// Store active WebSocket connections
const activeConnections = new Set<any>()

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
