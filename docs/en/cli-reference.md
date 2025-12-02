# CLI Reference

Complete command-line interface reference for start-claude with all available commands, options, and usage examples.

## Basic Syntax

```bash
start-claude [options] [command] [arguments]
```

## Global Options

Options that work with most commands:

- `--verbose` - Enable detailed output and logging
- `--debug` - Enable debug mode with extra information
- `--help` - Show help information
- `--version` - Display version information

## Core Commands

### Configuration Management

#### `start-claude` (default command)

Start Claude Code with default or specified configuration.

```bash
start-claude                    # Start with default config
start-claude <config>           # Start with specific config
start-claude --list            # List all configurations
```

**Options:**

- `--config <name>` - Use specific configuration
- `--api-key <key>` - Override API key for this session
- `--base-url <url>` - Override base URL for this session
- `--model <model>` - Override model for this session
- `--balance [strategy]` - Start with load balancing enabled. Optional strategy: `fallback`, `polling`, `speedfirst`
- `-e, --env <key=value>` - Set environment variable
- `--proxy <url>` - Set HTTPS proxy for requests
- `-p, --print` - Print output to stdout
- `--resume` - Resume previous session
- `--continue` - Continue previous session

#### `start-claude add`

Add a new configuration interactively.

```bash
start-claude add               # Interactive configuration creation
start-claude add -e            # Create configuration in editor
```

**Options:**

- `-e, --use-editor` - Create configuration in external editor

#### `start-claude edit <name>`

Edit an existing configuration.

```bash
start-claude edit myconfig     # Edit configuration interactively
start-claude edit myconfig -e  # Edit configuration in editor
```

**Options:**

- `-e, --use-editor` - Edit configuration in external editor

#### `start-claude remove <name>`

Remove a configuration.

```bash
start-claude remove myconfig   # Delete configuration with confirmation
```

#### `start-claude list`

List all available configurations.

```bash
start-claude list             # Show all configurations with details
```

#### `start-claude default <name>`

Set a configuration as the default.

```bash
start-claude default myconfig # Set myconfig as default
```

### Web Interface

#### `start-claude manager`

Launch the web-based configuration manager.

```bash
start-claude manager          # Start on default port (2334)
start-claude manager -p 3000 # Start on custom port
```

**Aliases:**

- `start-claude manage`

**Options:**

- `-p, --port <number>` - Port to run the manager on (default: 2334)

### Command Override System

#### `start-claude override`

Enable command override (creates `claude` alias to `start-claude`).

```bash
start-claude override         # Enable override with dual method:
                             # 1. Creates ~/.start-claude/bin/claude script
                             # 2. Adds PATH export and alias to shell RC files
```

**What it does:**

- Creates executable script at `~/.start-claude/bin/claude`
- Adds `export PATH="$HOME/.start-claude/bin:$PATH"` to shell RC file
- Adds `alias claude="start-claude"` as fallback
- Works across shell restarts and survives start-claude updates

#### `start-claude override disable`

Disable command override.

```bash
start-claude override disable # Removes script directory and cleans RC files
```

#### `start-claude override status`

Check current override status.

```bash
start-claude override status  # Shows:
                             # - Current override status (enabled/disabled)
                             # - Detected shell and platform
                             # - Configuration file path
                             # - Script existence status
```

#### `start-claude override shells`

Show supported shells for override functionality.

```bash
start-claude override shells  # Lists supported shells for current platform
```

**Supported Shells:**

_Unix/Linux/macOS:_

- bash (uses `~/.bashrc`)
- zsh (uses `~/.zshrc`)
- fish (uses `~/.config/fish/config.fish`)

_Windows:_

- PowerShell (uses `~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`)
- Command Prompt (creates batch file)
- Git Bash (uses `~/.bashrc`)

### S3 Synchronization

#### `start-claude s3 setup`

Configure S3 synchronization settings.

```bash
start-claude s3 setup         # Interactive S3 configuration setup
```

