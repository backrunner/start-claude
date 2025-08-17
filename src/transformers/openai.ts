import type { LLMChatRequest, LLMProvider } from '../types/llm'
import type { Transformer, TransformerOptions } from '../types/transformer'
import { createTransformerUrl } from '../utils/network/transformer-url'
import { buildOpenAIRequestBody, convertAnthropicToOpenAI, isAnthropicFormat } from '../utils/transformer/anthropic-to-openai'

export class OpenaiTransformer implements Transformer {
  static TransformerName = 'openai'

  domain = 'api.openai.com'
  isDefault = true

  constructor(private readonly options?: TransformerOptions) {}

  async normalizeRequest(
    request: LLMChatRequest,
    provider: LLMProvider,
  ): Promise<Record<string, any>> {
    // Transform Anthropic format to OpenAI format if needed
    let transformedRequest: any = request
    if (isAnthropicFormat(request)) {
      transformedRequest = await convertAnthropicToOpenAI(request)
    }

    return {
      body: transformedRequest,
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

    // Format the request for OpenAI API
    const body = buildOpenAIRequestBody(request as any)

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
