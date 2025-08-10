/*
 * Gemini transformer utilities for Google's Generative AI API
 * 
 * This implementation is inspired by and partially based on the work from:
 * https://github.com/musistudio/llms
 * 
 * Original code licensed under MIT License
 * Copyright (c) musistudio
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

import type { LLMChatRequest, Message } from '../types/llm'

interface GeminiMessage {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

interface GeminiRequest {
  contents: GeminiMessage[]
  generationConfig?: {
    maxOutputTokens?: number
    temperature?: number
    topP?: number
    stopSequences?: string[]
  }
  tools?: Array<{
    functionDeclarations: Array<{
      name: string
      description?: string
      parameters: Record<string, any>
    }>
  }>
}

export function buildRequestBody(request: LLMChatRequest): GeminiRequest {
  const contents = convertMessagesToGemini(request.messages)

  const geminiRequest: GeminiRequest = {
    contents,
  }

  // Add generation config if provided
  if (request.max_tokens || request.temperature || request.top_p || request.stop_sequences) {
    geminiRequest.generationConfig = {}

    if (request.max_tokens) {
      geminiRequest.generationConfig.maxOutputTokens = request.max_tokens
    }
    if (request.temperature !== undefined) {
      geminiRequest.generationConfig.temperature = request.temperature
    }
    if (request.top_p !== undefined) {
      geminiRequest.generationConfig.topP = request.top_p
    }
    if (request.stop_sequences) {
      geminiRequest.generationConfig.stopSequences = request.stop_sequences
    }
  }

  // Add tools if provided
  if (request.tools && request.tools.length > 0) {
    geminiRequest.tools = [{
      functionDeclarations: request.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      })),
    }]
  }

  return geminiRequest
}

function convertMessagesToGemini(messages: Message[]): GeminiMessage[] {
  const geminiMessages: GeminiMessage[] = []

  for (const message of messages) {
    let role: 'user' | 'model'

    // Convert roles
    if (message.role === 'user') {
      role = 'user'
    }
    else if (message.role === 'assistant') {
      role = 'model'
    }
    else if (message.role === 'system') {
      // System messages are typically added as user messages in Gemini
      role = 'user'
    }
    else {
      continue // Skip unknown roles
    }

    // Extract text content
    let textContent: string
    if (typeof message.content === 'string') {
      textContent = message.content
    }
    else if (Array.isArray(message.content)) {
      // Extract text from content array
      textContent = message.content
        .filter(item => item.type === 'text' || item.text)
        .map(item => item.text || item.source)
        .filter(Boolean)
        .join('\n')
    }
    else {
      continue // Skip messages with no valid content
    }

    if (textContent.trim()) {
      geminiMessages.push({
        role,
        parts: [{ text: textContent }],
      })
    }
  }

  return geminiMessages
}

export async function transformRequestOut(request: any): Promise<LLMChatRequest> {
  // Transform from Gemini format back to unified format
  return {
    model: request.model || 'gemini-pro',
    messages: request.contents?.map((content: GeminiMessage) => ({
      role: content.role === 'model' ? 'assistant' : 'user',
      content: content.parts?.[0]?.text || '',
    })) || [],
    max_tokens: request.generationConfig?.maxOutputTokens,
    temperature: request.generationConfig?.temperature,
    top_p: request.generationConfig?.topP,
    stream: request.stream,
    tools: request.tools?.[0]?.functionDeclarations?.map((func: any) => ({
      name: func.name,
      description: func.description,
      input_schema: func.parameters,
    })),
    stop_sequences: request.generationConfig?.stopSequences,
  }
}

export async function transformResponseOut(response: Response): Promise<Response> {
  if (response.headers.get('Content-Type')?.includes('application/json')) {
    try {
      const geminiResponse = await response.json()

      // Transform Gemini response to OpenAI-compatible format
      const transformedResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gemini-pro',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || '',
          },
          finish_reason: getFinishReason(geminiResponse.candidates?.[0]?.finishReason),
        }],
        usage: {
          prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
          completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
        },
      }

      return new Response(JSON.stringify(transformedResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      })
    }
    catch (error) {
      console.error('Error transforming Gemini response:', error)
      return response
    }
  }
  else if (response.headers.get('Content-Type')?.includes('stream')
    || response.headers.get('Content-Type')?.includes('text/plain')) {
    // Handle streaming responses
    if (!response.body) {
      return response
    }

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done)
              break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const geminiData = JSON.parse(line.slice(6))

                  // Transform Gemini streaming format to OpenAI format
                  const transformedChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: 'gemini-pro',
                    choices: [{
                      index: 0,
                      delta: {
                        role: 'assistant',
                        content: geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '',
                      },
                      finish_reason: getFinishReason(geminiData.candidates?.[0]?.finishReason),
                    }],
                  }

                  const transformedLine = `data: ${JSON.stringify(transformedChunk)}\n\n`
                  controller.enqueue(encoder.encode(transformedLine))
                }
                catch (error) {
                  console.error('Error parsing Gemini streaming data:', error)
                  // Pass through original line if parsing fails
                  controller.enqueue(encoder.encode(`${line}\n`))
                }
              }
              else if (line.trim()) {
                controller.enqueue(encoder.encode(`${line}\n`))
              }
            }
          }

          // Send completion marker
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        }
        catch (error) {
          console.error('Stream error:', error)
          controller.error(error)
        }
        finally {
          try {
            reader.releaseLock()
          }
          catch (e) {
            console.error('Error releasing reader lock:', e)
          }
          controller.close()
        }
      },
    })

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  return response
}

function getFinishReason(geminiFinishReason?: string): string {
  switch (geminiFinishReason) {
    case 'STOP':
      return 'stop'
    case 'MAX_TOKENS':
      return 'length'
    case 'SAFETY':
      return 'content_filter'
    case 'RECITATION':
      return 'content_filter'
    case undefined:
      return 'stop'
    default:
      return 'stop'
  }
}
