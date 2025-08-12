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

// Extended types for Gemini-specific functionality (only add what's missing from base types)
interface GeminiMessage extends Message {
  tool_calls?: Array<{
    id?: string
    type: string
    function: {
      name: string
      arguments?: string
    }
  }>
}

// Content type for Gemini-specific content items

interface Part {
  text?: string
  functionCall?: {
    id?: string
    name?: string
    args?: any
  }
  file_data?: {
    mime_type?: string
    file_uri?: string
  }
  inlineData?: {
    mime_type?: string
    data?: string
  }
}

interface Content {
  role?: 'user' | 'model'
  parts?: Part[]
}

export function cleanupParameters(obj: any, keyName?: string): void {
  if (!obj || typeof obj !== 'object') {
    return
  }

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      cleanupParameters(item)
    })
    return
  }

  const validFields = new Set([
    'type',
    'format',
    'title',
    'description',
    'nullable',
    'enum',
    'maxItems',
    'minItems',
    'properties',
    'required',
    'minProperties',
    'maxProperties',
    'minLength',
    'maxLength',
    'pattern',
    'example',
    'anyOf',
    'propertyOrdering',
    'default',
    'items',
    'minimum',
    'maximum',
  ])

  if (keyName !== 'properties') {
    Object.keys(obj).forEach((key) => {
      if (!validFields.has(key)) {
        delete obj[key]
      }
    })
  }

  if (obj.enum && obj.type !== 'string') {
    delete obj.enum
  }

  if (
    obj.type === 'string'
    && obj.format
    && !['enum', 'date-time'].includes(obj.format)
  ) {
    delete obj.format
  }

  Object.keys(obj).forEach((key) => {
    cleanupParameters(obj[key], key)
  })
}

export function buildRequestBody(
  request: LLMChatRequest,
): Record<string, any> {
  const tools = []
  const functionDeclarations = request.tools
    ?.filter(tool => tool.name !== 'web_search')
    ?.map((tool) => {
      if (tool.input_schema) {
        cleanupParameters(tool.input_schema)
      }
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      }
    })
  if (functionDeclarations?.length) {
    tools.push({
      functionDeclarations,
    })
  }
  const webSearch = request.tools?.find(
    tool => tool.name === 'web_search',
  )
  if (webSearch) {
    tools.push({
      googleSearch: {},
    })
  }

  const contents = request.messages.map((message: GeminiMessage) => {
    let role: 'user' | 'model'
    if (message.role === 'assistant') {
      role = 'model'
    }
    else if (['user', 'system', 'tool'].includes(message.role)) {
      role = 'user'
    }
    else {
      role = 'user' // Default to user if role is not recognized
    }
    const parts = []
    if (typeof message.content === 'string') {
      parts.push({
        text: message.content,
      })
    }
    else if (Array.isArray(message.content)) {
      parts.push(
        ...message.content.map((content) => {
          if (content.type === 'text') {
            return {
              text: content.text || '',
            }
          }
          if (content.type === 'image_url') {
            if (content.image_url && content.image_url.url.startsWith('http')) {
              return {
                file_data: {
                  mime_type: content.media_type,
                  file_uri: content.image_url.url,
                },
              }
            }
            else if (content.image_url) {
              return {
                inlineData: {
                  mime_type: content.media_type,
                  data: content.image_url.url,
                },
              }
            }
          }
          return null // Explicitly return null for unhandled cases
        }).filter(Boolean),
      )
    }

    if (Array.isArray(message.tool_calls)) {
      parts.push(
        ...message.tool_calls.map((toolCall) => {
          return {
            functionCall: {
              id:
                toolCall.id
                || `tool_${Math.random().toString(36).substring(2, 15)}`,
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments || '{}'),
            },
          }
        }),
      )
    }
    return {
      role,
      parts,
    }
  })

  const body: Record<string, any> = {
    contents,
    tools: tools.length ? tools : undefined,
  }

  if (request.tool_choice) {
    const toolConfig: Record<string, any> = {
      functionCallingConfig: {},
    }
    if (request.tool_choice === 'auto') {
      toolConfig.functionCallingConfig.mode = 'auto'
    }
    else if (request.tool_choice === 'none') {
      toolConfig.functionCallingConfig.mode = 'none'
    }
    else if (request.tool_choice === 'required') {
      toolConfig.functionCallingConfig.mode = 'any'
    }
    else if (request.tool_choice && typeof request.tool_choice === 'object' && 'function' in request.tool_choice) {
      toolConfig.functionCallingConfig.mode = 'any'
      toolConfig.functionCallingConfig.allowedFunctionNames = [
        request.tool_choice.function.name,
      ]
    }
    body.toolConfig = toolConfig
  }

  return body
}

