import { describe, expect, it } from 'vitest'
import { OpenAIResponsesTransformer } from '../../src/transformers/openai-responses'
import { OpenrouterTransformer } from '../../src/transformers/openrouter'
import { buildOpenAIRequestBody, convertAnthropicToOpenAI } from '../../src/utils/transformer/anthropic-to-openai'
import { buildRequestBody, formatResponseFromGemini } from '../../src/utils/transformer/gemini'
import { convertOpenAIResponseToAnthropic, convertOpenAIStreamToAnthropic } from '../../src/utils/transformer/openai-to-anthropic'

async function readResponseText(response: Response): Promise<string> {
  return response.text()
}

async function readStreamText(stream: ReadableStream): Promise<string> {
  return new Response(stream).text()
}

describe('transformer conversions', () => {
  it('converts Anthropic requests to OpenAI chat with reasoning, stops, tools, and images', async () => {
    const request = {
      model: 'gpt-5-codex',
      system: [{ type: 'text', text: 'You are concise.' }],
      max_tokens: 1000,
      temperature: 0.2,
      top_p: 0.8,
      stream: true,
      stop_sequences: ['</stop>'],
      thinking: {
        type: 'enabled',
        budget_tokens: 12000,
      },
      tools: [{
        name: 'Read',
        description: 'Read a file',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
        },
      }],
      tool_choice: {
        type: 'any',
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Look at this.' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'abc123',
              },
            },
          ],
        },
        {
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Read',
            input: { path: '/tmp/a.txt' },
          }],
        },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: 'file contents',
          }],
        },
      ],
    }

    const converted = await convertAnthropicToOpenAI(request)
    const body = buildOpenAIRequestBody(converted)

    expect(body.top_p).toBe(0.8)
    expect(body.stop).toEqual(['</stop>'])
    expect(body.reasoning).toEqual({ effort: 'medium', max_tokens: 12000 })
    expect(body.tool_choice).toBe('required')
    expect(body.tools?.[0].function.name).toBe('Read')
    expect(body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'system' }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'toolu_1',
        content: 'file contents',
      }),
    ]))
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'abc123' },
      media_type: 'image/png',
    })
  })

  it('formats OpenAI Responses requests and JSON responses', async () => {
    const transformer = new OpenAIResponsesTransformer()
    const body = await transformer.formatRequest({
      model: 'gpt-5-codex',
      stream: false,
      max_tokens: 2048,
      temperature: 0.2,
      top_p: 0.8,
      stop: ['</stop>'],
      reasoning: { effort: 'high' },
      tool_choice: {
        type: 'function',
        function: { name: 'Lookup' },
      },
      messages: [
        { role: 'system', content: 'Use tools carefully.' },
        { role: 'user', content: 'Search this.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'Lookup', arguments: '{"q":"x"}' },
          }],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'result' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'Lookup',
            description: 'lookup',
            parameters: { type: 'object' },
          },
        },
        {
          type: 'function',
          function: {
            name: 'web_search',
            description: 'web',
            parameters: { type: 'object' },
          },
        },
      ],
    })

    expect(body.instructions).toBe('Use tools carefully.')
    expect(body.input).toEqual(expect.arrayContaining([
      { role: 'user', content: 'Search this.' },
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'Lookup',
        arguments: '{"q":"x"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: 'result',
      },
    ]))
    expect(body.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Lookup' }),
      { type: 'web_search' },
    ]))
    expect(body.tools).toHaveLength(2)
    expect(body.tools.some((tool: Record<string, unknown>) => tool.name === 'web_search')).toBe(false)
    expect(body.reasoning).toEqual({ effort: 'high', summary: 'detailed' })
    expect(body.max_output_tokens).toBe(2048)
    expect(body.temperature).toBe(0.2)
    expect(body.top_p).toBe(0.8)
    expect(body.stop).toEqual(['</stop>'])
    expect(body.tool_choice).toEqual({ type: 'function', name: 'Lookup' })

    const requiredToolChoiceBody = await transformer.formatRequest({
      model: 'gpt-5-codex',
      messages: [{ role: 'user', content: 'Use a tool.' }],
      tool_choice: 'any',
    })
    expect(requiredToolChoiceBody.tool_choice).toBe('required')

    const legacyWebSearchBody = await transformer.formatRequest({
      model: 'gpt-5-codex',
      messages: [{ role: 'user', content: 'Search.' }],
      tools: [{
        name: 'WebSearch',
        description: 'search',
        input_schema: {
          type: 'object',
          properties: {
            allowed_domains: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      }],
    })
    expect(legacyWebSearchBody.tools).toEqual([{ type: 'web_search' }])

    const disabledReasoningBody = await transformer.formatRequest({
      model: 'gpt-5-codex',
      messages: [{ role: 'user', content: 'Do not think aloud.' }],
      reasoning: {
        enabled: false,
        effort: 'high',
      },
    })
    expect(disabledReasoningBody.reasoning).toBeUndefined()

    const response = await transformer.formatResponse(new Response(JSON.stringify({
      id: 'resp_1',
      object: 'response',
      model: 'gpt-5-codex',
      created_at: 123,
      output: [
        {
          type: 'reasoning',
          summary: [{
            type: 'summary_text',
            text: 'I checked sources.',
          }],
        },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'answer',
              annotations: [{
                url: 'https://example.com/a',
                title: 'Example A',
                start_index: 0,
                end_index: 6,
              }],
            },
            {
              type: 'output_text',
              text: ' done',
              annotations: [{
                url: 'https://example.com/b',
                title: 'Example B',
                start_index: 7,
                end_index: 11,
              }],
            },
          ],
        },
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'Lookup',
          arguments: '{"q":"x"}',
        },
        {
          type: 'function_call',
          call_id: 'call_2',
          name: 'Read',
          arguments: '{"path":"/tmp/a.txt"}',
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    }))

    const chat = JSON.parse(await readResponseText(response))
    expect(chat.object).toBe('chat.completion')
    expect(chat.choices[0].message.content).toBe('answer done')
    expect(chat.choices[0].message.thinking.content).toBe('I checked sources.')
    expect(chat.choices[0].message.annotations.map((item: any) => item.url_citation.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
    expect(chat.choices[0].message.tool_calls).toEqual([
      expect.objectContaining({ id: 'call_1', function: { name: 'Lookup', arguments: '{"q":"x"}' } }),
      expect.objectContaining({ id: 'call_2', function: { name: 'Read', arguments: '{"path":"/tmp/a.txt"}' } }),
    ])

    const anthropic = convertOpenAIResponseToAnthropic(chat)
    expect(anthropic.content.map((item: any) => item.type)).toEqual([
      'thinking',
      'server_tool_use',
      'web_search_tool_result',
      'text',
      'tool_use',
      'tool_use',
    ])
    expect(anthropic.content[0]).toEqual(expect.objectContaining({
      type: 'thinking',
      thinking: 'I checked sources.',
    }))

    const noAnnotationsAnthropic = convertOpenAIResponseToAnthropic({
      id: 'chatcmpl-empty-annotations',
      model: 'gpt-5-codex',
      choices: [{
        message: {
          role: 'assistant',
          content: 'answer',
          annotations: [],
        },
        finish_reason: 'stop',
      }],
    })
    expect(noAnnotationsAnthropic.content.map((item: any) => item.type)).toEqual(['text'])
  })

  it('formats OpenAI Responses image input as data URLs', async () => {
    const transformer = new OpenAIResponsesTransformer()
    const body = await transformer.formatRequest({
      model: 'gpt-5-codex',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Look' },
          {
            type: 'image_url',
            image_url: { url: 'abc123' },
            media_type: 'image/png',
          },
        ],
      }],
    })

    expect(body.input[0].content[1]).toEqual({
      type: 'input_image',
      image_url: 'data:image/png;base64,abc123',
    })
  })

  it('formats OpenAI Responses SSE into OpenAI chat SSE', async () => {
    const transformer = new OpenAIResponsesTransformer()
    const sse = [
      'data: {"type":"response.output_text.delta","item_id":"resp_1","delta":"hello","response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.output_text.annotation.added","item_id":"resp_1","annotation":{"url":"https://example.com","title":"Example"}}',
      'data: {"type":"response.reasoning_summary_text.delta","item_id":"reason_1","delta":"thinking","response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.reasoning_summary_part.done","item_id":"reason_1","part":{}}',
      'data: {"type":"response.output_item.added","item":{"type":"function_call","call_id":"call_1","name":"Lookup"},"response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.function_call_arguments.delta","item_id":"call_1","delta":"{\\"q\\":\\"x\\"}","response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5-codex","output":[{"type":"function_call"}]}}',
      '',
    ].join('\n\n')

    const response = await transformer.formatResponse(new Response(sse, {
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const text = await readResponseText(response)

    expect(text).toContain('"object":"chat.completion.chunk"')
    expect(text).toContain('"content":"hello"')
    expect(text).toContain('"annotations"')
    expect(text).toContain('"thinking"')
    expect(text).toContain('"tool_calls"')
    expect(text).toContain('"finish_reason":"tool_calls"')
  })

  it('keeps OpenAI Responses SSE tool-call indexes stable', async () => {
    const transformer = new OpenAIResponsesTransformer()
    const sse = [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"Lookup"},"response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_2","call_id":"call_2","name":"Read"},"response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_1","delta":"{\\"q\\":","response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.function_call_arguments.delta","output_index":1,"item_id":"fc_2","delta":"{\\"path\\":","response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_1","delta":"\\"x\\"}","response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.function_call_arguments.delta","output_index":1,"item_id":"fc_2","delta":"\\"/tmp/a.txt\\"}","response":{"model":"gpt-5-codex"}}',
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5-codex","output":[{"type":"function_call"},{"type":"function_call"}]}}',
      '',
    ].join('\n\n')

    const response = await transformer.formatResponse(new Response(sse, {
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const chunks = (await readResponseText(response))
      .split('\n')
      .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
      .map(line => JSON.parse(line.slice(6)))

    const toolCallDeltas = chunks
      .flatMap(chunk => chunk.choices?.[0]?.delta?.tool_calls || [])

    expect(toolCallDeltas).toEqual([
      expect.objectContaining({ index: 0, id: 'call_1' }),
      expect.objectContaining({ index: 1, id: 'call_2' }),
      expect.objectContaining({ index: 0, function: { arguments: '{"q":' } }),
      expect.objectContaining({ index: 1, function: { arguments: '{"path":' } }),
      expect.objectContaining({ index: 0, function: { arguments: '"x"}' } }),
      expect.objectContaining({ index: 1, function: { arguments: '"/tmp/a.txt"}' } }),
    ])
  })

  it('converts OpenAI chat SSE text and multiple tool calls with stable Anthropic block indexes', async () => {
    const openaiSse = [
      'data: {"id":"chunk_1","object":"chat.completion.chunk","model":"gpt-5-codex","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}',
      'data: {"id":"chunk_1","object":"chat.completion.chunk","model":"gpt-5-codex","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"Lookup","arguments":""}},{"index":1,"id":"call_2","type":"function","function":{"name":"Read","arguments":""}}]},"finish_reason":null}]}',
      'data: {"id":"chunk_1","object":"chat.completion.chunk","model":"gpt-5-codex","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"q\\":"}},{"index":1,"function":{"arguments":"{\\"path\\":"}}]},"finish_reason":null}]}',
      'data: {"id":"chunk_1","object":"chat.completion.chunk","model":"gpt-5-codex","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"x\\"}"}},{"index":1,"function":{"arguments":"\\"/tmp/a.txt\\"}"}}]},"finish_reason":null}]}',
      'data: {"id":"chunk_1","object":"chat.completion.chunk","model":"gpt-5-codex","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":3,"completion_tokens":4,"prompt_tokens_details":{"cached_tokens":2}}}',
      'data: [DONE]',
      '',
    ].join('\n\n')

    const stream = await convertOpenAIStreamToAnthropic(new Response(openaiSse).body!)
    const text = await readStreamText(stream)
    const events = text
      .split('\n\n')
      .filter(Boolean)
      .map((event) => {
        const eventName = event.match(/^event: (.+)$/m)?.[1]
        const data = event.match(/^data: (.+)$/m)?.[1]
        return data ? { event: eventName, data: JSON.parse(data) } : null
      })
      .filter(Boolean) as Array<{ event?: string, data: any }>

    expect(events.filter(item => item.event === 'content_block_start').map(item => item.data.index)).toEqual([0, 1, 2])
    expect(events.filter(item => item.event === 'content_block_stop').map(item => item.data.index)).toEqual([0, 1, 2])
    expect(events.filter(item => item.data.delta?.type === 'input_json_delta').map(item => item.data.index)).toEqual([1, 2, 1, 2])
    expect(events.find(item => item.event === 'message_delta')?.data).toEqual(expect.objectContaining({
      delta: expect.objectContaining({ stop_reason: 'tool_use' }),
      usage: expect.objectContaining({ cache_read_input_tokens: 2 }),
    }))
  })

  it('converts OpenAI chat SSE annotations into paired web search blocks', async () => {
    const openaiSse = [
      'data: {"id":"chunk_1","object":"chat.completion.chunk","model":"gpt-5-codex","choices":[{"index":0,"delta":{"content":"answer"},"finish_reason":null}]}',
      'data: {"id":"chunk_1","object":"chat.completion.chunk","model":"gpt-5-codex","choices":[{"index":0,"delta":{"annotations":[{"type":"url_citation","url_citation":{"url":"https://example.com","title":"Example"}}]},"finish_reason":null}]}',
      'data: {"id":"chunk_1","object":"chat.completion.chunk","model":"gpt-5-codex","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      'data: [DONE]',
      '',
    ].join('\n\n')

    const stream = await convertOpenAIStreamToAnthropic(new Response(openaiSse).body!)
    const text = await readStreamText(stream)
    const events = text
      .split('\n\n')
      .filter(Boolean)
      .map((event) => {
        const eventName = event.match(/^event: (.+)$/m)?.[1]
        const data = event.match(/^data: (.+)$/m)?.[1]
        return data ? { event: eventName, data: JSON.parse(data) } : null
      })
      .filter(Boolean) as Array<{ event?: string, data: any }>

    const blockStarts = events.filter(item => item.event === 'content_block_start')
    const serverToolUse = blockStarts.find(item => item.data.content_block.type === 'server_tool_use')
    const webSearchResult = blockStarts.find(item => item.data.content_block.type === 'web_search_tool_result')

    expect(serverToolUse?.data.content_block).toEqual(expect.objectContaining({
      type: 'server_tool_use',
      id: expect.stringMatching(/^srvtoolu_/),
      name: 'web_search',
    }))
    expect(webSearchResult?.data.content_block).toEqual(expect.objectContaining({
      type: 'web_search_tool_result',
      tool_use_id: serverToolUse?.data.content_block.id,
    }))
    expect(webSearchResult?.data.content_block.content).toEqual([{
      type: 'web_search_result',
      title: 'Example',
      url: 'https://example.com',
    }])
  })

  it('builds Gemini requests with tool responses and thinking config', () => {
    const inputSchema = {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          extraProviderField: true,
        },
      },
      unsupportedTopLevelField: true,
    }
    const body = buildRequestBody({
      model: 'gemini-2.5-pro',
      messages: [
        {
          role: 'assistant',
          content: '',
          thinking: { signature: 'sig_1' },
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'Lookup', arguments: '{"q":"x"}' },
          }],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: 'lookup result',
        },
      ],
      reasoning: {
        effort: 'medium',
        max_tokens: 50000,
      },
      tools: [{
        name: 'Lookup',
        description: 'lookup',
        input_schema: inputSchema,
      }],
    })

    expect(inputSchema).toEqual({
      type: 'object',
      properties: {
        q: {
          type: 'string',
          extraProviderField: true,
        },
      },
      unsupportedTopLevelField: true,
    })
    expect(body.tools[0].functionDeclarations[0].parametersJsonSchema).toEqual({
      type: 'object',
      properties: {
        q: {
          type: 'string',
        },
      },
    })
    expect(body.contents[0]).toEqual(expect.objectContaining({
      role: 'model',
      parts: expect.arrayContaining([
        expect.objectContaining({
          functionCall: expect.objectContaining({ id: 'call_1', name: 'Lookup' }),
          thoughtSignature: 'sig_1',
        }),
      ]),
    }))
    expect(body.contents[1]).toEqual({
      role: 'user',
      parts: [{
        functionResponse: {
          name: 'Lookup',
          response: { result: 'lookup result' },
        },
      }],
    })
    expect(body.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingBudget: 32768,
    })

    const gemini3Body = buildRequestBody({
      model: 'gemini-3-pro',
      messages: [{ role: 'user', content: 'hello' }],
      reasoning: { effort: 'high' },
    })
    expect(gemini3Body.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'high',
    })

    const disabledThinkingBody = buildRequestBody({
      model: 'gemini-2.5-pro',
      messages: [{ role: 'user', content: 'hello' }],
      reasoning: {
        enabled: false,
        effort: 'high',
        max_tokens: 1000,
      },
    })
    expect(disabledThinkingBody.generationConfig).toBeUndefined()
  })

  it('builds Gemini thinking config from Anthropic thinking', () => {
    const body = buildRequestBody({
      model: 'gemini-2.5-pro',
      messages: [{ role: 'user', content: 'think' }],
      thinking: {
        type: 'enabled',
        budget_tokens: 50000,
      },
    })

    expect(body.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingBudget: 32768,
    })

    const gemini3Body = buildRequestBody({
      model: 'gemini-3-pro',
      messages: [{ role: 'user', content: 'think' }],
      thinking: {
        type: 'enabled',
        budget_tokens: 8000,
      },
    })

    expect(gemini3Body.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'low',
    })
  })

  it('builds Gemini requests from Anthropic tool blocks and images directly', () => {
    const body = buildRequestBody({
      model: 'gemini-2.5-pro',
      messages: [
        {
          role: 'user',
          content: [{
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'abc123',
            },
          }],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Using lookup.' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'Lookup',
              input: { q: 'x' },
            },
          ],
          thinking: { signature: 'sig_1' },
        },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: 'lookup result',
          }],
        },
      ],
    })

    expect(body.contents[0].parts[0]).toEqual({
      inlineData: {
        mime_type: 'image/png',
        data: 'abc123',
      },
    })
    expect(body.contents[1]).toEqual({
      role: 'model',
      parts: [
        { text: 'Using lookup.' },
        {
          functionCall: {
            id: 'toolu_1',
            name: 'Lookup',
            args: { q: 'x' },
          },
          thoughtSignature: 'sig_1',
        },
      ],
    })
    expect(body.contents[2]).toEqual({
      role: 'user',
      parts: [{
        functionResponse: {
          name: 'Lookup',
          response: { result: 'lookup result' },
        },
      }],
    })
  })

  it('formats Gemini thinking responses and usage fields', async () => {
    const response = await formatResponseFromGemini(new Response(JSON.stringify({
      responseId: 'gemini_resp',
      modelVersion: 'gemini-2.5-pro',
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [
            { text: 'thinking ', thought: true },
            { thoughtSignature: 'sig_1' },
            { text: 'answer' },
          ],
        },
      }],
      usageMetadata: {
        promptTokenCount: 3,
        candidatesTokenCount: 4,
        cachedContentTokenCount: 2,
        totalTokenCount: 9,
        thoughtsTokenCount: 5,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    }))

    const chat = JSON.parse(await readResponseText(response))
    expect(chat.choices[0].message.content).toBe('answer')
    expect(chat.choices[0].message.thinking).toEqual({
      content: 'thinking ',
      signature: 'sig_1',
    })
    expect(chat.usage.cache_read_input_tokens).toBe(2)
    expect(chat.usage.output_tokens_details.reasoning_tokens).toBe(5)

    const responseWithoutSignature = await formatResponseFromGemini(new Response(JSON.stringify({
      responseId: 'gemini_resp_2',
      modelVersion: 'gemini-2.5-flash',
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [
            { text: 'thinking without signature', thought: true },
            { text: 'answer' },
          ],
        },
      }],
    }), {
      headers: { 'Content-Type': 'application/json' },
    }))

    const chatWithoutSignature = JSON.parse(await readResponseText(responseWithoutSignature))
    expect(chatWithoutSignature.choices[0].message.thinking).toEqual({
      content: 'thinking without signature',
    })
  })

  it('keeps OpenRouter image formatting provider-specific', async () => {
    const transformer = new OpenrouterTransformer()
    const nonClaude = await transformer.formatRequest({
      model: 'openai/gpt-4o',
      messages: [{
        role: 'user',
        content: [{
          type: 'image_url',
          image_url: { url: 'abc123' },
          media_type: 'image/png',
        }],
      }],
    })
    expect(nonClaude.messages[0].content[0].image_url.url).toBe('abc123')
    expect(nonClaude.messages[0].content[0].media_type).toBeUndefined()

    const claude = await transformer.formatRequest({
      model: 'anthropic/claude-sonnet-4.5',
      messages: [{
        role: 'user',
        content: [{
          type: 'image_url',
          image_url: { url: 'abc123' },
          media_type: 'image/png',
        }],
      }],
    })
    expect(claude.messages[0].content[0].image_url.url).toBe('data:image/png;base64,abc123')
    expect(claude.messages[0].content[0].media_type).toBeUndefined()
  })
})
