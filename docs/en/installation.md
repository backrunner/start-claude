# Installation Guide

## From pnpm (Recommended)

```bash
pnpm add -g start-claude
```

## From Source

```bash
git clone https://github.com/your-username/start-claude.git
cd start-claude
pnpm install
pnpm run build
npm link
```

## Prerequisites

- Node.js 18+
- pnpm (for installation and Claude Code CLI)

## Auto-Installation Feature

If Claude Code CLI is not installed, `start-claude` will:

1. Detect that Claude Code is missing
2. Ask: "Claude Code CLI is not installed. Would you like to install it automatically?"
3. Install via `pnpm add -g @anthropic-ai/claude-code`
4. Automatically start Claude with your configuration

**No more manual installation steps!**

## Verification

After installation, verify that start-claude is working:

```bash
start-claude --help

# Note: The short alias 'sc' may not work on Windows
# Use override feature for Windows compatibility:
start-claude override --enable
```

## Windows Users - Important

**The `sc` command may conflict with Windows system commands.** For the best Windows experience:

```bash
# Enable override feature (Recommended)
start-claude override --enable

# Alternative: Use full command name
start-claude --api-key sk-your-key

# Create custom alias (PowerShell)
Set-Alias sc start-claude
```

## Troubleshooting

### Permission Issues on Linux/macOS

If you encounter permission errors during global installation:

```bash
# Using pnpm with sudo (not recommended)
sudo pnpm add -g start-claude

# Better: Configure pnpm to use a different directory
mkdir ~/.pnpm-global
pnpm config set global-dir '~/.pnpm-global'
echo 'export PATH=~/.pnpm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
pnpm add -g start-claude
```

### Windows Path Issues

If the command is not recognized after installation:

1. Restart your terminal/command prompt
2. Verify pnpm global directory is in your PATH
3. Run `pnpm config get global-dir` to see the global directory
4. Add that directory to your Windows PATH if necessary

### Update to Latest Version

```bash
pnpm update -g start-claude
```

### Uninstallation

```bash
pnpm remove -g start-claude
```
