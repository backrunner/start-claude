import type { LLMChatRequest, LLMProvider } from '../types/llm'
import type { Transformer, TransformerOptions } from '../types/transformer'
import { v4 as uuidv4 } from 'uuid'

export class OpenrouterTransformer implements Transformer {
  static TransformerName = 'openrouter'

  domain = 'openrouter.ai'
  isDefault = false

  constructor(private readonly options?: TransformerOptions) {}

  async transformRequestIn(
    request: LLMChatRequest,
    provider?: LLMProvider,
  ): Promise<Record<string, any>> {
    // Process the request for OpenRouter specifics
    const processedRequest = { ...request }

    if (!processedRequest.model.includes('claude')) {
      processedRequest.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((item: any) => {
            if (item.cache_control) {
              delete item.cache_control
            }
            if (item.type === 'image_url') {
              if (!item.image_url.url.startsWith('http')) {
                item.image_url.url = `data:${item.media_type};base64,${item.image_url.url}`
              }
              delete item.media_type
            }
          })
        }
        else if ((msg as any).cache_control) {
          delete (msg as any).cache_control
        }
      })
    }
    else {
      processedRequest.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((item: any) => {
            if (item.type === 'image_url') {
              if (!item.image_url.url.startsWith('http')) {
                item.image_url.url = `data:${item.media_type};base64,${item.image_url.url}`
              }
              delete item.media_type
            }
          })
        }
      })
    }

    // Apply any additional options from transformer configuration
    Object.assign(processedRequest, this.options || {})

    const body = {
      model: processedRequest.model,
      messages: processedRequest.messages || [],
      max_tokens: processedRequest.max_tokens,
      temperature: processedRequest.temperature,
      top_p: processedRequest.top_p,
      stream: processedRequest.stream,
      tools: processedRequest.tools,
      tool_choice: processedRequest.tool_choice,
      stop: processedRequest.stop_sequences,
    }

    return {
      body,
      config: {
        url: new URL('./v1/chat/completions', provider?.baseUrl || 'https://openrouter.ai/api'),
        headers: {
          'Authorization': `Bearer ${provider?.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    }
  }

  async transformRequestOut(request: any): Promise<any> {
    // Transform from OpenRouter format to unified format
    return {
      model: request.model,
      messages: request.messages || [],
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      top_p: request.top_p,
      stream: request.stream,
      tools: request.tools,
      tool_choice: request.tool_choice,
      stop_sequences: request.stop,
    }
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      const jsonResponse = await response.json()
      return new Response(JSON.stringify(jsonResponse), {
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

      let hasTextContent = false
      let reasoningContent = ''
      let isReasoningComplete = false
      let hasToolCall = false
      let buffer = '' // Buffer for incomplete data

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader()
          const processBuffer = (
            buffer: string,
            controller: ReadableStreamDefaultController,
            encoder: TextEncoder,
          ): void => {
            const lines = buffer.split('\n')
            for (const line of lines) {
              if (line.trim()) {
                controller.enqueue(encoder.encode(`${line}\n`))
              }
            }
          }

          const processLine = (
            line: string,
            context: {
              controller: ReadableStreamDefaultController
              encoder: TextEncoder
              hasTextContent: () => boolean
              setHasTextContent: (val: boolean) => void
              reasoningContent: () => string
              appendReasoningContent: (content: string) => void
              isReasoningComplete: () => boolean
              setReasoningComplete: (val: boolean) => void
            },
          ): void => {
            const { controller, encoder } = context

            if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
              const jsonStr = line.slice(6)
              try {
                const data = JSON.parse(jsonStr)
                if (data.usage) {
                  console.debug({ usage: data.usage, hasToolCall }, 'usage')
                  data.choices[0].finish_reason = hasToolCall
                    ? 'tool_calls'
                    : 'stop'
                }

                if (data.choices?.[0]?.finish_reason === 'error') {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        error: data.choices?.[0].error,
                      })}\n\n`,
                    ),
                  )
                }

                if (
                  data.choices?.[0]?.delta?.content
                  && !context.hasTextContent()
                ) {
                  context.setHasTextContent(true)
                }

                // Extract reasoning_content from delta
                if (data.choices?.[0]?.delta?.reasoning) {
                  context.appendReasoningContent(
                    data.choices[0].delta.reasoning,
                  )
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices?.[0],
                        delta: {
                          ...data.choices[0].delta,
                          thinking: {
                            content: data.choices[0].delta.reasoning,
                          },
                        },
                      },
                    ],
                  }
                  if (thinkingChunk.choices?.[0]?.delta) {
                    delete thinkingChunk.choices[0].delta.reasoning
                  }
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk,
                  )}\n\n`
                  controller.enqueue(encoder.encode(thinkingLine))
                  return
                }

                // Check if reasoning is complete
                if (
                  data.choices?.[0]?.delta?.content
                  && context.reasoningContent()
                  && !context.isReasoningComplete()
                ) {
                  context.setReasoningComplete(true)
                  const signature = Date.now().toString()

                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices?.[0],
                        delta: {
                          ...data.choices[0].delta,
                          content: null,
                          thinking: {
                            content: context.reasoningContent(),
                            signature,
                          },
                        },
                      },
                    ],
                  }
                  if (thinkingChunk.choices?.[0]?.delta) {
                    delete thinkingChunk.choices[0].delta.reasoning
                  }
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk,
                  )}\n\n`
                  controller.enqueue(encoder.encode(thinkingLine))
                }

                if (data.choices?.[0]?.delta?.reasoning) {
                  delete data.choices[0].delta.reasoning
                }
                if (
                  data.choices?.[0]?.delta?.tool_calls?.length
                  && !Number.isNaN(
                    Number.parseInt(data.choices?.[0]?.delta?.tool_calls[0].id, 10),
                  )
                ) {
                  data.choices?.[0]?.delta?.tool_calls.forEach((tool: any) => {
                    tool.id = `call_${uuidv4()}`
                  })
                }

                if (
                  data.choices?.[0]?.delta?.tool_calls?.length
                  && !hasToolCall
                ) {
                  hasToolCall = true
                }

                if (
                  data.choices?.[0]?.delta?.tool_calls?.length
                  && context.hasTextContent()
                ) {
                  if (typeof data.choices[0].index === 'number') {
                    data.choices[0].index += 1
                  }
                  else {
                    data.choices[0].index = 1
                  }
                }

                const modifiedLine = `data: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(modifiedLine))
              }
              catch {
                // If JSON parsing fails, data might be incomplete, pass through the original line
                controller.enqueue(encoder.encode(`${line}\n`))
              }
            }
            else {
              // Pass through non-data lines (like [DONE])
              controller.enqueue(encoder.encode(`${line}\n`))
            }
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                // Process remaining data in buffer
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder)
                }
                break
              }

              // Check if value is valid
              if (!value || value.length === 0) {
                continue
              }

              let chunk
              try {
                chunk = decoder.decode(value, { stream: true })
              }
              catch (decodeError) {
                console.warn('Failed to decode chunk', decodeError)
                continue
              }

              if (chunk.length === 0) {
                continue
              }

              buffer += chunk

              // If buffer is too large, process to avoid memory leaks
              if (buffer.length > 1000000) { // 1MB limit
                console.warn(
                  'Buffer size exceeds limit, processing partial data',
                )
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                  if (line.trim()) {
                    try {
                      processLine(line, {
                        controller,
                        encoder,
                        hasTextContent: () => hasTextContent,
                        setHasTextContent: val => (hasTextContent = val),
                        reasoningContent: () => reasoningContent,
                        appendReasoningContent: content =>
                          (reasoningContent += content),
                        isReasoningComplete: () => isReasoningComplete,
                        setReasoningComplete: val =>
                          (isReasoningComplete = val),
                      })
                    }
                    catch (error) {
                      console.error('Error processing line:', line, error)
                      // If parsing fails, pass through the original line
                      controller.enqueue(encoder.encode(`${line}\n`))
                    }
                  }
                }
                continue
              }

              // Process complete data lines in buffer
              const lines = buffer.split('\n')
              buffer = lines.pop() || '' // Last line might be incomplete, keep in buffer

              for (const line of lines) {
                if (!line.trim())
                  continue

                try {
                  processLine(line, {
                    controller,
                    encoder,
                    hasTextContent: () => hasTextContent,
                    setHasTextContent: val => (hasTextContent = val),
                    reasoningContent: () => reasoningContent,
                    appendReasoningContent: content =>
                      (reasoningContent += content),
                    isReasoningComplete: () => isReasoningComplete,
                    setReasoningComplete: val => (isReasoningComplete = val),
                  })
                }
                catch (error) {
                  console.error('Error processing line:', line, error)
                  // If parsing fails, pass through the original line
                  controller.enqueue(encoder.encode(`${line}\n`))
                }
              }
            }
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
          'Content-Type': response.headers.get('Content-Type') || 'text/plain',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    return response
  }
}
