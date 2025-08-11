import type { LLMChatRequest, LLMProvider } from '../types/llm'
import type { Transformer, TransformerOptions } from '../types/transformer'
import { createTransformerUrl } from '../utils/transformer-url'

export class OpenaiTransformer implements Transformer {
  static TransformerName = 'openai'

  domain = 'api.openai.com'
  isDefault = true

  constructor(private readonly options?: TransformerOptions) {}

  async normalizeRequest(
    request: LLMChatRequest,
    provider: LLMProvider,
  ): Promise<Record<string, any>> {
    return {
      body: request,
      config: {
        url: createTransformerUrl('v1/chat/completions', provider.baseUrl, 'https://api.openai.com'),
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    }
  }

  async formatRequest(request: Record<string, any>): Promise<Record<string, any>> {
    // Throw error if no model is provided instead of using default
    if (!request.model) {
      throw new Error('Model parameter is required for OpenAI transformer')
    }

    const body = {
      model: request.model,
      messages: request.messages || [],
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      top_p: request.top_p,
      stream: request.stream,
      tools: request.tools,
      tool_choice: request.tool_choice,
      stop: request.stop_sequences,
    }

    // Apply any additional options from transformer configuration
    if (this.options) {
      Object.assign(body, this.options)
    }

    return body
  }

  async formatResponse(response: Response): Promise<Response> {
    return response
  }
}
