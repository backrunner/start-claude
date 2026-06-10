import { createTransformerUrl } from '../utils/network/transformer-url';
import { buildRequestBody, formatResponseFromGemini, } from '../utils/transformer/gemini';
export class GeminiTransformer {
    options;
    static TransformerName = 'gemini';
    domain = 'generativelanguage.googleapis.com';
    isDefault = false;
    constructor(options) {
        this.options = options;
    }
    async normalizeRequest(request, provider) {
        if (!provider.model) {
            throw new Error('Model must be configured in provider for Gemini transformer');
        }
        if (!provider.apiKey) {
            throw new Error('API key must be configured in provider for Gemini transformer');
        }
        return {
            body: request,
            config: {
                url: createTransformerUrl(`v1beta/models/${provider.model}:${request.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, provider.baseUrl, 'https://generativelanguage.googleapis.com'),
                headers: {
                    'x-goog-api-key': provider.apiKey,
                },
            },
        };
    }
    async formatRequest(request) {
        const body = buildRequestBody(request);
        if (this.options) {
            Object.assign(body, this.options);
        }
        return body;
    }
    async formatResponse(response) {
        return formatResponseFromGemini(response);
    }
}
