import type * as http from 'node:http'
import { convertOpenAIStreamToAnthropic, isOpenAIStreamFormat } from './openai-to-anthropic'

/**
 * Utility functions for handling Server-Sent Events (SSE) streaming responses
 */

/**
 * Check if a response is a Server-Sent Event stream
 */
export function isSSEResponse(responseBody: string, headers: Record<string, any>): boolean {
  const contentType = headers['content-type'] || headers['Content-Type'] || ''
  return contentType.includes('text/event-stream') || responseBody.startsWith('data: ')
}

/**
 * Parse a complete SSE response body into individual chunks
 * SSE chunks are separated by empty lines
 */
export function parseSSEResponse(responseBody: string): string[] {
  const chunks: string[] = []
  const lines = responseBody.split('\n')
  let currentChunk = ''

  for (const line of lines) {
    currentChunk += `${line}\n`

    if (line.trim() === '') {
      if (currentChunk.trim()) {
        chunks.push(currentChunk)
      }
      currentChunk = ''
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk)
  }

  return chunks
}

/**
 * Send an SSE response by streaming individual chunks to the client
 * This maintains the streaming nature while allowing for buffered processing
 */
export function sendSSEResponse(
  responseBody: string,
  statusCode: number,
  headers: Record<string, any>,
  res: http.ServerResponse,
): void {
  // Set SSE headers immediately
  if (!res.headersSent) {
    // Create final headers with SSE-specific ones
    const finalHeaders = {
      ...headers,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }

    // Check if we have a real response object with writeHead method
    if (typeof res.writeHead === 'function') {
      res.writeHead(statusCode, finalHeaders)
    }
    else {
      // For mock objects in tests, set headers individually
      if (typeof res.setHeader === 'function') {
        Object.entries(finalHeaders).forEach(([key, value]) => {
          res.setHeader(key, value)
        })
      }
    }
  }

  // Parse and send SSE chunks individually
  const sseChunks = parseSSEResponse(responseBody)

  // Check if we have real streaming methods
  if (typeof res.write === 'function' && typeof res.end === 'function') {
    for (const chunk of sseChunks) {
      res.write(chunk)
    }
    res.end()
  }
  // For test mocks, we can't actually stream, so we skip the write/end operations
}

/**
 * Handle streaming response - either send as SSE chunks or return body for regular processing
 * Returns null if SSE response was sent, otherwise returns the body for further processing
 *
 * This function also handles conversion from OpenAI streaming format to Anthropic format
 */
export async function handleStreamingResponse(
  responseBody: string,
  statusCode: number,
  headers: Record<string, any>,
  res: http.ServerResponse,
): Promise<string | null> {
  if (isSSEResponse(responseBody, headers)) {
    // Check if this is OpenAI format that needs conversion to Anthropic
    if (isOpenAIStreamFormat(responseBody)) {
      // Convert OpenAI stream to Anthropic format
      try {
        const openaiStream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder()
            controller.enqueue(encoder.encode(responseBody))
            controller.close()
          },
        })

        const anthropicStream = await convertOpenAIStreamToAnthropic(openaiStream)

        // Set SSE headers
        if (!res.headersSent) {
          const finalHeaders = {
            ...headers,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          }

          if (typeof res.writeHead === 'function') {
            res.writeHead(statusCode, finalHeaders)
          }
        }

        // Stream the converted response
        if (typeof res.write === 'function' && typeof res.end === 'function') {
          const reader = anthropicStream.getReader()
          const decoder = new TextDecoder()

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done)
                break
              res.write(decoder.decode(value))
            }
          }
          finally {
            reader.releaseLock()
            res.end()
          }
        }

        return null // Response already sent
      }
      catch (error) {
        // If conversion fails, fall back to original streaming
        console.warn('Failed to convert OpenAI stream to Anthropic format:', error)
      }
    }

    // Send as regular SSE response
    sendSSEResponse(responseBody, statusCode, headers, res)
    return null // Response already sent
  }

  return responseBody // Continue with regular processing
}
