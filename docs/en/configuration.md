# Configuration Guide

## Configuration Options

Each configuration supports all Claude Code environment variables and custom settings for different profile types.

## Profile Types

### Default Profile (`profileType: "default"`)

Traditional custom API configuration:

- Requires manual API key and base URL configuration
- Full control over API endpoints and authentication
- Suitable for custom Claude API setups

### Official Profile (`profileType: "official"`)

Official Claude login with proxy support:

- Uses official Claude authentication (no manual API key needed)
- Supports HTTP/HTTPS proxy configuration for network restrictions
- Ideal for users who want to use official Claude with proxy support

## Basic Settings

- **Name**: Unique identifier for the configuration
- **Profile Type**: Configuration type (`default` or `official`)
- **Base URL**: Custom API endpoint (`ANTHROPIC_BASE_URL`) - for `default` profile type
- **API Key**: Your Claude API key (`ANTHROPIC_API_KEY`) - for `default` profile type
- **Model**: The Claude model to use (`ANTHROPIC_MODEL`)
- **Permission Mode**: Configure permission behavior (`default`, `acceptEdits`, `plan`, `bypassPermissions`)
- **Order**: Priority order for load balancing (lower numbers = higher priority)

## Advanced Configuration Options

### System Settings

Configure global system behavior via web interface (`start-claude manager`) or by editing system settings file:

#### Balance Mode Settings

Control default load balancing behavior:

- **Enable by Default**: Automatically start in balance mode for all commands

  ```json
  {
    "balanceMode": {
      "enableByDefault": true
    }
  }
  ```

- **Load Balancer Strategy**: Choose how requests are distributed across endpoints

  ```json
  {
    "balanceMode": {
      "strategy": "Speed First" // "Fallback", "Polling", or "Speed First"
    }
  }
  ```

- **Speed First Configuration**: Settings for performance-based routing

  ```json
  {
    "balanceMode": {
      "strategy": "Speed First",
      "speedFirst": {
        "responseTimeWindowMs": 300000, // Time window for averaging (5 minutes)
        "minSamples": 2 // Minimum samples before speed routing
      }
    }
  }
  ```

- **Health Check Settings**: Configure endpoint health monitoring

  ```json
  {
    "balanceMode": {
      "healthCheck": {
        "enabled": true,
        "intervalMs": 30000 // Check every 30 seconds (10s - 5min)
      }
    }
  }
  ```

- **Failed Endpoint Handling**: Configure banning of failed endpoints

  ```json
  {
    "balanceMode": {
      "failedEndpoint": {
        "banDurationSeconds": 300 // Ban for 5 minutes (1min - 1hour)
      }
    }
  }
  ```

#### S3 Sync Settings

Configure automatic synchronization behavior:

- **Auto Upload**: Automatically upload configurations when changed

  ```json
  {
    "s3Sync": {
      "autoUpload": true
    }
  }
  ```

- **Auto Download**: Download configurations when manager starts

  ```json
  {
    "s3Sync": {
      "autoDownload": true
    }
  }
  ```

- **Conflict Resolution**: How to handle sync conflicts
  ```json
  {
    "s3Sync": {
      "conflictResolution": "prompt" // "local", "remote", or "prompt"
    }
  }
  ```

#### Command Override Settings

Control shell command alias behavior:

- **Override Status**: Current command override state
- **Shell Detection**: Automatically detected shell and configuration file
- **Supported Shells**: List of shells that support override functionality

Access system settings via:

```bash
# Web interface (recommended)
start-claude manager  # Go to Settings tab

# Direct file editing
~/.start-claude/system-settings.json
```

### Authentication & API

- **Auth Token**: Custom authorization token (`ANTHROPIC_AUTH_TOKEN`)
- **Custom Headers**: Custom HTTP headers (`ANTHROPIC_CUSTOM_HEADERS`)

### AWS/Bedrock Configuration

- **AWS Bearer Token**: Bedrock API authentication (`AWS_BEARER_TOKEN_BEDROCK`)
- **Use Bedrock**: Enable Bedrock integration (`CLAUDE_CODE_USE_BEDROCK`)
- **Skip Bedrock Auth**: Skip AWS authentication (`CLAUDE_CODE_SKIP_BEDROCK_AUTH`)