export function normalizeResponseFromGemini(
  request: Record<string, any>,
): LLMChatRequest {
  const contents = request.contents
  const tools = request.tools
  const model: string = request.model
  const max_tokens: number | undefined = request.max_tokens
  const temperature: number | undefined = request.temperature
  const stream: boolean | undefined = request.stream
  const tool_choice: any = request.tool_choice

  const chatRequest: LLMChatRequest = {
    messages: [],
    model,
    max_tokens,
    temperature,
    stream,
    tool_choice,
  }

  if (Array.isArray(contents)) {
    contents.forEach((content: Content) => {
      if (typeof content === 'string') {
        chatRequest.messages.push({
          role: 'user',
          content,
        })
      }
      else if (content && typeof content === 'object' && 'text' in content) {
        chatRequest.messages.push({
          role: 'user',
          content: (content as any).text || null,
        })
      }
      else if (content && content.role === 'user') {
        chatRequest.messages.push({
          role: 'user',
          content:
            content.parts?.map((part: Part) => ({
              type: 'text',
              text: part.text || '',
            })) || [],
        })
      }
      else if (content && content.role === 'model') {
        chatRequest.messages.push({
          role: 'assistant',
          content:
            content.parts?.map((part: Part) => ({
              type: 'text',
              text: part.text || '',
            })) || [],
        })
      }
    })
  }

  if (Array.isArray(tools)) {
    chatRequest.tools = []
    tools.forEach((tool) => {
      if (Array.isArray(tool.functionDeclarations)) {
        tool.functionDeclarations.forEach((func: any) => {
          chatRequest.tools!.push({
            name: func.name,
            description: func.description,
            input_schema: func.parameters,
          })
        })
      }
    })
  }

  return chatRequest
}

