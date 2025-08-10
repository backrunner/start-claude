import type { LLMChatRequest, LLMProvider } from '../types/llm'
import type { Transformer, TransformerOptions } from '../types/transformer'
import {
  buildRequestBody,
  transformRequestOut,
  transformResponseOut,
} from '../utils/gemini.util'

export class GeminiTransformer implements Transformer {
  static TransformerName = 'gemini'

  domain = 'generativelanguage.googleapis.com'
  isDefault = false

  constructor(private readonly options?: TransformerOptions) {}

  async transformRequestIn(
    request: LLMChatRequest,
    provider: LLMProvider,
  ): Promise<Record<string, any>> {
    const body = buildRequestBody(request)

    // Apply any additional options from transformer configuration
    if (this.options) {
      Object.assign(body, this.options)
    }

    return {
      body,
      config: {
        url: new URL(
          `./v1beta/models/${request.model}:${
            request.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
          }`,
          provider.baseUrl,
        ),
        headers: {
          'x-goog-api-key': provider.apiKey,
          'Authorization': undefined,
        },
      },
    }
  }

  async transformRequestOut(request: any): Promise<any> {
    return transformRequestOut(request)
  }

  async transformResponseOut(response: Response): Promise<Response> {
    return transformResponseOut(response)
  }
}
