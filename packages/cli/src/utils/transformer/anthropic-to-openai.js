function getThinkLevel(budgetTokens) {
    if (!budgetTokens)
        return 'medium';
    if (budgetTokens <= 10000)
        return 'low';
    if (budgetTokens <= 50000)
        return 'medium';
    return 'high';
}
function convertToolChoice(toolChoice) {
    if (!toolChoice) {
        return undefined;
    }
    if (typeof toolChoice === 'string') {
        return toolChoice === 'any' ? 'required' : toolChoice;
    }
    if (toolChoice.type === 'tool') {
        return {
            type: 'function',
            function: { name: toolChoice.name },
        };
    }
    if (toolChoice.type === 'any') {
        return 'required';
    }
    if (toolChoice.type === 'auto' || toolChoice.type === 'none' || toolChoice.type === 'required') {
        return toolChoice.type;
    }
    return toolChoice;
}
export async function convertAnthropicToOpenAI(request) {
    const messages = [];
    if (request.system) {
        if (typeof request.system === 'string') {
            messages.push({
                role: 'system',
                content: request.system,
            });
        }
        else if (Array.isArray(request.system) && request.system.length) {
            const textParts = request.system
                .filter((item) => item.type === 'text' && item.text)
                .map((item) => ({
                type: 'text',
                text: item.text,
                cache_control: item.cache_control,
            }));
            messages.push({
                role: 'system',
                content: textParts,
            });
        }
    }
    const requestMessages = JSON.parse(JSON.stringify(request.messages || []));
    requestMessages?.forEach((msg) => {
        if (msg.role === 'user' || msg.role === 'assistant') {
            if (typeof msg.content === 'string') {
                messages.push({
                    role: msg.role,
                    content: msg.content,
                });
                return;
            }
            if (Array.isArray(msg.content)) {
                if (msg.role === 'user') {
                    const toolParts = msg.content.filter((c) => c.type === 'tool_result' && c.tool_use_id);
                    if (toolParts.length) {
                        toolParts.forEach((tool) => {
                            const toolMessage = {
                                role: 'tool',
                                content: typeof tool.content === 'string'
                                    ? tool.content
                                    : JSON.stringify(tool.content),
                                tool_call_id: tool.tool_use_id,
                                cache_control: tool.cache_control,
                            };
                            messages.push(toolMessage);
                        });
                    }
                    const textAndMediaParts = msg.content.filter((c) => (c.type === 'text' && c.text)
                        || (c.type === 'image' && c.source));
                    if (textAndMediaParts.length) {
                        messages.push({
                            role: 'user',
                            content: textAndMediaParts.map((part) => {
                                if (part?.type === 'image') {
                                    return {
                                        type: 'image_url',
                                        image_url: {
                                            url: part.source?.type === 'base64'
                                                ? part.source.data
                                                : part.source.url,
                                        },
                                        media_type: part.source.media_type,
                                    };
                                }
                                return part;
                            }),
                        });
                    }
                }
                else if (msg.role === 'assistant') {
                    const assistantMessage = {
                        role: 'assistant',
                        content: '',
                    };
                    const textParts = msg.content.filter((c) => c.type === 'text' && c.text);
                    if (textParts.length) {
                        assistantMessage.content = textParts
                            .map((text) => text.text)
                            .join('\n');
                    }
                    const toolCallParts = msg.content.filter((c) => c.type === 'tool_use' && c.id);
                    if (toolCallParts.length) {
                        assistantMessage.tool_calls = toolCallParts.map((tool) => {
                            return {
                                id: tool.id,
                                type: 'function',
                                function: {
                                    name: tool.name,
                                    arguments: JSON.stringify(tool.input || {}),
                                },
                            };
                        });
                    }
                    messages.push(assistantMessage);
                }
            }
        }
    });
    const result = {
        model: request.model,
        messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        stream: request.stream,
        tools: request.tools?.length
            ? convertAnthropicToolsToUnified(request.tools)
            : undefined,
        tool_choice: convertToolChoice(request.tool_choice),
    };
    if (request.thinking) {
        result.reasoning = {
            effort: getThinkLevel(request.thinking.budget_tokens),
            enabled: request.thinking.type === 'enabled' || request.thinking.enabled === true,
            max_tokens: request.thinking.budget_tokens,
        };
    }
    else if (request.reasoning) {
        result.reasoning = {
            effort: request.reasoning.effort,
            enabled: request.reasoning.enabled !== false,
            max_tokens: request.reasoning.max_tokens,
        };
    }
    if (request.stop_sequences?.length) {
        result.stop = request.stop_sequences;
    }
    return result;
}
function convertAnthropicToolsToUnified(anthropicTools) {
    return anthropicTools.map((tool) => {
        if (tool.type === 'function') {
            return {
                type: 'function',
                function: {
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters,
                },
            };
        }
        if (tool.name && tool.input_schema) {
            return {
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description || '',
                    parameters: tool.input_schema,
                },
            };
        }
        return tool;
    });
}
export function buildOpenAIRequestBody(unifiedRequest) {
    const body = {
        model: unifiedRequest.model,
        messages: unifiedRequest.messages || [],
        max_tokens: unifiedRequest.max_tokens,
        temperature: unifiedRequest.temperature,
        top_p: unifiedRequest.top_p,
        stream: unifiedRequest.stream,
    };
    if (unifiedRequest.stop?.length) {
        body.stop = unifiedRequest.stop;
    }
    if (unifiedRequest.tools && unifiedRequest.tools.length > 0) {
        body.tools = unifiedRequest.tools;
    }
    if (unifiedRequest.tool_choice) {
        body.tool_choice = unifiedRequest.tool_choice;
    }
    if (unifiedRequest.reasoning?.enabled) {
        body.reasoning = {
            effort: unifiedRequest.reasoning.effort || 'medium',
        };
        if (typeof unifiedRequest.reasoning.max_tokens === 'number') {
            body.reasoning.max_tokens = unifiedRequest.reasoning.max_tokens;
        }
    }
    return body;
}