### Google Vertex AI

- **Use Vertex**: Enable Vertex AI integration (`CLAUDE_CODE_USE_VERTEX`)
- **Skip Vertex Auth**: Skip Google authentication (`CLAUDE_CODE_SKIP_VERTEX_AUTH`)
- **Vertex Regions**: Custom regions for different Claude models

### Performance & Limits

- **Bash Timeouts**: Configure command execution timeouts
- **Max Output Tokens**: Set token limits for responses
- **Max Thinking Tokens**: Configure reasoning token budget
- **MCP Settings**: Configure Model Context Protocol timeouts

### Behavior Controls

- **Disable Features**: Turn off autoupdate, telemetry, error reporting, etc.
- **Terminal Settings**: Configure terminal title updates
- **Project Directory**: Maintain working directory for bash commands

### Network Configuration

- **HTTP/HTTPS Proxy**: Configure proxy servers

## Configuration Examples

### Default Profile Configuration

```bash
start-claude add
# Follow prompts:
# Profile type: Default (custom API settings)
# Name: production
# Base URL: https://api.anthropic.com
# API Key: your-production-key
# Model: claude-sonnet-4-20250514
# Permission mode: Default
# Set as default: Yes
```

### Official Profile Configuration

```bash
start-claude add
# Follow prompts:
# Profile type: Official (use official Claude login with proxy support)
# Name: work-proxy
# HTTP Proxy: http://proxy.company.com:8080
# HTTPS Proxy: https://proxy.company.com:8080
# Model: claude-3-sonnet
# Permission mode: Default
# Set as default: No
```

## Editor Mode Configuration

Create and edit configurations in your preferred editor:

```bash
start-claude add -e
# Opens your preferred editor with a JSON template
# Fill in all the configuration options
# Save and close to create the configuration

start-claude edit myconfig -e
# Edit existing configuration in editor

start-claude edit-config
# Edit the entire configuration file directly
```

## Configuration Storage

Configurations are stored in `~/.start-claude/config.json`:

```json
{
  "configs": [
    {
      "name": "production",
      "profileType": "default",
      "apiKey": "sk-ant-...",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-20250514",
      "permissionMode": "default",
      "isDefault": true,
      "order": 0,
      "useBedrock": false,
      "disableTelemetry": true
    },
    {
      "name": "work-proxy",
      "profileType": "official",
      "httpProxy": "http://proxy.company.com:8080",
      "httpsProxy": "https://proxy.company.com:8080",
      "model": "claude-3-sonnet",
      "permissionMode": "default",
      "order": 10,
      "isDefault": false
    }
  ],
  "settings": {
    "overrideClaudeCommand": false,
    "balanceMode": {
      "enableByDefault": true,
      "strategy": "Speed First",
      "healthCheck": {
        "enabled": true,
        "intervalMs": 30000
      },
      "failedEndpoint": {
        "banDurationSeconds": 300
      },
      "speedFirst": {
        "responseTimeWindowMs": 300000,
        "minSamples": 2
      }
    },
    "s3Sync": {
      "bucket": "my-claude-configs",
      "region": "us-east-1",
      "key": "start-claude-config.json"
    }
  }
}
```

## Load Balancing with Order Field

The `order` field allows you to set priority for configurations when using the load balancer:

- **Lower numbers = Higher priority** (0 = highest priority)
- **Undefined order** is treated as 0 (highest priority)
- Configs are sorted by order before load balancing begins

```json
{
  "name": "primary-api",
  "order": 0,  // Highest priority
  "baseUrl": "https://primary.api.com",
  "apiKey": "sk-primary"
},
{
  "name": "backup-api",
  "order": 10,  // Lower priority
  "baseUrl": "https://backup.api.com",
  "apiKey": "sk-backup"
}
```

## CLI Overrides

Override any configuration setting for a single session without modifying the saved configuration:

```bash
# Override API settings
start-claude myconfig --api-key sk-temp-key --model claude-3-opus

# Set environment variables
start-claude myconfig -e NODE_ENV=staging -e LOG_LEVEL=debug

# Override multiple settings
start-claude myconfig --api-key sk-temp --model claude-3-opus --base-url https://test.api.com
```
