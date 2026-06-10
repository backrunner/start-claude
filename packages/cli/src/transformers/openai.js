import { createTransformerUrl } from '../utils/network/transformer-url';
import { buildOpenAIRequestBody, convertAnthropicToOpenAI } from '../utils/transformer/anthropic-to-openai';
export class OpenaiTransformer {
    options;
    static TransformerName = 'openai';
    domain = 'api.openai.com';
    isDefault = true;
    constructor(options) {
        this.options = options;
    }
    async normalizeRequest(request, provider) {
        return {
            body: await convertAnthropicToOpenAI(request),
            config: {
                url: createTransformerUrl('v1/chat/completions', provider.baseUrl, 'https://api.openai.com'),
                headers: {
                    'Authorization': `Bearer ${provider.apiKey}`,
                    'Content-Type': 'application/json',
                },
            },
        };
    }
    async formatRequest(request) {
        if (!request.model) {
            throw new Error('Model parameter is required for OpenAI transformer');
        }
        const body = buildOpenAIRequestBody(request);
        if (this.options) {
            Object.assign(body, this.options);
        }
        return body;
    }
    async formatResponse(response) {
        return response;
    }
}
