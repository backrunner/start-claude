# Quick Start Guide

**🚀 No setup required!** You can start using start-claude immediately:

## Immediate Usage (No Config Required)

```bash
# Start Claude Code directly with CLI overrides (no config needed)
start-claude --api-key sk-your-key --model claude-sonnet-4-5-20250929

# Use the short command alias (may not work on Windows - see Windows warning in README)
scc --api-key sk-your-key --model claude-sonnet-4-5-20250929

# Windows users: Enable override for better compatibility
start-claude override --enable

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

- `start-claude` - Start with default config or directly without config
- `start-claude <config>` - Start with a specific configuration
- `start-claude manager` - Open modern web-based configuration manager
- `start-claude --config <name>` - Start with a specific configuration
- `start-claude --list` - List all configurations
- `start-claude add` - Add a new configuration
- `start-claude edit <name>` - Edit an existing configuration
- `start-claude remove <name>` - Remove a configuration
- `start-claude default <name>` - Set a configuration as default

**💡 Pro Tip**: Windows users should use `start-claude override --enable` for the best experience, as the `sc` alias may conflict with system commands!

## Modern Web Interface

Access the beautiful, modern configuration manager:

```bash
# Launch the web interface
start-claude manager
# Opens at http://localhost:3000 with your configurations
```

Features:

- 🎨 Modern gradient-based UI with dark mode support
- 🔍 Real-time search and filtering
- 📱 Drag-and-drop configuration reordering
- ⚙️ Centralized system settings
- ✅ Real-time validation with detailed error messages

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
start-claude --api-key sk-key --model claude-sonnet-4-5-20250929 --max-turns 5
```

## Priority Order (highest to lowest)

1. CLI overrides (`--api-key`, `--model`, `--base-url`, `-e`)
2. Configuration file settings
3. System environment variables

**Need help?** Run `start-claude --help` to see all available options.