#### `start-claude s3 sync`

Synchronize configurations with S3.

```bash
start-claude s3 sync          # Smart bidirectional sync with conflict detection
```

#### `start-claude s3 upload`

Upload local configurations to S3.

```bash
start-claude s3 upload        # Upload with timestamp comparison
start-claude s3 upload -f     # Force upload, ignore remote timestamps
```

**Options:**

- `-f, --force` - Force overwrite remote configurations

#### `start-claude s3 download`

Download configurations from S3.

```bash
start-claude s3 download      # Download with timestamp comparison
start-claude s3 download -f   # Force download, ignore local timestamps
```

**Options:**

- `-f, --force` - Force overwrite local configurations

#### `start-claude s3 status`

Show S3 synchronization status.

```bash
start-claude s3 status        # Shows:
                             # - S3 configuration status
                             # - Last sync timestamps
                             # - Remote vs local modification times
                             # - Conflict detection results
```

### Load Balancing & Proxy

#### `start-claude --balance [strategy]`

Start with load balancing across multiple configurations.

```bash
start-claude --balance                    # Use system default strategy
start-claude --balance fallback          # Priority-based with failover
start-claude --balance polling           # Round-robin across all endpoints
start-claude --balance speedfirst        # Route to fastest endpoint
start-claude --balance config1 config2   # Use specific configurations
start-claude --balance polling --verbose # Enable detailed health monitoring
```

**Load Balancer Strategies:**

- `fallback` - **Priority-based with failover** (default)
  - Respects endpoint `order` field for priority
  - Round-robin within same priority level
  - Falls back to lower priority on failure

- `polling` - **Round-robin distribution**
  - Ignores priority ordering
  - Distributes requests evenly across all healthy endpoints
  - Simple and predictable load distribution

- `speedfirst` - **Performance-based routing**
  - Routes to fastest responding endpoint
  - Measures response time from request to first token
  - Automatically adapts to endpoint performance
  - Requires multiple samples for reliable routing

**Features:**

- Health monitoring with configurable intervals
- Automatic endpoint banning on failure
- Intelligent request distribution based on chosen strategy
- Priority-based failover (for fallback strategy)
- Performance monitoring and adaptation (for speedfirst strategy)
- Transformer support for different API providers

### Configuration File Management

#### `start-claude edit-config`

Edit the configuration file directly with live reload.

```bash
start-claude edit-config      # Opens config file in default editor
                             # Supports live reload during editing
```

**Supported Editors:**

- VS Code (`code`)
- Cursor (`cursor`)
- Windsurf (`windsurf`)
- Notepad (`notepad`)
- System default editor

## Environment Variables

Override configuration with environment variables:

### CLI Override Options

```bash
# API Configuration
export ANTHROPIC_AUTH_TOKEN="sk-your-key"  # Primary API key
export ANTHROPIC_BASE_URL="https://api.anthropic.com"
export ANTHROPIC_MODEL="claude-sonnet-4-5-20250929"

# Proxy Configuration
export HTTPS_PROXY="https://proxy.company.com:8080"
export HTTP_PROXY="http://proxy.company.com:8080"

# Permission Settings
export CLAUDE_CODE_PERMISSION_MODE="acceptEdits"
export CLAUDE_CODE_DANGEROUS_DISABLE_PERMISSIONS="true"

# Debug and Logging
export DEBUG="1"
export CLAUDE_CODE_VERBOSE="1"
```

### Advanced Environment Variables

All Claude Code environment variables are supported:

```bash
# AWS/Bedrock Configuration
export CLAUDE_CODE_USE_BEDROCK="1"
export AWS_BEARER_TOKEN_BEDROCK="token"

# Google Vertex Configuration
export CLAUDE_CODE_USE_VERTEX="1"
export VERTEX_REGION_CLAUDE_3_5_SONNET="us-central1"

# Bash Configuration
export BASH_DEFAULT_TIMEOUT_MS="120000"
export BASH_MAX_TIMEOUT_MS="600000"

# Terminal Settings
export CLAUDE_CODE_DISABLE_TERMINAL_TITLE="1"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"
```

