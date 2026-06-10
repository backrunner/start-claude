import type { LLMChatRequest, LLMProvider, Message } from '../types/llm'
import type { NormalizeResult, Transformer, TransformerOptions } from '../types/transformer'
import { createTransformerUrl } from '../utils/network/transformer-url'
import { convertAnthropicToOpenAI } from '../utils/transformer/anthropic-to-openai'

interface OpenAIResponsesOutputItem {
  type: string
  id?: string
  call_id?: string
  name?: string
  arguments?: string
  reasoning?: string
  summary?: Array<{
    type?: string
    text?: string
  }>
  content?: Array<{
    type: string
    text?: string
    image_url?: string
    image_base64?: string
    mime_type?: string
    annotations?: Array<{
      url?: string
      title?: string
      start_index?: number
      end_index?: number
    }>
  }>
}

interface OpenAIResponsesPayload {
  id?: string
  object?: string
  model?: string
  created_at?: number
  output?: OpenAIResponsesOutputItem[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

interface OpenAIResponsesTool {
  type?: string
  name?: string
  description?: string
  input_schema?: Record<string, any>
  function?: {
    name?: string
    description?: string
    parameters?: Record<string, any>
  }
}

interface OpenAIResponsesStreamEvent {
  type: string
  item_id?: string
  output_index?: number
  delta?: string
  annotation?: {
    url?: string
    title?: string
    start_index?: number
    end_index?: number
  }
  part?: unknown
  item?: {
    id?: string
    type?: string
    call_id?: string
    name?: string
    content?: Array<{
      type: string
      text?: string
    }>
  }
  response?: {
    id?: string
    model?: string
    output?: Array<{ type: string }>
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export class OpenAIResponsesTransformer implements Transformer {
  static TransformerName = 'openai-responses'

  isDefault = false

  constructor(private readonly options?: TransformerOptions) {}

  async normalizeRequest(
    request: LLMChatRequest,
    provider: LLMProvider,
  ): Promise<NormalizeResult> {
    return {
      body: await convertAnthropicToOpenAI(request),
      config: {
        url: createTransformerUrl('v1/responses', provider.baseUrl, 'https://api.openai.com'),
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    }
  }

  async formatRequest(request: Record<string, any>): Promise<Record<string, any>> {
    if (!request.model) {
      throw new Error('Model parameter is required for OpenAI Responses transformer')
    }

    const input: any[] = []
    const instructions: string[] = []

    for (const message of request.messages || []) {
      if (message.role === 'system') {
        const content = this.extractText(message.content)
        if (content) {
          instructions.push(content)
        }
        continue
      }

      if (message.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: message.tool_call_id,
          output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? ''),
        })
        continue
      }

      if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        const formattedMessage = this.formatInputMessage(message as Message)
        if (formattedMessage) {
          input.push(formattedMessage)
        }

        for (const toolCall of message.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments || '{}',
          })
        }
        continue
      }

      const formattedMessage = this.formatInputMessage(message as Message)
      if (formattedMessage) {
        input.push(formattedMessage)
      }
    }

    const body: Record<string, any> = {
      model: request.model,
      input,
      stream: request.stream,
      parallel_tool_calls: false,
    }

    if (typeof request.max_tokens === 'number') {
      body.max_output_tokens = request.max_tokens
    }

    if (typeof request.temperature === 'number') {
      body.temperature = request.temperature
    }

    if (typeof request.top_p === 'number') {
      body.top_p = request.top_p
    }

    if (Array.isArray(request.stop) && request.stop.length > 0) {
      body.stop = request.stop
    }

    if (instructions.length > 0) {
      body.instructions = instructions.join('\n\n')
    }

    if (request.reasoning && request.reasoning.enabled !== false) {
      body.reasoning = {
        effort: request.reasoning.effort,
        summary: 'detailed',
      }
    }

    if (request.tools?.length) {
      body.tools = this.formatTools(request.tools)
    }

    if (request.tool_choice) {
      body.tool_choice = this.formatToolChoice(request.tool_choice)
    }

    if (this.options) {
      Object.assign(body, this.options)
    }

