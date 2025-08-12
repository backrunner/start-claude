import type { LLMChatRequest, LLMProvider } from '../types/llm'
import type { Transformer, TransformerOptions } from '../types/transformer'
import {
  buildRequestBody,
  formatResponseFromGemini,
} from '../utils/gemini'
import { createTransformerUrl } from '../utils/transformer-url'

export class GeminiTransformer implements Transformer {
  static TransformerName = 'gemini'

  domain = 'generativelanguage.googleapis.com'
  isDefault = false

  constructor(private readonly options?: TransformerOptions) {}

  async normalizeRequest(
    request: LLMChatRequest,
    provider: LLMProvider,
  ): Promise<Record<string, any>> {
    // Ensure model is configured in provider
    if (!provider.model) {
      throw new Error('Model must be configured in provider for Gemini transformer')
    }

    return {
      body: request,
      config: {
        url: createTransformerUrl(
          `v1beta/models/${provider.model}:${
            request.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
          }`,
          provider.baseUrl,
          'https://generativelanguage.googleapis.com',
        ),
        headers: {
          'x-goog-api-key': provider.apiKey,
        },
      },
    }
  }

  async formatRequest(request: Record<string, any>): Promise<Record<string, any>> {
    const body = buildRequestBody(request as LLMChatRequest)

    // Apply any additional options from transformer configuration
    if (this.options) {
      Object.assign(body, this.options)
    }

    return body
  }

  async formatResponse(response: Response): Promise<Response> {
    return formatResponseFromGemini(response)
  }
}
