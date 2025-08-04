# Start Claude

A friendly CLI tool to start Claude Code with different environment configurations. Easily manage multiple Claude configurations and switch between them with a beautiful, interactive interface.

## Features

- 🚀 **Easy Configuration Management**: Add, edit, remove, and list Claude configurations
- 🔧 **Environment Switching**: Quickly switch between different API endpoints and keys
- 🎯 **Default Configuration**: Set a default configuration for quick startup
- 📦 **Auto-Install**: Automatically detect and install Claude Code CLI if missing
- 🎨 **Beautiful Interface**: Colorful, user-friendly command-line interface
- ⚡ **Quick Commands**: Use shortcuts like `-c config-name` for fast switching

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

1. **First time setup**: Just run `start-claude` and follow the interactive setup to create your first configuration.

2. **Add a configuration**:
   ```bash
   start-claude add
   ```

3. **Use a specific configuration**:
   ```bash
   start-claude -c my-config
   ```

4. **List all configurations**:
   ```bash
   start-claude list
   ```

## Usage

### Basic Commands

- `start-claude` - Start with default config or choose from available configs
- `start-claude -c <name>` - Start with a specific configuration
- `start-claude --list` - List all configurations
- `start-claude add` - Add a new configuration
- `start-claude edit <name>` - Edit an existing configuration
- `start-claude remove <name>` - Remove a configuration
- `start-claude default <name>` - Set a configuration as default
- `start-claude override` - Manage Claude command override settings

### Configuration Options

Each configuration can include:
- **Name**: Unique identifier for the configuration
- **Description**: Optional description for easy identification
- **Base URL**: Custom API endpoint (ANTHROPIC_BASE_URL)
- **API Key**: Your Claude API key (ANTHROPIC_API_KEY)
- **Model**: The Claude model to use (ANTHROPIC_MODEL, defaults to claude-sonnet-4-20250514)
- **Default**: Mark as default configuration

### Examples

**Create a production configuration:**
```bash
start-claude add
# Follow prompts:
# Name: production
# Description: Production environment
# Base URL: https://api.anthropic.com
# API Key: your-production-key
# Model: claude-sonnet-4-20250514
# Set as default: Yes
```

**Create a development configuration:**
```bash
start-claude add
# Follow prompts:
# Name: development
# Description: Development environment
# Base URL: https://dev-api.anthropic.com
# API Key: your-dev-key
# Model: claude-sonnet-4-20250514
# Set as default: No
```

**Switch to development:**
```bash
start-claude -c development
```

**List all configurations:**
```bash
start-claude list
# Output:
# 📋 production (default) - Production environment
#    Base URL: https://api.anthropic.com
#    API Key: sk-ant-api***
# 
# 📋 development - Development environment
#    Base URL: https://dev-api.anthropic.com
#    API Key: sk-ant-dev***
```

## Claude Command Override

You can optionally set up `start-claude` to override the `claude` command, so typing `claude` will use `start-claude` instead:

```bash
start-claude override
# Choose "Enable Claude command override"
```

This adds an alias to your shell configuration file. To restore the original `claude` command, run the same command and choose "Disable".

## Configuration Storage

Configurations are stored in `~/.start-claude/config.json`. This file contains:
- All your Claude configurations
- Settings like command override preferences

## Auto-Installation

If Claude Code CLI is not installed, `start-claude` will:
1. Detect available package managers (npm, pnpm, yarn, bun)
2. Offer to automatically install Claude Code CLI
3. Guide you through the installation process

## Development

### Prerequisites

- Node.js 18+ 
- npm, pnpm, yarn, or bun

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
- `npm run test:ui` - Run tests with UI
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Run tests with coverage

### Testing

The project uses Vitest for testing. Tests focus on business logic rather than UI:

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Project Structure

```
src/
├── types.ts          # TypeScript type definitions
├── config.ts         # Configuration management logic
├── config.test.ts    # Configuration tests
├── claude.ts         # Claude CLI integration
├── detection.ts      # Claude installation detection
├── detection.test.ts # Detection tests
├── override.ts       # Shell command override logic
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

MIT License - see the [LICENSE](LICENSE) file for details.
