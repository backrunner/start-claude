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

import type { LLMChatRequest, Message, ToolCall } from '../../types/llm'

// Extended types for Gemini-specific functionality (only add what's missing from base types)
interface GeminiMessage extends Message {
  tool_calls?: ToolCall[]
}

// Content type for Gemini-specific content items

interface Part {
  text?: string
  functionCall?: {
    id?: string
    name?: string
    args?: any
  }
  functionResponse?: {
    name?: string
    response?: any
  }
  file_data?: {
    mime_type?: string
    file_uri?: string
  }
  inlineData?: {
    mime_type?: string
    data?: string
  }
  thought?: boolean
  thoughtSignature?: string
}

interface Content {
  role?: 'user' | 'model'
  parts?: Part[]
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseFunctionArgs(argumentsText: string | undefined): Record<string, any> {
  if (!argumentsText) {
    return {}
  }

  try {
    const parsed = JSON.parse(argumentsText) as unknown
    return isRecord(parsed) ? parsed : { value: parsed }
  }
  catch {
    return { text: argumentsText }
  }
}

function normalizeFunctionArgs(input: unknown): Record<string, any> {
  if (isRecord(input)) {
    return input
  }
  if (typeof input === 'string') {
    return parseFunctionArgs(input)
  }
  if (input === undefined || input === null) {
    return {}
  }
  return { value: input }
}

function getThinkingLevel(budgetTokens?: number): string {
  if (!budgetTokens) {
    return 'medium'
  }
  if (budgetTokens <= 10000) {
    return 'low'
  }
  if (budgetTokens <= 50000) {
    return 'medium'
  }
  return 'high'
}

function collectToolNames(messages: Message[]): Map<string, string> {
  const toolNames = new Map<string, string>()

  for (const message of messages) {
    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.id) {
          toolNames.set(toolCall.id, toolCall.function.name)
        }
      }
    }

    if (!Array.isArray(message.content)) {
      continue
    }

    for (const part of message.content) {
      if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
        toolNames.set(part.id, part.name)
      }
    }
  }

  return toolNames
}