    return body
  }

  async formatResponse(response: Response): Promise<Response> {
    const contentType = response.headers.get('Content-Type') || ''

    if (contentType.includes('application/json')) {
      const payload: unknown = await response.json()
      if (this.isResponsesPayload(payload)) {
        return new Response(JSON.stringify(this.convertResponseToChat(payload)), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }

      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    if (contentType.includes('text/event-stream') && response.body) {
      return this.formatStreamResponse(response)
    }

    return response
  }

  private formatInputMessage(message: Message): Record<string, any> | null {
    const content = this.formatInputContent(message.content, message.role)
    if (!content || (Array.isArray(content) && content.length === 0)) {
      return null
    }

    return {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content,
    }
  }

  private formatInputContent(content: Message['content'], role: Message['role']): string | Array<Record<string, any>> | null {
    if (typeof content === 'string') {
      return content
    }

    if (!Array.isArray(content)) {
      return null
    }

    const mapped: Array<Record<string, any>> = []

    for (const part of content) {
      if (part.type === 'text') {
        mapped.push({
          type: role === 'assistant' ? 'output_text' : 'input_text',
          text: part.text || '',
        })
        continue
      }

      if (part.type === 'image_url' && part.image_url?.url) {
        const imageUrl = part.image_url.url.startsWith('http') || part.image_url.url.startsWith('data:')
          ? part.image_url.url
          : `data:${part.media_type || 'image/png'};base64,${part.image_url.url}`

        mapped.push({
          type: role === 'assistant' ? 'output_image' : 'input_image',
          image_url: imageUrl,
        })
      }
    }

    return mapped
  }

  private formatTools(tools: OpenAIResponsesTool[]): Array<Record<string, any>> {
    const formatted: Array<Record<string, any>> = tools
      .filter(tool => !this.isWebSearchTool(tool))
      .map((tool) => {
        const name = tool.function?.name || tool.name
        const parameters = this.cloneSchema(tool.function?.parameters || tool.input_schema || {})

        return {
          type: tool.type || 'function',
          name,
          description: tool.function?.description || tool.description || '',
          parameters,
        }
      })

    if (tools.some(tool => this.isWebSearchTool(tool))) {
      formatted.push({ type: 'web_search' })
    }

    return formatted
  }

  private isWebSearchTool(tool: OpenAIResponsesTool): boolean {
    const name = tool.function?.name || tool.name
    return name === 'web_search' || name === 'WebSearch'
  }

  private formatToolChoice(toolChoice: unknown): unknown {
    if (toolChoice === 'any' || toolChoice === 'required') {
      return 'required'
    }

    if (isRecord(toolChoice) && isRecord(toolChoice.function) && typeof toolChoice.function.name === 'string') {
      return {
        type: 'function',
        name: toolChoice.function.name,
      }
    }

    if (isRecord(toolChoice) && toolChoice.type === 'any') {
      return 'required'
    }

    return toolChoice
  }

  private cloneSchema(schema: Record<string, any>): Record<string, any> {
    return JSON.parse(JSON.stringify(schema)) as Record<string, any>
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') {
            return part
          }
          if (part && typeof part === 'object' && 'text' in part) {
            return String((part as { text?: unknown }).text || '')
          }
          return ''
        })
        .filter(Boolean)
        .join('\n\n')
    }

    return ''
  }

  private isResponsesPayload(payload: unknown): payload is OpenAIResponsesPayload {
    return !!payload
      && typeof payload === 'object'
      && (payload as OpenAIResponsesPayload).object === 'response'
      && Array.isArray((payload as OpenAIResponsesPayload).output)
  }

  private convertResponseToChat(payload: OpenAIResponsesPayload): Record<string, any> {
    const messageOutput = payload.output?.find(item => item.type === 'message')
    const functionCallOutputs = payload.output?.filter(item => item.type === 'function_call') || []
    const textParts: string[] = []
    const annotations = this.extractAnnotations(messageOutput)
    const reasoning = this.extractReasoning(payload, messageOutput)

    for (const item of messageOutput?.content || []) {
      if (item.type === 'output_text') {
        textParts.push(item.text || '')
      }
    }

    const toolCalls = functionCallOutputs.length > 0
      ? functionCallOutputs.map(functionCallOutput => ({
          id: functionCallOutput.call_id || functionCallOutput.id,
          type: 'function',
          function: {
            name: functionCallOutput.name,
            arguments: functionCallOutput.arguments || '{}',
          },
        }))
      : undefined

    return {
      id: payload.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: payload.created_at || Math.floor(Date.now() / 1000),
      model: payload.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: textParts.join('') || null,
          tool_calls: toolCalls,
          thinking: reasoning ? { content: reasoning } : undefined,
          annotations,
        },
        logprobs: null,
        finish_reason: toolCalls ? 'tool_calls' : 'stop',
      }],
      usage: payload.usage
        ? {
            prompt_tokens: payload.usage.input_tokens || 0,
            completion_tokens: payload.usage.output_tokens || 0,
            total_tokens: payload.usage.total_tokens || 0,
          }
        : null,
    }
  }

  private extractAnnotations(messageOutput?: OpenAIResponsesOutputItem): any[] | undefined {
    const annotations = messageOutput?.content?.flatMap(item => item.annotations || [])
    if (!annotations?.length) {
      return undefined
    }

    return annotations.map(annotation => ({
      type: 'url_citation',
      url_citation: {
        url: annotation.url || '',
        title: annotation.title || '',
        content: '',
        start_index: annotation.start_index || 0,
        end_index: annotation.end_index || 0,
      },
    }))
  }

  private extractReasoning(
    payload: OpenAIResponsesPayload,
    messageOutput?: OpenAIResponsesOutputItem,
  ): string | undefined {
    if (messageOutput?.reasoning) {
      return messageOutput.reasoning
    }

    const reasoningParts = payload.output
      ?.filter(item => item.type === 'reasoning')
      .flatMap((item) => {
        const summaryText = item.summary
          ?.map(summary => summary.text || '')
          .filter(Boolean) || []
        const contentText = item.content
          ?.map(content => content.text || '')
          .filter(Boolean) || []

        return [
          item.reasoning || '',
          ...summaryText,
          ...contentText,
        ].filter(Boolean)
      }) || []

    return reasoningParts.length > 0 ? reasoningParts.join('\n') : undefined
  }

  private formatStreamResponse(response: Response): Response {
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    const input = response.body!
    let buffer = ''
    let isDone = false
    let nextToolCallIndex = 0
    const toolCallIndexes = new Map<string, number>()

    const getToolCallIndex = (...keys: Array<number | string | undefined>): number => {
      const validKeys = keys
        .filter((key): key is number | string => key !== undefined && key !== '')
        .map(String)

      for (const key of validKeys) {
        const index = toolCallIndexes.get(key)
        if (index !== undefined) {
          return index
        }
      }

      const index = nextToolCallIndex++
      for (const key of validKeys) {
        toolCallIndexes.set(key, index)
      }
      return index
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = input.getReader()

        const enqueueChatChunk = (chunk: Record<string, any>): void => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
        }

        const processEvent = (event: OpenAIResponsesStreamEvent): void => {
          if (event.type === 'response.output_text.delta') {
            enqueueChatChunk({
              id: event.item_id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: event.response?.model,
              choices: [{
                index: 0,
                delta: { content: event.delta || '' },
                finish_reason: null,
              }],
            })
            return
          }

          if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
            const toolCallIndex = getToolCallIndex(event.item.id, event.item.call_id, event.output_index)
            enqueueChatChunk({
              id: event.item.call_id || event.item.id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: event.response?.model,
              choices: [{
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [{
                    index: toolCallIndex,
                    id: event.item.call_id || event.item.id,
                    type: 'function',
                    function: {
                      name: event.item.name || '',
                      arguments: '',
                    },
                  }],
                },
                finish_reason: null,
              }],
            })
            return
          }

          if (event.type === 'response.function_call_arguments.delta') {
            const toolCallIndex = getToolCallIndex(event.item_id, event.output_index)
            enqueueChatChunk({
              id: event.item_id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: event.response?.model,
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index: toolCallIndex,
                    function: { arguments: event.delta || '' },
                  }],
                },
                finish_reason: null,
              }],
            })
            return
          }

          if (event.type === 'response.output_text.annotation.added') {
            enqueueChatChunk({
              id: event.item_id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: event.response?.model,
              choices: [{
                index: 0,
                delta: {
                  annotations: [{
                    type: 'url_citation',
                    url_citation: {
                      url: event.annotation?.url || '',
                      title: event.annotation?.title || '',
                      content: '',
                      start_index: event.annotation?.start_index || 0,
                      end_index: event.annotation?.end_index || 0,
                    },
                  }],
                },
                finish_reason: null,
              }],
            })
            return
          }

          if (event.type === 'response.reasoning_summary_text.delta') {
            enqueueChatChunk({
              id: event.item_id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: event.response?.model,
              choices: [{
                index: 0,
                delta: {
                  thinking: { content: event.delta || '' },
                },
                finish_reason: null,
              }],
            })
            return
          }

          if (event.type === 'response.reasoning_summary_part.done' && event.part) {
            enqueueChatChunk({
              id: event.item_id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: event.response?.model,
              choices: [{
                index: 0,
                delta: {
                  thinking: { signature: event.item_id || `${Date.now()}` },
                },
                finish_reason: null,
              }],
            })
            return
          }

          if (event.type === 'response.completed') {
            const hasToolCall = event.response?.output?.some(item => item.type === 'function_call') === true
            enqueueChatChunk({
              id: event.response?.id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: event.response?.model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: hasToolCall ? 'tool_calls' : 'stop',
              }],
            })
            isDone = true
          }
        }

        const processLine = (line: string): void => {
          if (!line.startsWith('data:')) {
            return
          }

          const data = line.slice(5).trim()
          if (!data) {
            return
          }

          if (data === '[DONE]') {
            isDone = true
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            return
          }

          try {
            processEvent(JSON.parse(data) as OpenAIResponsesStreamEvent)
          }
          catch {
            controller.enqueue(encoder.encode(`${line}\n`))
          }
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() || ''

            for (const line of lines) {
              processLine(line.trim())
            }
          }

          if (buffer.trim()) {
            processLine(buffer.trim())
          }

          if (!isDone) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          }
        }
        catch (error) {
          controller.error(error)
        }
        finally {
          reader.releaseLock()
          controller.close()
        }
      },
    })

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }
}
