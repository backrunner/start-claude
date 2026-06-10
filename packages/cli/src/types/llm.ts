export interface LLMProvider {
  name: string
  baseUrl?: string
  apiKey?: string
  model?: string
  headers?: Record<string, string>
}

export interface MessageThinking {
  content?: string
  signature?: string
}

export interface ToolCall {
  id?: string
  type?: 'function'
  function: {
    name: string
    arguments?: string
  }
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | Array<{
    type: string
    text?: string
    source?: any
    [key: string]: any
  }> | Record<string, any> | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
  thinking?: MessageThinking
  cache_control?: any
}

export interface LLMChatRequest {
  model: string
  messages: Message[]
  max_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  stream?: boolean
  tools?: Array<{
    name: string
    description?: string
    input_schema: Record<string, any>
    type?: string
    function?: {
      name: string
      description?: string
      parameters?: Record<string, any>
    }
  }>
  tool_choice?: any
  system?: string | Array<{ type: string, text: string }>
  stop_sequences?: string[]
  thinking?: {
    type?: 'enabled' | 'disabled'
    enabled?: boolean
    budget_tokens?: number
  }
  reasoning?: {
    effort?: string
    max_tokens?: number
    enabled?: boolean
  }
  metadata?: Record<string, any>
}