function formatFunctionResponsePart(
  toolUseId: unknown,
  content: unknown,
  toolNames: Map<string, string>,
): Part | null {
  if (typeof toolUseId !== 'string' || !toolUseId) {
    return null
  }

  return {
    functionResponse: {
      name: toolNames.get(toolUseId) || toolUseId,
      response: { result: content ?? '' },
    },
  }
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
      const parametersJsonSchema = tool.input_schema
        ? JSON.parse(JSON.stringify(tool.input_schema))
        : tool.input_schema
      cleanupParameters(parametersJsonSchema)

      return {
        name: tool.name,
        description: tool.description,
        parametersJsonSchema,
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

  const contents: Content[] = []
  const toolNames = collectToolNames(request.messages)
  const toolResponses = request.messages.filter(message => message.role === 'tool')

  request.messages
    .filter(message => message.role !== 'tool')
    .forEach((message: GeminiMessage) => {
      let role: 'user' | 'model'
      if (message.role === 'assistant') {
        role = 'model'
      }
      else if (['user', 'system'].includes(message.role)) {
        role = 'user'
      }
      else {
        role = 'user'
      }

      const parts: Part[] = []
      if (typeof message.content === 'string') {
        const part: Part = {
          text: message.content,
        }
        if (message.thinking?.signature) {
          part.thoughtSignature = message.thinking.signature
        }
        parts.push(part)
      }
      else if (Array.isArray(message.content)) {
        let toolUsePartIndex = 0
        for (const content of message.content) {
          if (content.type === 'text') {
            parts.push({
              text: content.text || '',
            })
            continue
          }

          if (content.type === 'image_url') {
            if (content.image_url && content.image_url.url.startsWith('http')) {
              parts.push({
                file_data: {
                  mime_type: content.media_type,
                  file_uri: content.image_url.url,
                },
              })
              continue
            }
            else if (content.image_url) {
              parts.push({
                inlineData: {
                  mime_type: content.media_type,
                  data: content.image_url.url?.split(',')?.pop() || content.image_url.url,
                },
              })
              continue
            }
          }

          if (content.type === 'image' && content.source) {
            if (content.source.type === 'base64') {
              parts.push({
                inlineData: {
                  mime_type: content.source.media_type,
                  data: content.source.data,
                },
              })
              continue
            }

            if (content.source.url) {
              parts.push({
                file_data: {
                  mime_type: content.source.media_type,
                  file_uri: content.source.url,
                },
              })
              continue
            }
          }

          if (content.type === 'tool_use' && typeof content.id === 'string' && typeof content.name === 'string') {
            parts.push({
              functionCall: {
                id: content.id,
                name: content.name,
                args: normalizeFunctionArgs(content.input),
              },
              thoughtSignature:
                toolUsePartIndex === 0 && message.thinking?.signature
                  ? message.thinking.signature
                  : undefined,
            })
            toolUsePartIndex++
            continue
          }

          if (content.type === 'tool_result') {
            const functionResponsePart = formatFunctionResponsePart(
              content.tool_use_id,
              content.content,
              toolNames,
            )
            if (functionResponsePart) {
              parts.push(functionResponsePart)
            }
          }
        }
      }
      else if (message.content && typeof message.content === 'object') {
        if (typeof message.content.text === 'string') {
          parts.push({ text: message.content.text })
        }
        else {
          parts.push({ text: JSON.stringify(message.content) })
        }
      }

      if (Array.isArray(message.tool_calls)) {
        parts.push(
          ...message.tool_calls.map((toolCall, index) => {
            return {
              functionCall: {
                id:
                  toolCall.id
                  || `tool_${Math.random().toString(36).substring(2, 15)}`,
                name: toolCall.function.name,
                args: parseFunctionArgs(toolCall.function.arguments),
              },
              thoughtSignature:
                index === 0 && message.thinking?.signature
                  ? message.thinking.signature
                  : undefined,
            }
          }),
        )
      }

      if (parts.length === 0) {
        parts.push({ text: '' })
      }

      contents.push({
        role,
        parts,
      })

      if (role === 'model' && message.tool_calls?.length) {
        const functionResponses = message.tool_calls.map((toolCall) => {
          const response = toolResponses.find(item => item.tool_call_id === toolCall.id)
          return {
            functionResponse: {
              name: toolCall.function.name,
              response: { result: response?.content ?? '' },
            },
          }
        })

        contents.push({
          role: 'user',
          parts: functionResponses,
        })
      }
    })

  const generationConfig: Record<string, any> = {}

  const thinkingBudget = request.reasoning?.max_tokens ?? request.thinking?.budget_tokens
  const reasoningEnabled = request.reasoning
    ? request.reasoning.enabled !== false
      && (
        request.reasoning.enabled === true
        || request.reasoning.effort !== undefined
        || request.reasoning.max_tokens !== undefined
      )
      && request.reasoning.effort !== 'none'
    : false
  const thinkingEnabled = reasoningEnabled
    || request.thinking?.type === 'enabled'
    || request.thinking?.enabled === true

  if (thinkingEnabled) {
    generationConfig.thinkingConfig = {
      includeThoughts: true,
    }

    if (request.model.includes('gemini-3')) {
      generationConfig.thinkingConfig.thinkingLevel = request.reasoning?.effort || getThinkingLevel(thinkingBudget)
    }
    else {
      const thinkingBudgets = request.model.includes('pro') ? [128, 32768] : [0, 24576]

      if (typeof thinkingBudget === 'number') {
        generationConfig.thinkingConfig.thinkingBudget = Math.min(
          Math.max(thinkingBudget, thinkingBudgets[0]),
          thinkingBudgets[1],
        )
      }
    }
  }

  const body: Record<string, any> = {
    contents,
    tools: tools.length ? tools : undefined,
    generationConfig: Object.keys(generationConfig).length > 0 ? generationConfig : undefined,
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
    const parts = jsonResponse.candidates?.[0]?.content?.parts || []
    const nonThinkingParts: Part[] = []
    let thinkingContent = ''
    let thinkingSignature = ''

    for (const part of parts) {
      if (part.text && part.thought === true) {
        thinkingContent += part.text
      }
      else {
        nonThinkingParts.push(part)
      }

      if (part.thoughtSignature) {
        thinkingSignature = part.thoughtSignature
      }
    }

    const tool_calls
      = nonThinkingParts
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
    const textContent = nonThinkingParts
      ?.filter((part: Part) => part.text)
      ?.map((part: Part) => part.text)
      ?.join('\n') || ''
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
            content: textContent,
            role: 'assistant',
            tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
            thinking: thinkingContent || thinkingSignature
              ? {
                  content: thinkingContent || '(no content)',
                  signature: thinkingSignature || undefined,
                }
              : undefined,
          },
        },
      ],
      created: Number.parseInt(`${new Date().getTime() / 1000}`, 10),
      model: jsonResponse.modelVersion,
      object: 'chat.completion',
      usage: {
        completion_tokens: jsonResponse.usageMetadata?.candidatesTokenCount,
        prompt_tokens: jsonResponse.usageMetadata?.promptTokenCount,
        cache_read_input_tokens:
          jsonResponse.usageMetadata?.cachedContentTokenCount || null,
        output_tokens_details: {
          reasoning_tokens: jsonResponse.usageMetadata?.thoughtsTokenCount || 0,
        },
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
    let signatureSent = false
    let contentIndex = 0
    let hasThinkingContent = false
    let pendingContent = ''
    let toolCallIndex = -1

    const processLine = (
      line: string,
      controller: ReadableStreamDefaultController,
    ): void => {
      if (line.startsWith('data:')) {
        const chunkStr = line.slice(5).trim()
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

            parts
              .filter((part: Part) => part.text && part.thought === true)
              .forEach((part: Part) => {
                hasThinkingContent = true
                const thinkingChunk = {
                  choices: [
                    {
                      delta: {
                        role: 'assistant',
                        content: null,
                        thinking: {
                          content: part.text || '',
                        },
                      },
                      finish_reason: null,
                      index: contentIndex,
                      logprobs: null,
                    },
                  ],
                  created: Number.parseInt(`${new Date().getTime() / 1000}`, 10),
                  id: chunk.responseId || '',
                  model: chunk.modelVersion || '',
                  object: 'chat.completion.chunk',
                }
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`),
                )
              })

            const signature = parts.find((part: Part) => part.thoughtSignature)?.thoughtSignature
            if (signature && !signatureSent) {
              if (!hasThinkingContent) {
                const emptyThinkingChunk = {
                  choices: [
                    {
                      delta: {
                        role: 'assistant',
                        content: null,
                        thinking: {
                          content: '(no content)',
                        },
                      },
                      finish_reason: null,
                      index: contentIndex,
                      logprobs: null,
                    },
                  ],
                  created: Number.parseInt(`${new Date().getTime() / 1000}`, 10),
                  id: chunk.responseId || '',
                  model: chunk.modelVersion || '',
                  object: 'chat.completion.chunk',
                }
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(emptyThinkingChunk)}\n\n`),
                )
              }

              const signatureChunk = {
                choices: [
                  {
                    delta: {
                      role: 'assistant',
                      content: null,
                      thinking: {
                        signature,
                      },
                    },
                    finish_reason: null,
                    index: contentIndex,
                    logprobs: null,
                  },
                ],
                created: Number.parseInt(`${new Date().getTime() / 1000}`, 10),
                id: chunk.responseId || '',
                model: chunk.modelVersion || '',
                object: 'chat.completion.chunk',
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(signatureChunk)}\n\n`),
              )
              signatureSent = true
              contentIndex++
            }

            if (hasThinkingContent && !signatureSent && chunk.modelVersion && !String(chunk.modelVersion).includes('3')) {
              const syntheticSignatureChunk = {
                choices: [
                  {
                    delta: {
                      role: 'assistant',
                      content: null,
                      thinking: {
                        signature: `gemini_${Date.now()}`,
                      },
                    },
                    finish_reason: null,
                    index: contentIndex,
                    logprobs: null,
                  },
                ],
                created: Number.parseInt(`${new Date().getTime() / 1000}`, 10),
                id: chunk.responseId || '',
                model: chunk.modelVersion || '',
                object: 'chat.completion.chunk',
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(syntheticSignatureChunk)}\n\n`),
              )
              signatureSent = true
              contentIndex++
            }

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
              .filter((part: Part) => part.text && part.thought !== true)
              .map((part: Part) => part.text)
              .join('\n')

            if (hasThinkingContent && textContent && !signatureSent) {
              pendingContent += textContent
              return
            }

            const res = {
              choices: [
                {
                  delta: {
                    role: 'assistant',
                    content: textContent || pendingContent || '',
                    tool_calls: tool_calls.length > 0
                      ? tool_calls.map((toolCall: any) => ({
                          ...toolCall,
                          index: ++toolCallIndex,
                        }))
                      : undefined,
                  },
                  finish_reason: candidate.finishReason?.toLowerCase() || null,
                  index: candidate.index || contentIndex,
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
                cache_read_input_tokens:
                  chunk.usageMetadata?.cachedContentTokenCount || null,
                output_tokens_details: {
                  reasoning_tokens: chunk.usageMetadata?.thoughtsTokenCount || 0,
                },
                total_tokens: chunk.usageMetadata?.totalTokenCount || 0,
              },
            }
            pendingContent = ''
            contentIndex++
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
