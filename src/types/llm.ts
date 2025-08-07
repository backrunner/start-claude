export interface LLMProvider {
  name: string
  baseUrl?: string
  apiKey?: string
  model?: string
  headers?: Record<string, string>
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{
    type: string
    text?: string
    source?: any
    [key: string]: any
  }>
}

export interface UnifiedChatRequest {
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
  }>
  tool_choice?: any
  system?: string | Array<{ type: string, text: string }>
  stop_sequences?: string[]
  thinking?: { enabled: boolean }
  metadata?: Record<string, any>
}
