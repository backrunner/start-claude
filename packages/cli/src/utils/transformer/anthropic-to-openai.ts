/**
 * Universal converter from Anthropic format to OpenAI format
 * This handles both request transformation and response formatting
 */

import type { LLMChatRequest } from '../../types/llm'

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | any[] | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  cache_control?: any
}

interface OpenAIChatRequest extends Omit<LLMChatRequest, 'messages'> {
  messages: OpenAIMessage[]
  reasoning?: {
    effort?: string
    enabled?: boolean
  }
}

function getThinkLevel(budgetTokens?: number): string {
  if (!budgetTokens)
    return 'medium'
  if (budgetTokens <= 10000)
    return 'low'
  if (budgetTokens <= 50000)
    return 'medium'
  return 'high'
}

/**
 * Transform Anthropic request format to OpenAI format
 */
export async function convertAnthropicToOpenAI(
  request: Record<string, any>,
): Promise<OpenAIChatRequest> {
  const messages: OpenAIMessage[] = []

  // Handle system message
  if (request.system) {
    if (typeof request.system === 'string') {
      messages.push({
        role: 'system',
        content: request.system,
      })
    }
    else if (Array.isArray(request.system) && request.system.length) {
      const textParts = request.system
        .filter((item: any) => item.type === 'text' && item.text)
        .map((item: any) => ({
          type: 'text' as const,
          text: item.text,
          cache_control: item.cache_control,
        }))
      messages.push({
        role: 'system',
        content: textParts,
      })
    }
  }

  // Deep clone messages to avoid mutation
  const requestMessages = JSON.parse(JSON.stringify(request.messages || []))

  requestMessages?.forEach((msg: any) => {
    if (msg.role === 'user' || msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        messages.push({
          role: msg.role,
          content: msg.content,
        })
        return
      }

      if (Array.isArray(msg.content)) {
        if (msg.role === 'user') {
          // Handle tool results
          const toolParts = msg.content.filter(
            (c: any) => c.type === 'tool_result' && c.tool_use_id,
          )
          if (toolParts.length) {
            toolParts.forEach((tool: any) => {
              const toolMessage: OpenAIMessage = {
                role: 'tool',
                content:
                  typeof tool.content === 'string'
                    ? tool.content
                    : JSON.stringify(tool.content),
                tool_call_id: tool.tool_use_id,
                cache_control: tool.cache_control,
              }
              messages.push(toolMessage)
            })
          }

          // Handle text and media content
          const textAndMediaParts = msg.content.filter(
            (c: any) =>
              (c.type === 'text' && c.text)
              || (c.type === 'image' && c.source),
          )
          if (textAndMediaParts.length) {
            messages.push({
              role: 'user',
              content: textAndMediaParts.map((part: any) => {
                if (part?.type === 'image') {
                  return {
                    type: 'image_url',
                    image_url: {
                      url:
                        part.source?.type === 'base64'
                          ? part.source.data
                          : part.source.url,
                    },
                    media_type: part.source.media_type,
                  }
                }
                return part
              }),
            })
          }
        }
        else if (msg.role === 'assistant') {
          const assistantMessage: OpenAIMessage = {
            role: 'assistant',
            content: '',
          }

          // Handle text content
          const textParts = msg.content.filter(
            (c: any) => c.type === 'text' && c.text,
          )
          if (textParts.length) {
            assistantMessage.content = textParts
              .map((text: any) => text.text)
              .join('\n')
          }

          // Handle tool calls
          const toolCallParts = msg.content.filter(
            (c: any) => c.type === 'tool_use' && c.id,
          )
          if (toolCallParts.length) {
            assistantMessage.tool_calls = toolCallParts.map((tool: any) => {
              return {
                id: tool.id,
                type: 'function' as const,
                function: {
                  name: tool.name,
                  arguments: JSON.stringify(tool.input || {}),
                },
              }
            })
          }
          messages.push(assistantMessage)
        }
      }
    }
  })

  const result: OpenAIChatRequest = {
    model: request.model,
    messages,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    stream: request.stream,
    tools: request.tools?.length
      ? convertAnthropicToolsToUnified(request.tools)
      : undefined,
    tool_choice: request.tool_choice,
  }

  // Handle thinking/reasoning
  if (request.thinking) {
    result.reasoning = {
      effort: getThinkLevel(request.thinking.budget_tokens),
      enabled: request.thinking.type === 'enabled',
    }
  }

  // Handle tool choice
  if (request.tool_choice) {
    if (request.tool_choice.type === 'tool') {
      result.tool_choice = {
        type: 'function',
        function: { name: request.tool_choice.name },
      }
    }
    else {
      result.tool_choice = request.tool_choice.type
    }
  }

  return result
}

/**
 * Convert Anthropic tools format to OpenAI format
 */
function convertAnthropicToolsToUnified(anthropicTools: any[]): any[] {
  return anthropicTools.map((tool) => {
    // Handle tools that are already in OpenAI format
    if (tool.type === 'function') {
      return {
        type: 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }
    }

    // Handle tools in Anthropic native format (name, description, input_schema)
    if (tool.name && tool.input_schema) {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema,
        },
      }
    }

    // Fallback: return as-is
    return tool
  })
}

/**
 * Format OpenAI request body for API call
 */
export function buildOpenAIRequestBody(unifiedRequest: OpenAIChatRequest): Record<string, any> {
  const body: Record<string, any> = {
    model: unifiedRequest.model,
    messages: unifiedRequest.messages || [],
    max_tokens: unifiedRequest.max_tokens,
    temperature: unifiedRequest.temperature,
    stream: unifiedRequest.stream,
  }

  // Add tools if present
  if (unifiedRequest.tools && unifiedRequest.tools.length > 0) {
    body.tools = unifiedRequest.tools
  }

  // Add tool choice if present
  if (unifiedRequest.tool_choice) {
    body.tool_choice = unifiedRequest.tool_choice
  }

  // Handle reasoning (OpenAI-specific)
  if (unifiedRequest.reasoning?.enabled) {
    body.reasoning = {
      effort: unifiedRequest.reasoning.effort || 'medium',
    }
  }

  return body
}