## Usage Examples

### Basic Usage

```bash
# Quick start with CLI overrides (no configuration needed)
start-claude --api-key sk-your-key --model claude-sonnet-4-5-20250929

# Create and use configurations
start-claude add                          # Create config interactively
start-claude myconfig                     # Use specific config
start-claude list                         # View all configs
start-claude default myconfig             # Set as default
start-claude                             # Use default config
```

### Load Balancing Setup

```bash
# Create multiple configurations for load balancing
start-claude add  # primary-api (order: 0)
start-claude add  # backup-api (order: 10)
start-claude add  # fallback-api (order: 20)

# Start with load balancing
start-claude --balance                    # Use all configs
start-claude --balance primary backup     # Use specific configs
start-claude --balance --verbose          # With detailed logging
```

### Multi-Provider Configuration

```bash
# Mix Anthropic and OpenAI providers
start-claude add  # anthropic-official (normal config)
start-claude add  # openai-gpt4 (transformer enabled)

# Load balance across different providers
start-claude --balance anthropic-official openai-gpt4
```

### Windows Compatibility

```bash
# Enable Windows-friendly command override
start-claude override                     # Enable override
claude --api-key sk-key --model claude   # Use short command

# Check override status
start-claude override status              # View current status
start-claude override shells              # Show supported shells

# Disable when no longer needed
start-claude override disable             # Remove override
```

### S3 Synchronization Workflow

```bash
# Initial setup
start-claude s3 setup                     # Configure S3 credentials

# Sync configurations across devices
start-claude s3 sync                      # Smart bidirectional sync
start-claude s3 upload --force            # Force upload local changes
start-claude s3 download                  # Download remote changes
start-claude s3 status                    # Check sync status
```

### Advanced Environment Overrides

```bash
# Complex environment setup
start-claude \
  --api-key sk-custom-key \
  --base-url https://custom-api.com \
  --model claude-3-opus \
  -e DEBUG=1 \
  -e NODE_ENV=production \
  -e CLAUDE_CODE_PERMISSION_MODE=plan \
  --proxy https://proxy.company.com:8080 \
  --verbose
```

### Editor Integration

```bash
# Create configurations in editor
start-claude add -e                       # New config in editor
start-claude edit myconfig -e             # Edit existing in editor
start-claude edit-config                  # Edit config file directly
```

## Exit Codes

start-claude uses standard exit codes:

- `0` - Success
- `1` - General error (configuration not found, invalid options, etc.)
- `2` - Misuse of shell command (invalid arguments)
- `126` - Command cannot execute (permission denied)
- `127` - Command not found (Claude Code CLI not installed)
- `130` - Script terminated by Control-C

## Configuration Files

### Main Configuration

- **Location**: `~/.start-claude/config.json`
- **Format**: JSON with configurations array
- **Backup**: Automatically backed up before changes

### System Settings

- **Location**: `~/.start-claude/system-settings.json`
- **Format**: JSON with global system preferences
- **Scope**: Balance mode, S3 sync, command override settings

### Update Cache

- **Location**: `~/.start-claude/update-check-cache.json`
- **Purpose**: Rate limiting for update checks
- **TTL**: 24 hours

## Tips and Best Practices

1. **Use `--balance` for redundancy** across multiple API providers
2. **Set up S3 sync** for configuration backup and device synchronization
3. **Enable command override on Windows** for better compatibility
4. **Use web manager** for complex configuration management
5. **Test configurations** before adding to load balancer
6. **Set appropriate priorities** with `order` field for failover
7. **Monitor health checks** with `--verbose` flag
8. **Use environment variables** for temporary overrides
9. **Back up configurations** before major changes
10. **Keep API keys secure** and use separate keys for different endpoints

This CLI reference covers all available commands and options in start-claude. For detailed feature guides, see the specific documentation for each component.