export async function formatResponseFromGemini(
  response: Response,
  providerName: string = 'Gemini',
  logger?: any,
): Promise<Response> {
  if (response.headers.get('Content-Type')?.includes('application/json')) {
    const jsonResponse: any = await response.json()
    const tool_calls
      = jsonResponse.candidates?.[0]?.content?.parts
        ?.filter((part: Part) => part.functionCall)
        ?.map((part: Part) => ({
          id:
            part.functionCall?.id
            || `tool_${Math.random().toString(36).substring(2, 15)}`,
          type: 'function',
          function: {
            name: part.functionCall?.name,
            arguments: JSON.stringify(part.functionCall?.args || {}),
          },
        })) || []
    const res = {
      id: jsonResponse.responseId,
      choices: [
        {
          finish_reason:
            (
              jsonResponse.candidates?.[0]?.finishReason as string
            )?.toLowerCase() || null,
          index: 0,
          message: {
            content:
              jsonResponse.candidates?.[0]?.content?.parts
                ?.filter((part: Part) => part.text)
                ?.map((part: Part) => part.text)
                ?.join('\n') || '',
            role: 'assistant',
            tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
          },
        },
      ],
      created: Number.parseInt(`${new Date().getTime() / 1000}`, 10),
      model: jsonResponse.modelVersion,
      object: 'chat.completion',
      usage: {
        completion_tokens: jsonResponse.usageMetadata?.candidatesTokenCount,
        prompt_tokens: jsonResponse.usageMetadata?.promptTokenCount,
        cached_content_token_count:
          jsonResponse.usageMetadata?.cachedContentTokenCount || null,
        total_tokens: jsonResponse.usageMetadata?.totalTokenCount,
      },
    }
    return new Response(JSON.stringify(res), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  else if (response.headers.get('Content-Type')?.includes('stream')) {
    if (!response.body) {
      return response
    }

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    const processLine = (
      line: string,
      controller: ReadableStreamDefaultController,
    ): void => {
      if (line.startsWith('data: ')) {
        const chunkStr = line.slice(6).trim()
        if (chunkStr) {
          logger?.debug({ chunkStr }, `${providerName} chunk:`)
          try {
            const chunk = JSON.parse(chunkStr)

            // Check if chunk has valid structure
            if (!chunk.candidates || !chunk.candidates[0]) {
              console.log(`Invalid chunk structure:`, chunkStr)
              return
            }

            const candidate = chunk.candidates[0]
            const parts = candidate.content?.parts || []

            const tool_calls = parts
              .filter((part: Part) => part.functionCall)
              .map((part: Part) => ({
                id:
                  part.functionCall?.id
                  || `tool_${Math.random().toString(36).substring(2, 15)}`,
                type: 'function',
                function: {
                  name: part.functionCall?.name,
                  arguments: JSON.stringify(part.functionCall?.args || {}),
                },
              }))

            const textContent = parts
              .filter((part: Part) => part.text)
              .map((part: Part) => part.text)
              .join('\n')

            const res = {
              choices: [
                {
                  delta: {
                    role: 'assistant',
                    content: textContent || '',
                    tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
                  },
                  finish_reason: candidate.finishReason?.toLowerCase() || null,
                  index: candidate.index || (tool_calls.length > 0 ? 1 : 0),
                  logprobs: null,
                },
              ],
              created: Number.parseInt(`${new Date().getTime() / 1000}`, 10),
              id: chunk.responseId || '',
              model: chunk.modelVersion || '',
              object: 'chat.completion.chunk',
              system_fingerprint: 'fp_a49d71b8a1',
              usage: {
                completion_tokens:
                  chunk.usageMetadata?.candidatesTokenCount || 0,
                prompt_tokens: chunk.usageMetadata?.promptTokenCount || 0,
                cached_content_token_count:
                  chunk.usageMetadata?.cachedContentTokenCount || null,
                total_tokens: chunk.usageMetadata?.totalTokenCount || 0,
              },
            }
            if (candidate?.groundingMetadata?.groundingChunks?.length) {
              (res.choices[0].delta as any).annotations
                = candidate.groundingMetadata.groundingChunks.map(
                  (groundingChunk: any, index: number) => {
                    const support
                      = candidate?.groundingMetadata?.groundingSupports?.filter(
                        (item: any) => item.groundingChunkIndices?.includes(index),
                      )
                    return {
                      type: 'url_citation',
                      url_citation: {
                        url: groundingChunk?.web?.uri || '',
                        title: groundingChunk?.web?.title || '',
                        content: support?.[0]?.segment?.text || '',
                        start_index: support?.[0]?.segment?.startIndex || 0,
                        end_index: support?.[0]?.segment?.endIndex || 0,
                      },
                    }
                  },
                )
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(res)}\n\n`),
            )
          }
          catch (error: any) {
            logger?.error(
              `Error parsing ${providerName} stream chunk`,
              chunkStr,
              error.message,
            )
          }
        }
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader()
        let buffer = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              if (buffer) {
                processLine(buffer, controller)
              }
              break
            }

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')

            buffer = lines.pop() || ''

            for (const line of lines) {
              processLine(line, controller)
            }
          }
        }
        catch (error) {
          controller.error(error)
        }
        finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  return response
}
