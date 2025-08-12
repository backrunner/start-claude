import { v4 as uuidv4 } from 'uuid'

/**
 * Universal converter from OpenAI format to Anthropic format
 * This handles both streaming and non-streaming responses
 */

interface OpenAIMessage {
  role: string
  content?: string
  tool_calls?: Array<{
    id: string
    type: string
    function: {
      name: string
      arguments: string
    }
    index?: number // Add index for streaming tool calls
  }>
  annotations?: Array<{
    type: string
    url_citation: {
      url: string
      title: string
      content?: string
      start_index?: number
      end_index?: number
    }
  }>
}

interface OpenAIChoice {
  message?: OpenAIMessage
  delta?: Partial<OpenAIMessage> & {
    thinking?: {
      content?: string
      signature?: string
    }
  }
  finish_reason?: string
  index?: number
}

interface OpenAIResponse {
  id?: string
  model?: string
  choices: OpenAIChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

interface OpenAIStreamChunk extends OpenAIResponse {
  object: 'chat.completion.chunk'
  error?: any // Allow for error responses
}

/**
 * Convert OpenAI non-streaming response to Anthropic format
 */
export function convertOpenAIResponseToAnthropic(openaiResponse: OpenAIResponse): any {
  const choice = openaiResponse.choices[0]
  if (!choice || !choice.message) {
    throw new Error('No choices found in OpenAI response')
  }

  const content: any[] = []

  // Handle annotations (web search results)
  if (choice.message.annotations) {
    const id = `srvtoolu_${uuidv4()}`
    content.push({
      type: 'server_tool_use',
      id,
      name: 'web_search',
      input: {
        query: '',
      },
    })
    content.push({
      type: 'web_search_tool_result',
      tool_use_id: id,
      content: choice.message.annotations.map(item => ({
        type: 'web_search_result',
        url: item.url_citation.url,
        title: item.url_citation.title,
      })),
    })
  }

  // Handle text content
  if (choice.message.content) {
    content.push({
      type: 'text',
      text: choice.message.content,
    })
  }

  // Handle tool calls
  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    choice.message.tool_calls.forEach((toolCall) => {
      let parsedInput = {}
      try {
        const argumentsStr = toolCall.function.arguments || '{}'
        if (typeof argumentsStr === 'object') {
          parsedInput = argumentsStr
        }
        else if (typeof argumentsStr === 'string') {
          parsedInput = JSON.parse(argumentsStr)
        }
      }
      catch {
        parsedInput = { text: toolCall.function.arguments || '' }
      }

      content.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.function.name,
        input: parsedInput,
      })
    })
  }

  const stopReasonMapping: Record<string, string> = {
    stop: 'end_turn',
    length: 'max_tokens',
    tool_calls: 'tool_use',
    content_filter: 'stop_sequence',
  }

  return {
    id: openaiResponse.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: openaiResponse.model || 'unknown',
    content,
    stop_reason: stopReasonMapping[choice.finish_reason || 'stop'] || 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: openaiResponse.usage?.prompt_tokens || 0,
      output_tokens: openaiResponse.usage?.completion_tokens || 0,
    },
  }
}

/**
 * Convert OpenAI streaming response to Anthropic SSE format
 */
