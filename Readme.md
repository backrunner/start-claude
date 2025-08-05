# Start Claude

A powerful CLI tool to manage and start Claude Code with different configurations. Easily manage multiple Claude configurations, sync them across devices with S3, and switch between them with a beautiful, interactive interface.

## Features

- 🚀 **Easy Configuration Management**: Add, edit, remove, and list Claude configurations
- 🔧 **Environment Variable Support**: Full support for all 35+ Claude Code environment variables
- ⚡ **CLI Overrides**: Override API key, model, base URL, and set custom environment variables directly from command line
- 🆔 **No Config Required**: Run Claude Code directly without any configuration setup
- 🎯 **Default Configuration**: Set a default configuration for quick startup
- 📦 **Auto-Install**: Automatically detect and install Claude Code CLI if missing
- ☁️ **S3 Sync**: Sync configurations across devices using Amazon S3
- 📝 **Editor Mode**: Edit configurations in your preferred editor (VS Code, Cursor, etc.)
- 🎨 **Beautiful Interface**: Colorful, user-friendly command-line interface
- ⚡ **Quick Commands**: Use shortcuts and positional arguments for fast switching
- 🔒 **Permission Modes**: Configure Claude's permission behavior per configuration

## Installation

### From npm (Recommended)

```bash
npm install -g start-claude
```

### From Source

```bash
git clone https://github.com/your-username/start-claude.git
cd start-claude
npm install
npm run build
npm link
```

## Quick Start

**🚀 No setup required!** You can start using start-claude immediately:

```bash
# Start Claude Code directly with CLI overrides (no config needed)
start-claude --api-key sk-your-key --model claude-3-sonnet

# Set environment variables on the fly
start-claude -e DEBUG=1 -e NODE_ENV=production --verbose

# Override base URL for custom endpoints
start-claude --base-url https://custom.api.com --model claude-3-opus
```

**📚 For persistent configurations:**

1. **First time setup**: Run `start-claude` and follow the interactive setup to create your first configuration.

2. **Add a configuration**:

   ```bash
   start-claude add
   # Or use editor mode
   start-claude add -e
   ```

3. **Use a specific configuration**:

   ```bash
   start-claude myconfig
   # Or
   start-claude --config myconfig
   ```

4. **List all configurations**:
   ```bash
   start-claude list
   ```

## Usage

### Basic Commands

- `start-claude` - Start with default config or directly without config
- `start-claude <config>` - Start with a specific configuration
- `start-claude --config <name>` - Start with a specific configuration
- `start-claude --list` - List all configurations
- `start-claude add` - Add a new configuration
- `start-claude add -e` - Add configuration in editor
- `start-claude edit <name>` - Edit an existing configuration
- `start-claude edit <name> -e` - Edit configuration in editor
- `start-claude remove <name>` - Remove a configuration
- `start-claude default <name>` - Set a configuration as default
- `start-claude override` - Manage Claude command override settings

### CLI Overrides

**⚡ Override settings without modifying configurations:**

```bash
# Override API settings for a single session
start-claude --api-key sk-new-key --model claude-3-opus --base-url https://custom.api.com

# Set environment variables on the fly
start-claude -e DEBUG=1 -e CUSTOM_VAR=value myconfig

# Combine config with overrides
start-claude production --model claude-3-haiku --verbose

# Use overrides without any config
start-claude --api-key sk-key --model claude-3-sonnet --max-turns 5
```

**Available CLI Override Options:**

- `-e, --env <key=value>` - Set environment variable (can be used multiple times)
- `--api-key <key>` - Override `ANTHROPIC_API_KEY` for this session
- `--model <model>` - Override `ANTHROPIC_MODEL` for this session
- `--base-url <url>` - Override `ANTHROPIC_BASE_URL` for this session

**Environment Variable Examples:**

```bash
# Database and service configuration
start-claude -e DATABASE_URL=postgres://localhost:5432/db -e REDIS_URL=redis://localhost:6379

# Debug and development settings
start-claude -e DEBUG=1 -e NODE_ENV=development -e LOG_LEVEL=verbose

# Custom API settings
start-claude -e CUSTOM_TIMEOUT=30000 -e MAX_RETRIES=3
```

**Priority Order (highest to lowest):**

1. CLI overrides (`--api-key`, `--model`, `--base-url`, `-e`)
2. Configuration file settings
3. System environment variables

**Need help?** Run `start-claude --help` to see all available options.

