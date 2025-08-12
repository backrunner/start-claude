# Start Claude

A powerful CLI tool to manage and start Claude Code with different configurations. Easily manage multiple Claude configurations, sync them across devices with S3, and switch between them with a beautiful, interactive interface.

## ⚠️ Important Notice for Windows Users

**The `sc` command may not work on Windows** due to system command conflicts. Windows reserves `sc` for Service Control operations. If you encounter issues, please use one of these alternatives:

```bash
# Option 1: Use the full command name
start-claude --api-key sk-your-key

# Option 2: Set up command override (Recommended)
start-claude override

# Option 3: Create a custom alias
doskey sc=start-claude $*
```

We recommend using the **override feature** for the best Windows experience.

## Features

- 🚀 **Easy Configuration Management**: Add, edit, remove, and list Claude configurations
- 🔧 **Environment Variable Support**: Full support for all 35+ Claude Code environment variables
- ⚡ **CLI Overrides**: Override API key, model, base URL, and set custom environment variables directly from command line
- 🎯 **Default Configuration**: Set a default configuration for quick startup
- 📦 **Auto-Install**: Automatically detect and install Claude Code CLI if missing
- ☁️ **S3 Sync**: Smart sync across devices with conflict detection and modification time tracking
- 🎨 **Modern Web Interface**: Beautiful, responsive configuration manager with real-time search and drag-and-drop
- ⚖️ **Advanced Load Balancer**: Intelligent load balancing with health monitoring, automatic failover, and configurable settings
- 🔄 **Transformer Support**: Convert between different AI API formats (OpenAI, custom providers)
- 💻 **Command Override**: Windows-compatible shell aliases with dual script + alias approach
- 🌐 **Multi-Provider Support**: Mix and match different AI providers in load balancing

## Quick Start

**🚀 No setup required!** Start using immediately:

```bash
# Install globally
pnpm add -g start-claude

# Start Claude Code directly with CLI overrides (no config needed)
start-claude --api-key sk-your-key --model claude-3-sonnet

# Use the short command alias (may not work on Windows - see warning above)
sc --api-key sk-your-key --model claude-3-sonnet

# Windows users: Enable override for better compatibility
start-claude override

# For persistent configurations, add one interactively
start-claude add

# Open the modern web interface
start-claude manager
```

## Documentation

| 📖 English Documentation                            | 📖 中文文档                                    |
| --------------------------------------------------- | ---------------------------------------------- |
| **[Installation Guide](docs/en/installation.md)**   | **[安装指南](docs/zh/installation.md)**        |
| **[Quick Start Guide](docs/en/quick-start.md)**     | **[快速开始](docs/zh/quick-start.md)**         |
| **[Configuration Guide](docs/en/configuration.md)** | **[配置指南](docs/zh/configuration.md)**       |
| **[CLI Reference](docs/en/cli-reference.md)**       | **[CLI 参考](docs/zh/cli-reference.md)**       |
| **[Web Manager Guide](docs/en/manager.md)**         | **[Web 管理器指南](docs/zh/manager.md)**       |
| **[Transformer Guide](docs/en/transformer.md)**     | **[转换器指南](docs/zh/transformer.md)**       |
| **[Load Balancer Guide](docs/en/load-balancer.md)** | **[负载均衡器指南](docs/zh/load-balancer.md)** |
| **[S3 Sync Guide](docs/en/s3-sync.md)**             | **[S3 同步指南](docs/zh/s3-sync.md)**          |
| **[Development Guide](docs/en/development.md)**     | **[开发指南](docs/zh/development.md)**         |

## Basic Usage

```bash
# Basic commands
start-claude                    # Start with default config
start-claude <config>           # Start with specific config
start-claude list              # List all configurations
start-claude add               # Add new configuration
start-claude edit <name>       # Edit configuration

# Modern Web Interface
start-claude manager          # Open web-based configuration manager

# Advanced Load Balancer with Health Monitoring
start-claude --balance         # Start with system default balance settings
start-claude --balance --verbose  # Enable detailed health check logging

# CLI overrides (no config needed)
start-claude --api-key sk-key --model claude-3-sonnet
start-claude -e DEBUG=1 -e NODE_ENV=prod --verbose

# S3 Sync with Smart Conflict Detection
start-claude s3-setup          # Configure S3 sync with timestamp tracking
start-claude s3-sync           # Smart sync with conflict resolution
start-claude s3-upload --force # Force upload (ignore timestamp warnings)
start-claude s3-download       # Download with timestamp comparison

# Override original claude-code command
start-claude override         # Enable claude command override
start-claude override disable # Disable override
start-claude override status  # Check override status
start-claude override shells  # Show supported shells
```

## Modern Web Interface

Start Claude now includes a beautiful, modern web interface for configuration management:

- **🎨 Modern Design**: Clean, gradient-based UI with dark mode support
- **🔍 Real-time Search**: Instantly filter configurations
- **📱 Drag & Drop**: Reorder configurations with visual feedback
- **⚙️ System Settings**: Centralized balance mode and S3 sync preferences
- **✅ Smart Validation**: Real-time validation with detailed error messages
- **🌓 Dark Mode**: Automatic system theme detection

```bash
# Launch the web interface
start-claude manager
# Opens at http://localhost:3000 with your configurations
```

## Advanced Load Balancer

Enhanced load balancing with intelligent health monitoring:

- **🏥 Health Monitoring**: Configurable health check intervals
- **🚫 Smart Failover**: Automatic endpoint banning with recovery
- **⚙️ System Integration**: Configurable via web interface or system settings
- **📊 Detailed Logging**: Comprehensive health check and failover logs

### Balance Mode Settings

Configure via web interface (`start-claude manager`) or system settings:

- **Enable by Default**: Automatically start in balance mode
- **Health Check Interval**: Customize monitoring frequency (10s - 5min)
- **Failed Endpoint Handling**: Auto-ban duration (1min - 1hour)
- **Disable Health Checks**: Use simple round-robin with endpoint banning
  start-claude -e DEBUG=1 -e NODE_ENV=prod --verbose

# Short alias

sc --api-key sk-key --model claude-3-haiku

````

## Editor Mode

Edit configurations in your preferred editor:

```bash
# Supported editors: VS Code, Cursor, Windsurf, Notepad, etc.
start-claude add -e             # Create config in editor
start-claude edit myconfig -e   # Edit config in editor
start-claude edit-config        # Edit config file directly with live reload
````

## Claude Code Documentation

For complete information about Claude Code CLI:

**📖 [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)**

## Contributing

We welcome contributions! See our [Development Guide](docs/en/development.md) for details on:

- Setting up the development environment
- Running tests
- Code style guidelines
- Submission process

## License

MIT License

---

💡 **Pro Tip**: Windows users should use `start-claude override` for the best experience, as the `sc` alias may conflict with system commands.
