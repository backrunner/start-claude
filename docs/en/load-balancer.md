# Load Balancer & Proxy Guide

The enhanced proxy server provides load balancing across multiple Claude API endpoints with intelligent health monitoring, automatic failover, transformer support, and configurable system settings.

## 🆕 Enhanced Features

- **🏥 Smart Health Monitoring**: Configurable health check intervals (10s - 5min)
- **🚫 Endpoint Banning**: Auto-ban failed endpoints with configurable duration (1min - 1hour)
- **🔧 Transformer Support**: Process requests through transformers for different API providers
- **⚙️ System Integration**: Configure via modern web interface
- **🔄 Auto-Enable**: Set balance mode as default behavior
- **📊 Enhanced Logging**: Detailed health check and failover information

## Overview

The proxy server:

- **Distributes requests** across multiple healthy endpoints using configurable strategies
- **Health monitoring** - automatically detects and handles unhealthy endpoints
- **Failover support** - switches to backup endpoints when primary ones fail
- **Performance optimization** - adapts routing based on endpoint response times
- **Transformer processing** - supports transformation between different API formats
- **Priority ordering** - respects configuration order for endpoint priority (fallback strategy)
- **Proxy server** - runs on port 2333 by default

## Load Balancer Strategies

Start Claude supports three different load balancing strategies to optimize request distribution:

### Fallback Strategy (Default)

**Priority-based with failover**

- **Respects endpoint priority**: Uses `order` field to determine primary/backup endpoints
- **Round-robin within priority**: Distributes load evenly among endpoints with same priority
- **Automatic failover**: Falls back to lower priority endpoints when higher ones fail
- **Best for**: Production setups with primary/backup endpoint hierarchy

```bash
start-claude --balance fallback
```

### Polling Strategy

**Round-robin distribution**

- **Ignores priority ordering**: Treats all endpoints equally
- **Even distribution**: Simple round-robin across all healthy endpoints
- **Predictable routing**: Each request goes to the next endpoint in rotation
- **Best for**: Even load distribution across equivalent endpoints

```bash
start-claude --balance polling
```

### Speed First Strategy

**Performance-based routing**

- **Performance monitoring**: Measures response time from request to first token
- **Adaptive routing**: Automatically routes to fastest responding endpoint
- **Continuous optimization**: Updates routing decisions based on real-time performance
- **Warmup period**: Collects multiple samples during startup for reliable routing
- **Best for**: Optimizing response times across endpoints with varying performance

```bash
start-claude --balance speedfirst
```

**Speed First Configuration:**

- **Response Time Window**: Time period for averaging response times (default: 5 minutes)
- **Minimum Samples**: Number of timing samples required before speed-based routing (default: 2)
- **Health Check Timing**: Health checks contribute to performance metrics

## Quick Start

```bash
# Start proxy server with all available configurations (default strategy)
start-claude --balance

# Use specific strategy
start-claude --balance speedfirst         # Performance-optimized routing
start-claude --balance polling           # Even distribution
start-claude --balance fallback          # Priority-based with failover

# Use proxy server with specific configurations and strategy
start-claude --balance polling config1 config2 config3

# Start proxy server without detailed output (simplified mode)
start-claude config1
```

## New Behavior Changes

### Load Balancing Control

- **Load balancing is enabled only when explicitly requested** via `--balance` flag or configuration settings
- The `--balance` flag **enables load balancing** and shows detailed endpoint information and available transformers
- Without `--balance`, proxy mode runs with transformer-only support (no load balancing between multiple endpoints)
- Use system settings to enable load balancing by default if desired

### Transformer Requirements

- **Transformer-enabled configs now require API credentials** (`baseUrl` and `apiKey`)
- This ensures transformers have the necessary credentials to forward requests to external APIs
- Transformer configs participate in load balancing when `--balance` is enabled

## How It Works

### 1. Configuration Priority

Configurations are sorted by their `order` field:

- **Lower numbers = Higher priority** (0 = highest priority)
- **Undefined order** is treated as 0 (highest priority)
- Load balancer tries higher priority endpoints first

```json
{
  "configs": [
    {
      "name": "primary-api",
      "order": 0, // Highest priority
      "baseUrl": "https://primary.api.com",
      "apiKey": "sk-primary"
    },
    {
      "name": "backup-api",
      "order": 10, // Lower priority
      "baseUrl": "https://backup.api.com",
      "apiKey": "sk-backup"
    }
  ]
}
```

### 2. Health Monitoring

The load balancer continuously monitors endpoint health:

- **Initial health check** on startup
- **Periodic health checks** every 30 seconds for unhealthy endpoints
- **Real-time monitoring** during request handling
- **Automatic recovery** when endpoints become healthy again

### 3. Request Distribution

- **Round-robin** among healthy endpoints within the same priority level
- **Automatic failover** to lower priority endpoints when higher ones fail
- **Request retry** with different endpoints on failure
- **Error handling** with appropriate HTTP status codes

## Usage Examples

### Basic Load Balancing

```bash
# Start with all configured endpoints
start-claude --balance

# Specify exact configurations to use
start-claude --balance prod1 prod2 backup
```

### Configuration with Load Balancer

Create multiple configurations for load balancing:

```bash
# Add primary endpoint
start-claude add
# Name: primary
# Base URL: https://api1.anthropic.com
# API Key: sk-primary-key
# Order: 0

# Add backup endpoint
start-claude add
# Name: backup
# Base URL: https://api2.anthropic.com
# API Key: sk-backup-key
# Order: 10

# Start load balancer
start-claude --balance
```

### Using with Claude Code

Once the load balancer is running, configure Claude Code to use it:

```bash
# Set Claude Code to use load balancer endpoint
export ANTHROPIC_BASE_URL="http://localhost:2333"
export ANTHROPIC_AUTH_TOKEN="sk-claude-load-balancer-proxy-key"

# Or use CLI overrides
claude --base-url http://localhost:2333 --api-key sk-claude-load-balancer-proxy-key
```

## Health Check Details

### Health Check Process

1. **POST request** to `/v1/messages` endpoint
2. **Simple ping message** with minimal token usage
3. **Timeout**: 15 seconds for initial checks, 10 seconds for ongoing checks
4. **Success criteria**: HTTP status code < 500
5. **Failure handling**: Mark endpoint as unhealthy and try alternatives

### Health Check Request

```json
{
  "model": "claude-3-haiku-20241022",
  "max_tokens": 10,
  "messages": [
    {
      "role": "user",
      "content": "ping"
    }
  ]
}
```

### Status Monitoring

Check load balancer status:

```bash
# View endpoint health status
start-claude --balance
# Look for status messages during startup
```

Example status output:

```
🔍 Testing endpoints...
✅ primary - HTTP 200: OK
❌ backup - HTTP 401: Unauthorized - Invalid API key
⚠️ First endpoint failed, trying alternatives...
🚀 Load balancer proxy server started on port 2333
```

## Error Handling

### HTTP Status Codes

The load balancer returns appropriate HTTP status codes:

- **200-499**: Forward from upstream endpoint
- **500**: Internal load balancer error
- **502**: Upstream server error (connection failed)
- **503**: All endpoints unavailable

### Error Response Format

```json
{
  "error": {
    "message": "All endpoints are currently unavailable",
    "type": "service_unavailable"
  }
}
```

### Common Error Messages

- **401 Unauthorized**: Invalid API key in configuration
- **403 Forbidden**: API key doesn't have required permissions
- **404 Not Found**: Incorrect base URL or endpoint path
- **429 Rate Limited**: API rate limits exceeded
- **502 Bad Gateway**: Network connectivity issues
- **503 Service Unavailable**: All endpoints are unhealthy

## Advanced Configuration

### Custom Port

```bash
# Start load balancer on custom port
start-claude --balance --port 3000
```

### Endpoint Priority Configuration

Configure endpoint priority using the `order` field:

```json
{
  "name": "tier1-endpoint",
  "order": 0,     // Highest priority
  "baseUrl": "https://tier1.api.com",
  "apiKey": "sk-tier1"
},
{
  "name": "tier2-endpoint",
  "order": 5,     // Medium priority
  "baseUrl": "https://tier2.api.com",
  "apiKey": "sk-tier2"
},
{
  "name": "fallback-endpoint",
  "order": 10,    // Lowest priority
  "baseUrl": "https://fallback.api.com",
  "apiKey": "sk-fallback"
}
```

### Monitoring and Debugging

Enable verbose logging to monitor load balancer behavior:

```bash
start-claude --balance --verbose
```

## Best Practices

1. **API Key Management**: Use separate API keys for different endpoints to isolate rate limits
2. **Geographic Distribution**: Consider using endpoints in different regions for better latency
3. **Capacity Planning**: Ensure backup endpoints can handle the full load
4. **Monitoring**: Set up monitoring for the load balancer proxy server
5. **Health Checks**: Ensure all endpoints use compatible Claude API versions
6. **Priority Ordering**: Set appropriate priority levels based on endpoint reliability and cost

## Troubleshooting

### No Healthy Endpoints

If all endpoints are unhealthy:

1. **Check API keys**: Verify all API keys are valid and have proper permissions
2. **Verify base URLs**: Ensure all base URLs are correct and accessible
3. **Network connectivity**: Check if endpoints are reachable from your network
4. **Rate limits**: Check if you've exceeded API rate limits

### Load Balancer Won't Start

Common issues:

- **Port conflict**: Another service is using port 2333
- **No valid configs**: No configurations have both `baseUrl` and `apiKey`
- **Invalid configurations**: Check configuration syntax and required fields

### Performance Issues

To improve performance:

- **Reduce health check frequency** (code modification required)
- **Use faster endpoints** for health checks
- **Optimize endpoint priority** order based on response times
- **Monitor endpoint latency** and adjust configuration accordingly

## Integration Examples

### With Docker

```dockerfile
# Dockerfile
FROM node:18-alpine
RUN pnpm add -g start-claude
COPY config.json /root/.start-claude/config.json
EXPOSE 2333
CMD ["start-claude", "--balance"]
```

### With Process Managers

```bash
# PM2 configuration
pm2 start "start-claude --balance" --name claude-loadbalancer

# systemd service
[Unit]
Description=Claude Load Balancer
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/start-claude --balance
Restart=always
User=claude
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
