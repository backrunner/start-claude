import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/proxy-status
 * Check if the proxy server is running and get its status
 * Query params:
 * - port: proxy server port (default: 2333)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams
    const port = searchParams.get('port') || '2333'

    // Try to connect to the proxy server's status endpoint
    const proxyUrl = `http://localhost:${port}/__status`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

    try {
      // Send GET request to the proxy status endpoint
      const response = await fetch(proxyUrl, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        // Proxy is running and returned status
        const status = await response.json()
        return NextResponse.json(status)
      }
      else {
        // Proxy responded but with an error
        return NextResponse.json(
          {
            error: 'Proxy server returned an error',
            details: `HTTP ${response.status}`,
          },
          { status: response.status },
        )
      }
    }
    catch (fetchError) {
      clearTimeout(timeoutId)

      // Proxy is not running or not reachable
      return NextResponse.json(
        {
          error: 'Proxy server is not running',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        },
        { status: 503 },
      )
    }
  }
  catch (error) {
    console.error('[ProxyStatus API] Error checking proxy status:', error)
    return NextResponse.json(
      {
        error: 'Failed to check proxy status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
