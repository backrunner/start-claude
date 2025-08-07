# Quick Start Guide

**🚀 No setup required!** You can start using start-claude immediately:

## Immediate Usage (No Config Required)

```bash
# Start Claude Code directly with CLI overrides (no config needed)
start-claude --api-key sk-your-key --model claude-3-sonnet

# Use the short command alias
sc --api-key sk-your-key --model claude-3-sonnet

# Set environment variables on the fly
start-claude -e DEBUG=1 -e NODE_ENV=production --verbose

# Override base URL for custom endpoints
start-claude --base-url https://custom.api.com --model claude-3-opus
```

## Setting Up Persistent Configurations

**📚 For persistent configurations:**

### 1. First Time Setup

Run `start-claude` and follow the interactive setup to create your first configuration.

### 2. Add a Configuration

```bash
start-claude add
# Or use editor mode
start-claude add -e
```

### 3. Use a Specific Configuration

```bash
start-claude myconfig
# Or
start-claude --config myconfig
```

### 4. List All Configurations

```bash
start-claude list
```

## Basic Commands

- `start-claude` or `sc` - Start with default config or directly without config
- `start-claude <config>` or `sc <config>` - Start with a specific configuration
- `start-claude --config <name>` - Start with a specific configuration
- `start-claude --list` - List all configurations
- `start-claude add` - Add a new configuration
- `start-claude edit <name>` - Edit an existing configuration
- `start-claude remove <name>` - Remove a configuration
- `start-claude default <name>` - Set a configuration as default

**💡 Pro Tip**: Use `sc` as a short alias for `start-claude` to save typing!

## CLI Override Examples

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

## Priority Order (highest to lowest)

1. CLI overrides (`--api-key`, `--model`, `--base-url`, `-e`)
2. Configuration file settings
3. System environment variables

**Need help?** Run `start-claude --help` to see all available options.
