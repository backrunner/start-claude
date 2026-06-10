import { encode } from 'gpt-tokenizer';
export function calculateTokenCount(messages, system, tools) {
    let tokenCount = 0;
    if (Array.isArray(messages)) {
        for (const message of messages) {
            if (typeof message.content === 'string') {
                tokenCount += encode(message.content).length;
            }
            else if (Array.isArray(message.content)) {
                for (const contentPart of message.content) {
                    if (contentPart.type === 'text' && contentPart.text) {
                        tokenCount += encode(contentPart.text).length;
                    }
                    else if (contentPart.type === 'tool_use' && contentPart.input) {
                        tokenCount += encode(JSON.stringify(contentPart.input)).length;
                    }
                    else if (contentPart.type === 'tool_result') {
                        tokenCount += encode(typeof contentPart.content === 'string'
                            ? contentPart.content
                            : JSON.stringify(contentPart.content)).length;
                    }
                }
            }
        }
    }
    if (typeof system === 'string') {
        tokenCount += encode(system).length;
    }
    else if (Array.isArray(system)) {
        for (const item of system) {
            if (item.type !== 'text')
                continue;
            if (typeof item.text === 'string') {
                tokenCount += encode(item.text).length;
            }
        }
    }
    if (tools) {
        for (const tool of tools) {
            if (tool.description) {
                tokenCount += encode(tool.name + tool.description).length;
            }
            if (tool.input_schema) {
                tokenCount += encode(JSON.stringify(tool.input_schema)).length;
            }
        }
    }
    return tokenCount;
}
