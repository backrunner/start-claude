# Transformers

This directory contains transformer implementations for various AI providers. Transformers enable the proxy to seamlessly translate between different API formats while maintaining a unified interface.

## Architecture

Transformers use **domain-based routing** to automatically select the appropriate transformer based on the target API's domain:

- **OpenAI** (`api.openai.com`) - Default fallback transformer
- **OpenRouter** (`openrouter.ai`) - Advanced streaming with reasoning and tool call support
- **Gemini** (`generativelanguage.googleapis.com`) - Google's Generative AI API

## Available Transformers

### OpenAI Transformer (`openai.ts`)

- **Domain**: `api.openai.com`
- **Default**: Yes (fallback for unknown domains)
- **Features**: Standard OpenAI API compatibility
- **Methods**: `transformRequestOut`, `transformResponseOut`

### OpenRouter Transformer (`openrouter.ts`)

- **Domain**: `openrouter.ai`
- **Features**: Advanced streaming, reasoning content processing, tool calls with UUID generation
- **Methods**: `transformRequestIn`, `transformRequestOut`, `transformResponseOut`
- **Special**: Handles cache control removal, image URL formatting, complex stream processing

### Gemini Transformer (`gemini.ts`)

- **Domain**: `generativelanguage.googleapis.com`
- **Features**: Google Generative AI API support, streaming, tool calling
- **Methods**: `transformRequestIn`, `transformRequestOut`, `transformResponseOut`
- **Authentication**: Uses `x-goog-api-key` header
- **Endpoints**: `/v1beta/models/{model}:generateContent` or `:streamGenerateContent?alt=sse`

## Transformer Interface

All transformers implement the `Transformer` interface:

```typescript
interface Transformer {
  domain?: string // Domain for automatic routing
  isDefault?: boolean // Whether this is the default fallback

  // Transform incoming requests (client → API)
  transformRequestIn?: (request: LLMChatRequest, provider: LLMProvider) => Promise<Record<string, any>>

  // Transform outgoing requests (API → unified format)
  transformRequestOut?: (request: any) => Promise<LLMChatRequest>

  // Transform responses (API → client)
  transformResponseOut?: (response: Response) => Promise<Response>

  // Custom authentication logic
  auth?: (request: any, provider: LLMProvider) => Promise<any>
}
```

## How Transformers Work

1. **Domain Matching**: When a request comes in, the proxy extracts the domain from the target `baseUrl`
2. **Transformer Selection**: The system looks for a transformer with matching `domain` property
3. **Fallback**: If no exact match is found, the default transformer (OpenAI) is used
4. **Request Transformation**: The transformer converts the request to the target API's format
5. **Response Transformation**: The transformer converts the API response back to a unified format

## Usage in Load Balancer

Transformers are automatically registered and used when:

- A configuration has `transformerEnabled: true`
- The proxy detects the need for format conversion based on the target domain
- Custom transformer options are provided in the configuration

## Acknowledgments

**[musistudio/llms](https://github.com/musistudio/llms)**

Original transformer code licensed under MIT License
Copyright (c) musistudio

We extend our gratitude to the musistudio team for their innovative approach to LLM API abstraction and transformation. Their work provided valuable insights for implementing Google's Generative AI API support.

## Adding New Transformers

To add a new transformer:

1. **Create the transformer class** in this directory:

```typescript
export class MyTransformer implements Transformer {
  static TransformerName = 'my-service'
  domain = 'api.myservice.com'
  isDefault = false

  // Implement required methods...
}
```

2. **Export in `index.ts`**:

```typescript
export { MyTransformer } from './my-transformer'

export const availableTransformers = {
  // ... existing transformers
  myservice: async () => import('./my-transformer').then(m => m.MyTransformer),
}
```

3. **Register in `TransformerService`**:

```typescript
// In registerDefaultTransformersInternal()
const { MyTransformer } = await import('../transformers/my-transformer')
const myTransformer = new MyTransformer()
this.registerTransformer('myservice', myTransformer)
```

## Testing

Transformers are covered by comprehensive tests in `/tests/transformer.test.ts` with:

- 32 test cases
- 85%+ statement coverage
- Domain matching logic
- Error handling scenarios
- Verbose logging verification

## Configuration

Transformers can be configured via:

- **System-wide**: Automatically registered default transformers
- **Per-config**: Custom transformer options in configuration files
- **Runtime**: Dynamic transformer loading from external modules

For more details on configuration, see the main project documentation.
