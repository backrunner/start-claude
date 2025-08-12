# Transformer Guide

Transformers allow start-claude to convert requests between different API formats, enabling compatibility with various AI providers while using Claude Code. This feature is essential for using non-Anthropic API providers with Claude Code.

## Overview

Transformers provide:

- **🔄 Format Conversion**: Convert between Claude and other AI API formats (OpenAI, etc.)
- **🌐 Provider Support**: Connect Claude Code to different AI service providers
- **🚀 Seamless Integration**: Transparent proxy that handles format conversion automatically
- **⚖️ Load Balancer Compatibility**: Works with load balancing for multiple providers
- **⚙️ Auto-Detection**: Automatically enables proxy mode for transformer-enabled configs

## How Transformers Work

1. **Request Interception**: Claude Code sends requests to start-claude proxy
2. **Format Detection**: Proxy detects the target API format based on configuration
3. **Request Transformation**: Converts Claude API format to target provider format
4. **Response Conversion**: Transforms provider response back to Claude format
5. **Seamless Delivery**: Claude Code receives properly formatted responses

## Configuration

### Enable Transformer for a Configuration

```bash
# Add a configuration with transformer enabled
start-claude add
# During setup:
# - Name: openai-provider
# - Profile Type: default
# - Base URL: https://api.openai.com/v1
# - API Key: sk-your-openai-key
# - Enable Transformer: Yes
```

### Configuration Structure

```json
{
  "name": "openai-provider",
  "profileType": "default",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-your-openai-key",
  "transformerEnabled": true,
  "model": "gpt-4"
}
```

### Required Fields for Transformer Configs

Transformer-enabled configurations **must** include:

- **`baseUrl`**: Target API endpoint URL
- **`apiKey`**: Authentication key for the target provider
- **`transformerEnabled: true`**: Enable transformer processing

## Supported Providers

### OpenAI API

Configure for OpenAI-compatible APIs:

```json
{
  "name": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-your-openai-key",
  "transformerEnabled": true,
  "model": "gpt-4"
}
```

### Custom API Providers

For providers with OpenAI-compatible endpoints:

```json
{
  "name": "custom-provider",
  "baseUrl": "https://your-provider.com/v1",
  "apiKey": "your-api-key",
  "transformerEnabled": true,
  "model": "custom-model"
}
```

## Usage Examples

### Single Transformer Configuration

```bash
# Create transformer config
start-claude add
# Name: openai-gpt4
# Base URL: https://api.openai.com/v1
# API Key: sk-your-key
# Transformer: Yes

# Use the configuration
start-claude openai-gpt4
# Automatically enables proxy mode with transformer
```

### Multiple Providers with Load Balancing

```bash
# Add multiple transformer configs
start-claude add  # openai-provider (order: 0)
start-claude add  # anthropic-backup (order: 10)
start-claude add  # custom-provider (order: 5)

# Start with load balancing across all providers
start-claude --balance
```

### Mixed Configuration Types

```bash
# Mix regular Claude configs with transformer configs
start-claude --balance claude-official openai-gpt4 custom-provider
# Load balances between different API providers
```

## Proxy Mode Integration

### Automatic Proxy Enablement

Transformer configurations automatically enable proxy mode:

```bash
# This automatically starts proxy server
start-claude openai-config

# Equivalent to:
start-claude --balance openai-config
```

### Manual Proxy Control

```bash
# Start with transformer support but no load balancing
start-claude openai-config

# Start with full load balancing across providers
start-claude --balance openai-config anthropic-config
```

## Request/Response Format Conversion

### Claude → OpenAI Format Conversion

**Claude Code Request:**

```json
{
  "model": "claude-3-sonnet",
  "max_tokens": 1000,
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

**Transformed to OpenAI:**

```json
{
  "model": "gpt-4",
  "max_tokens": 1000,
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

### Response Conversion

**OpenAI Response:**

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help?"
      }
    }
  ]
}
```

**Transformed to Claude Format:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help?"
    }
  ],
  "role": "assistant"
}
```

## Configuration Management

### Via Command Line

```bash
# List configurations (shows transformer status)
start-claude list

# Edit transformer settings
start-claude edit openai-config
```

### Via Web Interface

```bash
# Open configuration manager
start-claude manager

# Features:
# - Toggle transformer enable/disable
# - Configure API endpoints
# - Set model preferences
# - Manage load balancing order
```

### Configuration File

Edit directly in `~/.start-claude/config.json`:

```json
{
  "configs": [
    {
      "name": "openai-gpt4",
      "profileType": "default",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-your-openai-key",
      "transformerEnabled": true,
      "model": "gpt-4",
      "order": 0
    }
  ]
}
```

## Advanced Usage

### Health Monitoring

Transformer configurations participate in health checks:

```bash
# Health check tests transformer endpoint
start-claude --balance --verbose
```

Health check process:

1. Sends test request to transformer endpoint
2. Verifies response format conversion
3. Marks endpoint healthy/unhealthy
4. Participates in load balancing

### Error Handling

Common transformer errors:

- **401 Unauthorized**: Invalid API key for target provider
- **404 Not Found**: Incorrect base URL or unsupported endpoint
- **422 Validation**: Model not supported by target provider
- **Transform Error**: Format conversion failed

### Debugging

Enable verbose logging:

```bash
# Show transformer processing details
start-claude --balance --verbose

# Monitor transformation logs
# Logs show: request transformation, response conversion, provider responses
```

## Best Practices

1. **API Key Security**: Use separate API keys for different providers
2. **Model Compatibility**: Ensure model names match target provider capabilities
3. **Rate Limiting**: Consider provider-specific rate limits in load balancing
4. **Health Monitoring**: Regular health checks ensure transformer reliability
5. **Fallback Strategy**: Mix multiple providers for redundancy

## Troubleshooting

### Transformer Not Working

Check configuration requirements:

```bash
# Verify transformer config has required fields
start-claude list

# Required:
# - baseUrl: Target API endpoint
# - apiKey: Valid API key
# - transformerEnabled: true
```

### Format Conversion Issues

Common problems:

- **Model mismatch**: Target provider doesn't support specified model
- **API version**: Base URL points to wrong API version
- **Authentication**: API key format doesn't match provider requirements

### Proxy Not Starting

Transformer configs require proxy mode:

```bash
# Proxy starts automatically with transformer configs
start-claude transformer-config

# If proxy fails:
# 1. Check port 2333 availability
# 2. Verify API credentials
# 3. Check network connectivity
```

## Integration Examples

### With Claude Code

```bash
# Set Claude Code to use transformer proxy
export ANTHROPIC_BASE_URL="http://localhost:2333"
export ANTHROPIC_API_KEY="sk-claude-load-balancer-proxy-key"

# Claude Code will send requests to transformer proxy
claude --model openai-gpt4
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
RUN pnpm add -g start-claude
COPY config.json /root/.start-claude/config.json
EXPOSE 2333
CMD ["start-claude", "--balance"]
```

### Multiple Provider Setup

```json
{
  "configs": [
    {
      "name": "anthropic-primary",
      "profileType": "default",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-key",
      "order": 0
    },
    {
      "name": "openai-backup",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-openai-key",
      "transformerEnabled": true,
      "model": "gpt-4",
      "order": 10
    },
    {
      "name": "custom-fallback",
      "baseUrl": "https://custom.api.com/v1",
      "apiKey": "custom-key",
      "transformerEnabled": true,
      "model": "custom-model",
      "order": 20
    }
  ]
}
```

This setup provides a robust multi-provider configuration with automatic failover between different AI services.
