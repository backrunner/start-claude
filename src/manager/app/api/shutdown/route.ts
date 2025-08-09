import { NextRequest, NextResponse } from 'next/server'
import { broadcastShutdown } from '../ws/route'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const initiateShutdown = (): void => {
  console.log('Shutdown initiated...')
  
  // First broadcast shutdown message to WebSocket clients
  try {
    broadcastShutdown()
    console.log('WebSocket shutdown message broadcasted')
  } catch (error) {
    console.error('Failed to broadcast shutdown via WebSocket:', error)
  }

  // Schedule the server shutdown after a brief delay to allow response to be sent
  setTimeout(() => {
    console.log('Manager server shutting down now...')
    process.exit(0)
  }, 200)
  
  // Fallback: Force exit after a longer delay if normal exit doesn't work
  setTimeout(() => {
    console.log('Force killing manager server...')
    process.exit(1)
  }, 1000)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Handle both regular fetch requests and sendBeacon requests
    const contentType = request.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      // Regular JSON request
      await request.json().catch(() => ({})) // Don't fail if body is empty
    }
    
    console.log('Shutdown request received')
    initiateShutdown()
    
    return NextResponse.json({ success: true, message: 'Server shutdown initiated' })
  } catch (error) {
    console.error('Shutdown API error:', error)
    // Still initiate shutdown even if there's an error
    initiateShutdown()
    return NextResponse.json({ error: 'Failed to process shutdown request, but shutdown initiated' }, { status: 500 })
  }
}

// Handle sendBeacon requests which might come as different HTTP methods
export async function GET(): Promise<NextResponse> {
  console.log('Shutdown request received (GET)')
  initiateShutdown()
  return NextResponse.json({ success: true, message: 'Server shutdown initiated' })
}

export async function PUT(): Promise<NextResponse> {
  console.log('Shutdown request received (PUT)')
  initiateShutdown()
  return NextResponse.json({ success: true, message: 'Server shutdown initiated' })
}