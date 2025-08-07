# Installation Guide

## From npm (Recommended)

```bash
npm install -g start-claude
```

## From Source

```bash
git clone https://github.com/your-username/start-claude.git
cd start-claude
npm install
npm run build
npm link
```

## Prerequisites

- Node.js 18+
- npm (for installation and Claude Code CLI)

## Auto-Installation Feature

If Claude Code CLI is not installed, `start-claude` will:

1. Detect that Claude Code is missing
2. Ask: "Claude Code CLI is not installed. Would you like to install it automatically?"
3. Install via `npm install -g @anthropic-ai/claude-code`
4. Automatically start Claude with your configuration

**No more manual installation steps!**

## Verification

After installation, verify that start-claude is working:

```bash
start-claude --help
# or use the short alias
sc --help
```

## Troubleshooting

### Permission Issues on Linux/macOS

If you encounter permission errors during global installation:

```bash
# Using npm with sudo (not recommended)
sudo npm install -g start-claude

# Better: Configure npm to use a different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g start-claude
```

### Windows Path Issues

If the command is not recognized after installation:

1. Restart your terminal/command prompt
2. Verify npm global directory is in your PATH
3. Run `npm config get prefix` to see the global directory
4. Add that directory to your Windows PATH if necessary

### Update to Latest Version

```bash
npm update -g start-claude
```

### Uninstallation

```bash
npm uninstall -g start-claude
```
