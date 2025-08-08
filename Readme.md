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
- ⚖️ **Load Balancer**: Distribute requests across multiple endpoints with automatic failover
- 🎨 **Beautiful Interface**: Colorful, user-friendly command-line interface
- ⚡ **Quick Commands**: Use shortcuts and positional arguments for fast switching
- 🔒 **Permission Modes**: Configure Claude's permission behavior per configuration

## Quick Start

**🚀 No setup required!** Start using immediately:

```bash
# Install globally
pnpm add -g start-claude

# Start Claude Code directly with CLI overrides (no config needed)
start-claude --api-key sk-your-key --model claude-3-sonnet

# Use the short command alias
sc --api-key sk-your-key --model claude-3-sonnet

# For persistent configurations, add one interactively
start-claude add
```

## Documentation

| 📖 Topic                                            | Description                                              |
| --------------------------------------------------- | -------------------------------------------------------- |
| **[Installation Guide](docs/en/installation.md)**   | Installation methods, prerequisites, and troubleshooting |
| **[Quick Start Guide](docs/en/quick-start.md)**     | Get up and running in minutes                            |
| **[Configuration Guide](docs/en/configuration.md)** | Detailed configuration options and examples              |
| **[S3 Sync Guide](docs/en/s3-sync.md)**             | Sync configurations across devices                       |
| **[Load Balancer Guide](docs/en/load-balancer.md)** | High availability with multiple endpoints                |
| **[Development Guide](docs/en/development.md)**     | Contributing and development setup                       |

## 中文文档 (Chinese Documentation)

| 📖 主题                                        | 描述                         |
| ---------------------------------------------- | ---------------------------- |
| **[安装指南](docs/zh/installation.md)**        | 安装方法、前提条件和故障排除 |
| **[快速开始](docs/zh/quick-start.md)**         | 几分钟内快速上手             |
| **[配置指南](docs/zh/configuration.md)**       | 详细的配置选项和示例         |
| **[S3 同步指南](docs/zh/s3-sync.md)**          | 跨设备同步配置               |
| **[负载均衡器指南](docs/zh/load-balancer.md)** | 多端点高可用性               |
| **[开发指南](docs/zh/development.md)**         | 贡献和开发环境设置           |

## Basic Usage

```bash
# Basic commands
start-claude                    # Start with default config
start-claude <config>           # Start with specific config
start-claude list              # List all configurations
start-claude add               # Add new configuration
start-claude edit <name>       # Edit configuration
start-claude --balance         # Start load balancer

# CLI overrides (no config needed)
start-claude --api-key sk-key --model claude-3-sonnet
start-claude -e DEBUG=1 -e NODE_ENV=prod --verbose

# Short alias
sc --api-key sk-key --model claude-3-haiku
```

## Editor Mode

Edit configurations in your preferred editor:

```bash
# Supported editors: VS Code, Cursor, Windsurf, Notepad, etc.
start-claude add -e             # Create config in editor
start-claude edit myconfig -e   # Edit config in editor
start-claude edit-config        # Edit config file directly with live reload
```

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

💡 **Pro Tip**: Use `sc` as a short alias for `start-claude` to save typing!