### S3 Sync Commands

- `start-claude s3-setup` - Setup S3 synchronization
- `start-claude s3-sync` - Sync local configurations to S3
- `start-claude s3-upload` - Upload configurations to S3
- `start-claude s3-download` - Download configurations from S3
- `start-claude s3-download -f` - Force download (overwrite local)
- `start-claude s3-status` - Show S3 sync status

### Configuration Options

Each configuration supports all Claude Code environment variables:

#### **Basic Settings**

- **Name**: Unique identifier for the configuration
- **Base URL**: Custom API endpoint (`ANTHROPIC_BASE_URL`)
- **API Key**: Your Claude API key (`ANTHROPIC_API_KEY`)
- **Model**: The Claude model to use (`ANTHROPIC_MODEL`)
- **Permission Mode**: Configure permission behavior (`default`, `acceptEdits`, `plan`, `bypassPermissions`)

#### **Authentication & API**

- **Auth Token**: Custom authorization token (`ANTHROPIC_AUTH_TOKEN`)
- **Custom Headers**: Custom HTTP headers (`ANTHROPIC_CUSTOM_HEADERS`)

#### **AWS/Bedrock Configuration**

- **AWS Bearer Token**: Bedrock API authentication (`AWS_BEARER_TOKEN_BEDROCK`)
- **Use Bedrock**: Enable Bedrock integration (`CLAUDE_CODE_USE_BEDROCK`)
- **Skip Bedrock Auth**: Skip AWS authentication (`CLAUDE_CODE_SKIP_BEDROCK_AUTH`)

#### **Google Vertex AI**

- **Use Vertex**: Enable Vertex AI integration (`CLAUDE_CODE_USE_VERTEX`)
- **Skip Vertex Auth**: Skip Google authentication (`CLAUDE_CODE_SKIP_VERTEX_AUTH`)
- **Vertex Regions**: Custom regions for different Claude models

#### **Performance & Limits**

- **Bash Timeouts**: Configure command execution timeouts
- **Max Output Tokens**: Set token limits for responses
- **Max Thinking Tokens**: Configure reasoning token budget
- **MCP Settings**: Configure Model Context Protocol timeouts

#### **Behavior Controls**

- **Disable Features**: Turn off autoupdate, telemetry, error reporting, etc.
- **Terminal Settings**: Configure terminal title updates
- **Project Directory**: Maintain working directory for bash commands

#### **Network Configuration**

- **HTTP/HTTPS Proxy**: Configure proxy servers

### Examples

**Quick start without any configuration:**

```bash
# Start immediately with API key and model
start-claude --api-key sk-ant-your-key --model claude-3-sonnet

# Add environment variables and Claude options
start-claude --api-key sk-key --model claude-3-opus -e DEBUG=1 --verbose --max-turns 10

# Use custom endpoint
start-claude --base-url https://custom.anthropic.com --api-key sk-key --model claude-3-haiku
```

**Create a production configuration:**

```bash
start-claude add
# Follow prompts:
# Name: production
# Base URL: https://api.anthropic.com
# API Key: your-production-key
# Model: claude-sonnet-4-20250514
# Permission mode: Default
# Set as default: Yes
```

**Create configuration in editor:**

```bash
start-claude add -e
# Opens your preferred editor with a JSON template
# Fill in all the configuration options
# Save and close to create the configuration
```

**Override settings for specific sessions:**

```bash
# Use production config but with different model
start-claude production --model claude-3-haiku

# Use development config with custom environment variables
start-claude development -e NODE_ENV=staging -e LOG_LEVEL=debug

# Override multiple settings at once
start-claude myconfig --api-key sk-temp-key --model claude-3-opus --base-url https://test.api.com
```

**Switch to development:**

```bash
start-claude development
```

**Pass Claude Code flags:**

```bash
start-claude production --verbose --max-turns 10 --model claude-haiku-3
```

## S3 Sync Setup

Synchronize your configurations across multiple devices using Amazon S3 or any S3-compatible storage service:

### Supported Storage Services

- **Amazon S3** - AWS's native object storage
- **Cloudflare R2** - Zero-egress storage with S3 compatibility
- **Backblaze B2** - Cost-effective cloud storage via S3-compatible API
- **Any S3-compatible service** - Custom endpoints supported