export async function convertOpenAIStreamToAnthropic(openaiStream: ReadableStream): Promise<ReadableStream> {
  const readable = new ReadableStream({
    start: async (controller) => {
      const encoder = new TextEncoder()
      const messageId = `msg_${Date.now()}`
      let model = 'unknown'
      let hasStarted = false
      let hasTextContentStarted = false
      let hasFinished = false
      const toolCalls = new Map<number, any>()
      const toolCallIndexToContentBlockIndex = new Map<number, number>()
      let contentChunks = 0
      let toolCallChunks = 0
      let isClosed = false
      let isThinkingStarted = false
      let contentIndex = 0

      const safeEnqueue = (data: Uint8Array) => {
        if (!isClosed) {
          try {
            controller.enqueue(data)
          }
          catch (error) {
            if (error instanceof TypeError && error.message.includes('Controller is already closed')) {
              isClosed = true
            }
            else {
              throw error
            }
          }
        }
      }

      const safeClose = () => {
        if (!isClosed) {
          try {
            controller.close()
            isClosed = true
          }
          catch (error) {
            if (error instanceof TypeError && error.message.includes('Controller is already closed')) {
              isClosed = true
            }
            else {
              throw error
            }
          }
        }
      }

      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

      try {
        reader = openaiStream.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          if (isClosed)
            break

          const { done, value } = await reader.read()
          if (done)
            break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (isClosed || hasFinished)
              break

            if (!line.startsWith('data: '))
              continue
            const data = line.slice(6)

            if (data === '[DONE]')
              continue

            try {
              const chunk: OpenAIStreamChunk = JSON.parse(data)

              if (chunk.error) {
                const errorMessage = {
                  type: 'error',
                  message: {
                    type: 'api_error',
                    message: JSON.stringify(chunk.error),
                  },
                }
                safeEnqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(errorMessage)}\n\n`))
                continue
              }

              model = chunk.model || model

              if (!hasStarted && !isClosed && !hasFinished) {
                hasStarted = true
                const messageStart = {
                  type: 'message_start',
                  message: {
                    id: messageId,
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model,
                    stop_reason: null,
                    stop_sequence: null,
                  },
                }
                safeEnqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`))
              }

              const choice = chunk.choices?.[0]
              if (!choice)
                continue

              // Handle thinking content (Claude-specific)
              if (choice?.delta?.thinking && !isClosed && !hasFinished) {
                if (!isThinkingStarted) {
                  const contentBlockStart = {
                    type: 'content_block_start',
                    index: contentIndex,
                    content_block: { type: 'thinking', thinking: '' },
                  }
                  safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`))
                  isThinkingStarted = true
                }

                if (choice.delta.thinking.signature) {
                  const thinkingSignature = {
                    type: 'content_block_delta',
                    index: contentIndex,
                    delta: {
                      type: 'signature_delta',
                      signature: choice.delta.thinking.signature,
                    },
                  }
                  safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(thinkingSignature)}\n\n`))

                  const contentBlockStop = {
                    type: 'content_block_stop',
                    index: contentIndex,
                  }
                  safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`))
                  contentIndex++
                }
                else if (choice.delta.thinking.content) {
                  const thinkingChunk = {
                    type: 'content_block_delta',
                    index: contentIndex,
                    delta: {
                      type: 'thinking_delta',
                      thinking: choice.delta.thinking.content || '',
                    },
                  }
                  safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(thinkingChunk)}\n\n`))
                }
              }

              // Handle text content
              if (choice?.delta?.content && !isClosed && !hasFinished) {
                contentChunks++

                if (!hasTextContentStarted && !hasFinished) {
                  hasTextContentStarted = true
                  const contentBlockStart = {
                    type: 'content_block_start',
                    index: contentIndex,
                    content_block: {
                      type: 'text',
                      text: '',
                    },
                  }
                  safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`))
                }

                if (!isClosed && !hasFinished) {
                  const anthropicChunk = {
                    type: 'content_block_delta',
                    index: contentIndex,
                    delta: {
                      type: 'text_delta',
                      text: choice.delta.content,
                    },
                  }
                  safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(anthropicChunk)}\n\n`))
                }
              }

              // Handle annotations (web search results)
              if (choice?.delta?.annotations?.length && !isClosed && !hasFinished) {
                if (hasTextContentStarted) {
                  const contentBlockStop = {
                    type: 'content_block_stop',
                    index: contentIndex,
                  }
                  safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`))
                  hasTextContentStarted = false
                }

                choice.delta.annotations.forEach((annotation) => {
                  contentIndex++
                  const contentBlockStart = {
                    type: 'content_block_start',
                    index: contentIndex,
                    content_block: {
                      type: 'web_search_tool_result',
                      tool_use_id: `srvtoolu_${uuidv4()}`,
                      content: [
                        {
                          type: 'web_search_result',
                          title: annotation.url_citation.title,
                          url: annotation.url_citation.url,
                        },
                      ],
                    },
                  }
                  safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`))

                  const contentBlockStop = {
                    type: 'content_block_stop',
                    index: contentIndex,
                  }
                  safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`))
                })
              }

              // Handle tool calls
              if (choice?.delta?.tool_calls && !isClosed && !hasFinished) {
                toolCallChunks++
                const processedInThisChunk = new Set<number>()

                for (const toolCall of choice.delta.tool_calls) {
                  if (isClosed)
                    break
                  const toolCallIndex = toolCall.index ?? 0
                  if (processedInThisChunk.has(toolCallIndex))
                    continue
                  processedInThisChunk.add(toolCallIndex)

                  const isUnknownIndex = !toolCallIndexToContentBlockIndex.has(toolCallIndex)

                  if (isUnknownIndex) {
                    if (hasTextContentStarted) {
                      const contentBlockStop = {
                        type: 'content_block_stop',
                        index: contentIndex,
                      }
                      safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`))
                      contentIndex++
                    }

                    toolCallIndexToContentBlockIndex.set(toolCallIndex, contentIndex)
                    const toolCallId = toolCall.id || `call_${Date.now()}_${toolCallIndex}`
                    const toolCallName = toolCall.function?.name || `tool_${toolCallIndex}`

                    const contentBlockStart = {
                      type: 'content_block_start',
                      index: contentIndex,
                      content_block: {
                        type: 'tool_use',
                        id: toolCallId,
                        name: toolCallName,
                        input: {},
                      },
                    }
                    safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`))

                    const toolCallInfo = {
                      id: toolCallId,
                      name: toolCallName,
                      arguments: '',
                    }
                    toolCalls.set(toolCallIndex, toolCallInfo)
                  }
                  else if (toolCall.id && toolCall.function?.name) {
                    const existingToolCall = toolCalls.get(toolCallIndex)!
                    const wasTemporary = existingToolCall.id.startsWith('call_') && existingToolCall.name.startsWith('tool_')
                    if (wasTemporary) {
                      existingToolCall.id = toolCall.id
                      existingToolCall.name = toolCall.function.name
                    }
                  }

                  if (toolCall.function?.arguments && !isClosed && !hasFinished) {
                    const currentToolCall = toolCalls.get(toolCallIndex)
                    if (currentToolCall) {
                      currentToolCall.arguments += toolCall.function.arguments
                    }

                    try {
                      const anthropicChunk = {
                        type: 'content_block_delta',
                        index: contentIndex,
                        delta: {
                          type: 'input_json_delta',
                          partial_json: toolCall.function.arguments,
                        },
                      }
                      safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(anthropicChunk)}\n\n`))
                    }
                    catch {
                      try {
                        const fixedArgument = toolCall.function.arguments
                          .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                          .replace(/\\/g, '\\\\')
                          .replace(/"/g, '\\"')

                        const fixedChunk = {
                          type: 'content_block_delta',
                          index: contentIndex,
                          delta: {
                            type: 'input_json_delta',
                            partial_json: fixedArgument,
                          },
                        }
                        safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(fixedChunk)}\n\n`))
                      }
                      catch {
                        // Skip malformed tool call arguments
                      }
                    }
                  }
                }
              }

              // Handle finish reason
              if (choice?.finish_reason && !isClosed && !hasFinished) {
                hasFinished = true

                if ((hasTextContentStarted || toolCallChunks > 0) && !isClosed) {
                  const contentBlockStop = {
                    type: 'content_block_stop',
                    index: contentIndex,
                  }
                  safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`))
                }

                if (!isClosed) {
                  const stopReasonMapping: Record<string, string> = {
                    stop: 'end_turn',
                    length: 'max_tokens',
                    tool_calls: 'tool_use',
                    content_filter: 'stop_sequence',
                  }

                  const anthropicStopReason = stopReasonMapping[choice.finish_reason] || 'end_turn'

                  const messageDelta = {
                    type: 'message_delta',
                    delta: {
                      stop_reason: anthropicStopReason,
                      stop_sequence: null,
                    },
                    usage: {
                      input_tokens: chunk.usage?.prompt_tokens || 0,
                      output_tokens: chunk.usage?.completion_tokens || 0,
                    },
                  }
                  safeEnqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`))
                }

                if (!isClosed) {
                  const messageStop = { type: 'message_stop' }
                  safeEnqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`))
                }

                break
              }
            }
            catch (parseError) {
              // Skip malformed chunks
              continue
            }
          }
        }
        safeClose()
      }
      catch (error) {
        if (!isClosed) {
          try {
            controller.error(error)
          }
          catch {
            // Ignore controller error if already closed
          }
        }
      }
      finally {
        if (reader) {
          try {
            reader.releaseLock()
          }
          catch {
            // Ignore release error
          }
        }
      }
    },
    cancel: () => {
      // Handle cancellation
    },
  })

  return readable
}

/**
 * Check if response content is in OpenAI format (needs conversion to Anthropic)
 */
export function isOpenAIFormat(responseBody: string): boolean {
  try {
    const parsed = JSON.parse(responseBody)
    // Check for OpenAI-specific structure
    return !!(parsed.choices && Array.isArray(parsed.choices)
      && (parsed.object === 'chat.completion' || parsed.object === 'chat.completion.chunk'))
  }
  catch {
    return false
  }
}

/**
 * Check if streaming response is in OpenAI SSE format
 */
export function isOpenAIStreamFormat(responseBody: string): boolean {
  // Check if it contains OpenAI-style SSE chunks
  return responseBody.includes('"object":"chat.completion.chunk"')
    || responseBody.includes('"choices":[{')
    || responseBody.includes('"delta":{')
}
