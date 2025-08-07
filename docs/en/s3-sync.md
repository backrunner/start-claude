# S3 Sync Guide

Synchronize your configurations across multiple devices using Amazon S3 or any S3-compatible storage service.

## Supported Storage Services

- **Amazon S3** - AWS's native object storage
- **Cloudflare R2** - Zero-egress storage with S3 compatibility
- **Backblaze B2** - Cost-effective cloud storage via S3-compatible API
- **Any S3-compatible service** - Custom endpoints supported

## Quick Setup

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

## Setup Flow

1. **Service Selection**: Choose from Amazon S3, Cloudflare R2, Backblaze B2, or custom S3-compatible service
2. **Credentials Setup**: Prompts for service-specific credentials and configuration
3. **Connection Test**: Automatically tests connection and checks for existing remote configurations
4. **Conflict Resolution**: Handles conflicts intelligently (local vs remote configs)
5. **Auto-Download**: Automatically downloads remote configs if no local ones exist

## Service-Specific Setup Examples

### Amazon S3

```bash
start-claude s3-setup
# Select: Amazon S3
# Bucket name: my-claude-configs
# AWS Region: us-east-1
# AWS Access Key ID: your-access-key
# AWS Secret Access Key: your-secret-key
# File path in bucket: start-claude-config.json
```

### Cloudflare R2

```bash
start-claude s3-setup
# Select: Cloudflare R2
# Bucket name: my-claude-configs
# AWS Region: us-east-1
# R2 Token (Access Key ID): your-r2-token
# R2 Secret: your-r2-secret
# R2 Endpoint URL: https://abc123.r2.cloudflarestorage.com
# File path in bucket: start-claude-config.json
```

### Backblaze B2

```bash
start-claude s3-setup
# Select: Backblaze B2
# Bucket name: my-claude-configs
# Region: us-west-004
# Application Key ID: your-key-id
# Application Key: your-application-key
# B2 Endpoint URL: https://s3.us-west-004.backblazeb2.com
# File path in bucket: start-claude-config.json
```

### Custom S3-Compatible Service

```bash
start-claude s3-setup
# Select: Other S3-compatible service
# Bucket name: my-claude-configs
# Region: your-region
# Access Key ID: your-access-key
# Secret Access Key: your-secret
# Custom endpoint URL: https://your-s3-compatible-endpoint.com
# File path in bucket: start-claude-config.json
```

## Commands

### Setup and Configuration

- `start-claude s3-setup` - Interactive setup for S3 synchronization
- `start-claude s3-status` - Show current S3 sync status and configuration

### Synchronization Commands

- `start-claude s3-sync` - Bidirectional sync (upload and download as needed)
- `start-claude s3-upload` - Upload local configurations to remote storage
- `start-claude s3-download` - Download configurations from remote storage
- `start-claude s3-download -f` - Force download (overwrite local configurations)

## How It Works

### Upload Process

1. Reads local configurations from `~/.start-claude/config.json`
2. Uploads the entire configuration file to your specified S3 bucket
3. Preserves all settings including configurations and sync settings

### Download Process

1. Connects to your S3 bucket using stored credentials
2. Downloads the remote configuration file
3. Merges or replaces local configurations based on your choice
4. Preserves local S3 sync settings

### Sync Process

The sync command intelligently handles conflicts:

- **No local configs**: Automatically downloads remote configurations
- **No remote configs**: Uploads local configurations
- **Both exist**: Prompts for conflict resolution (upload, download, or cancel)

## Security Considerations

- **Credentials**: S3 credentials are stored locally in `~/.start-claude/config.json`
- **Encryption**: Configurations are stored in plain text - ensure your S3 bucket has appropriate access controls
- **API Keys**: Your Claude API keys are included in synced configurations - protect your S3 bucket accordingly

## Best Practices

1. **Private Buckets**: Always use private S3 buckets for storing configurations
2. **Least Privilege**: Create S3 credentials with minimal required permissions
3. **Regular Backups**: Your S3 bucket serves as a backup - consider versioning
4. **Team Sharing**: Use separate buckets/paths for different teams or environments

## Troubleshooting

### Connection Issues

```bash
# Check S3 status and connection
start-claude s3-status

# Re-run setup to fix credentials
start-claude s3-setup
```

### Permission Errors

Ensure your S3 credentials have the following permissions:

- `s3:GetObject`
- `s3:PutObject`
- `s3:ListBucket` (optional, for better error messages)

### Sync Conflicts

If you encounter sync conflicts:

1. Use `start-claude s3-download -f` to force download remote configs
2. Or use `start-claude s3-upload` to force upload local configs
3. Or manually resolve conflicts by editing configurations

## Configuration Storage in S3

The uploaded configuration file maintains the same format as your local `config.json`:

```json
{
  "configs": [
    {
      "name": "production",
      "profileType": "default",
      "apiKey": "sk-ant-...",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-20250514",
      "isDefault": true
    }
  ],
  "settings": {
    "overrideClaudeCommand": false
  }
}
```

Note: S3 sync settings are not uploaded to prevent recursive configuration issues.