```bash
# Setup S3/S3-compatible sync (interactive)
start-claude s3-setup

# Upload local configs to storage
start-claude s3-upload

# Download configs from storage
start-claude s3-download

# Check sync status
start-claude s3-status
```

**Setup Flow:**

1. **Service Selection**: Choose from Amazon S3, Cloudflare R2, Backblaze B2, or custom S3-compatible service
2. **Credentials Setup**: Prompts for service-specific credentials and configuration
3. **Connection Test**: Automatically tests connection and checks for existing remote configurations
4. **Conflict Resolution**: Handles conflicts intelligently (local vs remote configs)
5. **Auto-Download**: Automatically downloads remote configs if no local ones exist

### Service-Specific Setup Examples

#### Cloudflare R2

```bash
start-claude s3-setup
# Select: Cloudflare R2
# Bucket name: my-claude-configs
# Cloudflare Account ID: your-account-id
# R2 Token: your-r2-token
# R2 Secret: your-r2-secret
# Custom endpoint: https://your-account-id.r2.cloudflarestorage.com
```

#### Backblaze B2

```bash
start-claude s3-setup
# Select: Backblaze B2
# Bucket name: my-claude-configs
# Region: us-west-004
# Application Key ID: your-key-id
# Application Key: your-application-key
# Custom endpoint: https://s3.us-west-004.backblazeb2.com
```

#### Custom S3-Compatible Service

```bash
start-claude s3-setup
# Select: Other S3-compatible service
# Bucket name: my-claude-configs
# Region: your-region
# Access Key ID: your-access-key
# Secret Access Key: your-secret
# Custom endpoint: https://your-s3-compatible-endpoint.com
```

## Editor Mode

Use your preferred editor to manage configurations:

**Supported Editors:**

- VS Code (`code`)
- Cursor (`cursor`)
- Windsurf (`windsurf`)
- Trae (`trae`)
- System default editors (Notepad on Windows, etc.)

```bash
# Edit configuration in editor
start-claude edit myconfig -e

# Add new configuration in editor
start-claude add -e
```

The editor opens a JSON file with your complete configuration, including all environment variables.

## Claude Command Override

You can optionally set up `start-claude` to override the `claude` command:

```bash
start-claude override
# Choose "Enable Claude command override"
```

This allows you to use `claude` instead of `start-claude` while maintaining all the configuration management features.

## Auto-Installation

If Claude Code CLI is not installed, `start-claude` will:

1. Detect that Claude Code is missing
2. Ask: "Claude Code CLI is not installed. Would you like to install it automatically?"
3. Install via `npm install -g @anthropic-ai/claude-code`
4. Automatically start Claude with your configuration

**No more manual installation steps!**

## Configuration Storage

Configurations are stored in `~/.start-claude/config.json`:

```json
{
  "configs": [
    {
      "name": "production",
      "apiKey": "sk-ant-...",
      "model": "claude-sonnet-4-20250514",
      "permissionMode": "default",
      "isDefault": true,
      "useBedrock": false,
      "disableTelemetry": true
    }
  ],
  "settings": {
    "overrideClaudeCommand": false,
    "s3Sync": {
      "bucket": "my-claude-configs",
      "region": "us-east-1",
      "key": "start-claude-config.json"
    }
  }
}
```

## Claude Code Documentation

For complete information about Claude Code CLI, visit the official documentation:

**📖 [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)**

## Development

### Prerequisites

- Node.js 18+
- npm (for installation and Claude Code CLI)

### Setup

```bash
git clone https://github.com/your-username/start-claude.git
cd start-claude
npm install
```

### Available Scripts

- `npm run build` - Build the project
- `npm run watch` - Build and watch for changes
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix linting issues
- `npm test` - Run tests
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Run tests with coverage

### Testing

The project uses Vitest for testing:

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Project Structure

```
src/
├── types.ts          # TypeScript type definitions
├── config.ts         # Configuration management logic
├── config.test.ts    # Configuration tests
├── claude.ts         # Claude CLI integration & auto-install
├── detection.ts      # Claude installation detection
├── s3-sync.ts        # S3 synchronization functionality
├── editor.ts         # Editor integration
├── ui.ts             # User interface utilities
└── main.ts           # Main CLI application
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for your changes
5. Run tests: `npm test`
6. Run linting: `npm run lint:fix`
7. Commit your changes: `git commit -m 'Add amazing feature'`
8. Push to the branch: `git push origin feature/amazing-feature`
9. Open a Pull Request

## License

MIT License
