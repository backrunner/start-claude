import { v4 as uuidv4 } from 'uuid';
export function convertOpenAIResponseToAnthropic(openaiResponse) {
    try {
        const choice = openaiResponse.choices[0];
        if (!choice?.message) {
            throw new Error('No choices found in OpenAI response');
        }
        const content = [];
        if (choice.message.thinking) {
            content.push({
                type: 'thinking',
                thinking: choice.message.thinking.content || '',
                signature: choice.message.thinking.signature || '',
            });
        }
        if (choice.message.annotations?.length) {
            const id = `srvtoolu_${uuidv4()}`;
            content.push({
                type: 'server_tool_use',
                id,
                name: 'web_search',
                input: {
                    query: '',
                },
            });
            content.push({
                type: 'web_search_tool_result',
                tool_use_id: id,
                content: choice.message.annotations.map(item => ({
                    type: 'web_search_result',
                    url: item.url_citation.url,
                    title: item.url_citation.title,
                })),
            });
        }
        if (choice.message.content) {
            content.push({
                type: 'text',
                text: choice.message.content,
            });
        }
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            choice.message.tool_calls.forEach((toolCall) => {
                let parsedInput = {};
                try {
                    const argumentsStr = toolCall.function.arguments || '{}';
                    if (typeof argumentsStr === 'object') {
                        parsedInput = argumentsStr;
                    }
                    else if (typeof argumentsStr === 'string') {
                        parsedInput = JSON.parse(argumentsStr);
                    }
                }
                catch {
                    parsedInput = { text: toolCall.function.arguments || '' };
                }
                content.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: parsedInput,
                });
            });
        }
        const result = {
            id: openaiResponse.id,
            type: 'message',
            role: 'assistant',
            model: openaiResponse.model,
            content,
            stop_reason: choice.finish_reason === 'stop'
                ? 'end_turn'
                : choice.finish_reason === 'length'
                    ? 'max_tokens'
                    : choice.finish_reason === 'tool_calls'
                        ? 'tool_use'
                        : choice.finish_reason === 'content_filter'
                            ? 'stop_sequence'
                            : 'end_turn',
            stop_sequence: null,
            usage: {
                input_tokens: openaiResponse.usage?.prompt_tokens || 0,
                output_tokens: openaiResponse.usage?.completion_tokens || 0,
                cache_read_input_tokens: openaiResponse.usage?.cache_read_input_tokens
                    || openaiResponse.usage?.prompt_tokens_details?.cached_tokens
                    || 0,
            },
        };
        return result;
    }
    catch {
        throw new Error(`Provider error: ${JSON.stringify(openaiResponse)}`);
    }
}
export async function convertOpenAIStreamToAnthropic(openaiStream) {
    const readable = new ReadableStream({
        start: async (controller) => {
            const encoder = new TextEncoder();
            const messageId = `msg_${Date.now()}`;
            let stopReasonMessageDelta = null;
            let model = 'unknown';
            let hasStarted = false;
            let hasTextContentStarted = false;
            const toolCalls = new Map();
            const toolCallIndexToContentBlockIndex = new Map();
            let toolCallChunks = 0;
            let contentChunks = 0;
            let isClosed = false;
            let isThinkingStarted = false;
            let contentIndex = 0;
            let currentContentBlockIndex = -1;
            let thinkingContentBlockIndex = null;
            let textContentBlockIndex = null;
            const openContentBlockIndexes = new Set();
            const safeEnqueue = (data) => {
                if (!isClosed) {
                    try {
                        controller.enqueue(data);
                        new TextDecoder().decode(data);
                    }
                    catch (error) {
                        if (error instanceof TypeError
                            && error.message.includes('Controller is already closed')) {
                            isClosed = true;
                        }
                        else {
                            throw error;
                        }
                    }
                }
            };
            const stopContentBlock = (index) => {
                if (!openContentBlockIndexes.has(index)) {
                    return;
                }
                const contentBlockStop = {
                    type: 'content_block_stop',
                    index,
                };
                safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`));
                openContentBlockIndexes.delete(index);
                if (currentContentBlockIndex === index) {
                    currentContentBlockIndex = -1;
                }
                if (thinkingContentBlockIndex === index) {
                    thinkingContentBlockIndex = null;
                    isThinkingStarted = false;
                }
                if (textContentBlockIndex === index) {
                    textContentBlockIndex = null;
                    hasTextContentStarted = false;
                }
            };
            const stopOpenContentBlocks = () => {
                Array.from(openContentBlockIndexes)
                    .sort((a, b) => a - b)
                    .forEach(index => stopContentBlock(index));
            };
            const stopNonToolContentBlocks = () => {
                if (textContentBlockIndex !== null) {
                    stopContentBlock(textContentBlockIndex);
                }
                if (thinkingContentBlockIndex !== null) {
                    stopContentBlock(thinkingContentBlockIndex);
                }
            };
            const safeClose = () => {
                if (!isClosed) {
                    try {
                        stopOpenContentBlocks();
                        if (stopReasonMessageDelta) {
                            safeEnqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(stopReasonMessageDelta)}\n\n`));
                            stopReasonMessageDelta = null;
                        }
                        else {
                            safeEnqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({
                                type: 'message_delta',
                                delta: {
                                    stop_reason: 'end_turn',
                                    stop_sequence: null,
                                },
                                usage: {
                                    input_tokens: 0,
                                    output_tokens: 0,
                                    cache_read_input_tokens: 0,
                                },
                            })}\n\n`));
                        }
                        const messageStop = {
                            type: 'message_stop',
                        };
                        safeEnqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`));
                        controller.close();
                        isClosed = true;
                    }
                    catch (error) {
                        if (error instanceof TypeError
                            && error.message.includes('Controller is already closed')) {
                            isClosed = true;
                        }
                        else {
                            throw error;
                        }
                    }
                }
            };
            let reader = null;
            try {
                reader = openaiStream.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                    if (isClosed)
                        break;
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (isClosed)
                            break;
                        if (!line.startsWith('data:'))
                            continue;
                        const data = line.slice(5).trim();
                        if (data === '[DONE]')
                            continue;
                        try {
                            const chunk = JSON.parse(data);
                            if (chunk.error) {
                                const errorMessage = {
                                    type: 'error',
                                    message: {
                                        type: 'api_error',
                                        message: JSON.stringify(chunk.error),
                                    },
                                };
                                safeEnqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(errorMessage)}\n\n`));
                                continue;
                            }
                            model = chunk.model || model;
                            if (!hasStarted && !isClosed) {
                                hasStarted = true;
                                const messageStart = {
                                    type: 'message_start',
                                    message: {
                                        id: messageId,
                                        type: 'message',
                                        role: 'assistant',
                                        content: [],
                                        model,
                                        stop_reason: null,
                                        stop_sequence: null,
                                        usage: {
                                            input_tokens: 0,
                                            output_tokens: 0,
                                        },
                                    },
                                };
                                safeEnqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`));
                            }
                            const choice = chunk.choices?.[0];
                            if (chunk.usage) {
                                const usage = {
                                    input_tokens: chunk.usage?.prompt_tokens || 0,
                                    output_tokens: chunk.usage?.completion_tokens || 0,
                                    cache_read_input_tokens: chunk.usage?.cache_read_input_tokens
                                        || chunk.usage?.prompt_tokens_details?.cached_tokens
                                        || 0,
                                };
                                if (!stopReasonMessageDelta) {
                                    stopReasonMessageDelta = {
                                        type: 'message_delta',
                                        delta: {
                                            stop_reason: 'end_turn',
                                            stop_sequence: null,
                                        },
                                        usage,
                                    };
                                }
                                else {
                                    stopReasonMessageDelta.usage = usage;
                                }
                            }
                            if (!choice)
                                continue;
                            if (choice?.delta?.thinking && !isClosed) {
                                if (textContentBlockIndex !== null) {
                                    stopContentBlock(textContentBlockIndex);
                                }
                                if (!isThinkingStarted) {
                                    const blockIndex = contentIndex++;
                                    const contentBlockStart = {
                                        type: 'content_block_start',
                                        index: blockIndex,
                                        content_block: { type: 'thinking', thinking: '' },
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`));
                                    currentContentBlockIndex = blockIndex;
                                    thinkingContentBlockIndex = blockIndex;
                                    openContentBlockIndexes.add(blockIndex);
                                    isThinkingStarted = true;
                                }
                                if (choice.delta.thinking.signature) {
                                    const blockIndex = thinkingContentBlockIndex ?? currentContentBlockIndex;
                                    const thinkingSignature = {
                                        type: 'content_block_delta',
                                        index: blockIndex,
                                        delta: {
                                            type: 'signature_delta',
                                            signature: choice.delta.thinking.signature,
                                        },
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(thinkingSignature)}\n\n`));
                                    stopContentBlock(blockIndex);
                                }
                                else if (choice.delta.thinking.content) {
                                    const blockIndex = thinkingContentBlockIndex ?? currentContentBlockIndex;
                                    const thinkingChunk = {
                                        type: 'content_block_delta',
                                        index: blockIndex,
                                        delta: {
                                            type: 'thinking_delta',
                                            thinking: choice.delta.thinking.content || '',
                                        },
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(thinkingChunk)}\n\n`));
                                }
                            }
                            if (choice?.delta?.content && !isClosed) {
                                contentChunks++;
                                if (thinkingContentBlockIndex !== null) {
                                    stopContentBlock(thinkingContentBlockIndex);
                                }
                                if (!hasTextContentStarted) {
                                    const blockIndex = contentIndex++;
                                    hasTextContentStarted = true;
                                    const contentBlockStart = {
                                        type: 'content_block_start',
                                        index: blockIndex,
                                        content_block: {
                                            type: 'text',
                                            text: '',
                                        },
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`));
                                    currentContentBlockIndex = blockIndex;
                                    textContentBlockIndex = blockIndex;
                                    openContentBlockIndexes.add(blockIndex);
                                }
                                if (!isClosed) {
                                    const anthropicChunk = {
                                        type: 'content_block_delta',
                                        index: textContentBlockIndex ?? currentContentBlockIndex,
                                        delta: {
                                            type: 'text_delta',
                                            text: choice.delta.content,
                                        },
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(anthropicChunk)}\n\n`));
                                }
                            }
                            if (choice?.delta?.annotations?.length
                                && !isClosed) {
                                if (textContentBlockIndex !== null) {
                                    stopContentBlock(textContentBlockIndex);
                                }
                                if (thinkingContentBlockIndex !== null) {
                                    stopContentBlock(thinkingContentBlockIndex);
                                }
                                choice?.delta?.annotations.forEach((annotation) => {
                                    const serverToolUseId = `srvtoolu_${uuidv4()}`;
                                    const serverToolUseIndex = contentIndex++;
                                    const serverToolUseStart = {
                                        type: 'content_block_start',
                                        index: serverToolUseIndex,
                                        content_block: {
                                            type: 'server_tool_use',
                                            id: serverToolUseId,
                                            name: 'web_search',
                                            input: {
                                                query: '',
                                            },
                                        },
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(serverToolUseStart)}\n\n`));
                                    const serverToolUseStop = {
                                        type: 'content_block_stop',
                                        index: serverToolUseIndex,
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(serverToolUseStop)}\n\n`));
                                    const resultIndex = contentIndex++;
                                    const contentBlockStart = {
                                        type: 'content_block_start',
                                        index: resultIndex,
                                        content_block: {
                                            type: 'web_search_tool_result',
                                            tool_use_id: serverToolUseId,
                                            content: [
                                                {
                                                    type: 'web_search_result',
                                                    title: annotation.url_citation.title,
                                                    url: annotation.url_citation.url,
                                                },
                                            ],
                                        },
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`));
                                    const contentBlockStop = {
                                        type: 'content_block_stop',
                                        index: resultIndex,
                                    };
                                    safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`));
                                    currentContentBlockIndex = -1;
                                });
                            }
                            if (choice?.delta?.tool_calls && !isClosed) {
                                toolCallChunks++;
                                const processedInThisChunk = new Set();
                                for (const toolCall of choice.delta.tool_calls) {
                                    if (isClosed)
                                        break;
                                    const toolCallIndex = toolCall.index ?? 0;
                                    if (processedInThisChunk.has(toolCallIndex))
                                        continue;
                                    processedInThisChunk.add(toolCallIndex);
                                    const isUnknownIndex = !toolCallIndexToContentBlockIndex.has(toolCallIndex);
                                    if (isUnknownIndex) {
                                        stopNonToolContentBlocks();
                                        const newContentBlockIndex = contentIndex++;
                                        toolCallIndexToContentBlockIndex.set(toolCallIndex, newContentBlockIndex);
                                        openContentBlockIndexes.add(newContentBlockIndex);
                                        const toolCallId = toolCall.id || `call_${Date.now()}_${toolCallIndex}`;
                                        const toolCallName = toolCall.function?.name || `tool_${toolCallIndex}`;
                                        const contentBlockStart = {
                                            type: 'content_block_start',
                                            index: newContentBlockIndex,
                                            content_block: {
                                                type: 'tool_use',
                                                id: toolCallId,
                                                name: toolCallName,
                                                input: {},
                                            },
                                        };
                                        safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`));
                                        currentContentBlockIndex = newContentBlockIndex;
                                        const toolCallInfo = {
                                            id: toolCallId,
                                            name: toolCallName,
                                            arguments: '',
                                            contentBlockIndex: newContentBlockIndex,
                                        };
                                        toolCalls.set(toolCallIndex, toolCallInfo);
                                    }
                                    else if (toolCall.id && toolCall.function?.name) {
                                        const existingToolCall = toolCalls.get(toolCallIndex);
                                        const wasTemporary = existingToolCall.id.startsWith('call_')
                                            && existingToolCall.name.startsWith('tool_');
                                        if (wasTemporary) {
                                            existingToolCall.id = toolCall.id;
                                            existingToolCall.name = toolCall.function.name;
                                        }
                                    }
                                    if (toolCall.function?.arguments
                                        && !isClosed) {
                                        const blockIndex = toolCallIndexToContentBlockIndex.get(toolCallIndex);
                                        if (blockIndex === undefined)
                                            continue;
                                        const currentToolCall = toolCalls.get(toolCallIndex);
                                        if (currentToolCall) {
                                            currentToolCall.arguments
                                                += toolCall.function.arguments;
                                        }
                                        try {
                                            const anthropicChunk = {
                                                type: 'content_block_delta',
                                                index: blockIndex,
                                                delta: {
                                                    type: 'input_json_delta',
                                                    partial_json: toolCall.function.arguments,
                                                },
                                            };
                                            safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(anthropicChunk)}\n\n`));
                                        }
                                        catch {
                                            try {
                                                const fixedArgument = toolCall.function.arguments
                                                    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                                                    .replace(/\\/g, '\\\\')
                                                    .replace(/"/g, '\\"');
                                                const fixedChunk = {
                                                    type: 'content_block_delta',
                                                    index: blockIndex,
                                                    delta: {
                                                        type: 'input_json_delta',
                                                        partial_json: fixedArgument,
                                                    },
                                                };
                                                safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(fixedChunk)}\n\n`));
                                            }
                                            catch (fixError) {
                                                console.error(fixError);
                                            }
                                        }
                                    }
                                }
                            }
                            if (choice?.finish_reason && !isClosed) {
                                if (contentChunks === 0 && toolCallChunks === 0) {
                                    console.error('Warning: No content in the stream response!');
                                }
                                stopOpenContentBlocks();
                                if (!isClosed) {
                                    const stopReasonMapping = {
                                        stop: 'end_turn',
                                        length: 'max_tokens',
                                        tool_calls: 'tool_use',
                                        content_filter: 'stop_sequence',
                                    };
                                    const anthropicStopReason = stopReasonMapping[choice.finish_reason] || 'end_turn';
                                    stopReasonMessageDelta = {
                                        type: 'message_delta',
                                        delta: {
                                            stop_reason: anthropicStopReason,
                                            stop_sequence: null,
                                        },
                                        usage: stopReasonMessageDelta?.usage || {
                                            input_tokens: chunk.usage?.prompt_tokens || 0,
                                            output_tokens: chunk.usage?.completion_tokens || 0,
                                            cache_read_input_tokens: chunk.usage?.cache_read_input_tokens
                                                || chunk.usage?.prompt_tokens_details?.cached_tokens
                                                || 0,
                                        },
                                    };
                                }
                                break;
                            }
                        }
                        catch {
                            continue;
                        }
                    }
                }
                safeClose();
            }
            catch (error) {
                if (!isClosed) {
                    try {
                        controller.error(error);
                    }
                    catch {
                    }
                }
            }
            finally {
                if (reader) {
                    try {
                        reader.releaseLock();
                    }
                    catch {
                    }
                }
            }
        },
        cancel: () => {
        },
    });
    return readable;
}
export function isOpenAIFormat(responseBody) {
    try {
        const parsed = JSON.parse(responseBody);
        return !!(parsed.choices && Array.isArray(parsed.choices)
            && (parsed.object === 'chat.completion' || parsed.object === 'chat.completion.chunk'));
    }
    catch {
        return false;
    }
}
export function isOpenAIStreamFormat(responseBody) {
    return responseBody.includes('"object":"chat.completion.chunk"')
        || responseBody.includes('"choices":[{')
        || responseBody.includes('"delta":{');
}
