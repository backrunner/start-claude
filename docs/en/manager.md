# Web Configuration Manager Guide

The start-claude web configuration manager provides a modern, intuitive interface for managing Claude configurations, system settings, and monitoring. Access it via `start-claude manager` or `start-claude manage`.

## Features Overview

- 🎨 **Modern Design**: Clean, gradient-based UI with dark mode support
- 🔍 **Real-time Search**: Instantly filter configurations by name, URL, or model
- 📱 **Drag & Drop**: Reorder configurations with visual feedback for load balancing priority
- ⚙️ **System Settings**: Centralized balance mode and S3 sync preferences
- ✅ **Smart Validation**: Real-time validation with detailed error messages
- 🌓 **Dark Mode**: Automatic system theme detection and manual toggle
- 🔄 **Live Updates**: Real-time status monitoring and health checks
- 📊 **Statistics**: Configuration usage and system status overview

## Launching the Manager

```bash
# Start the web interface
start-claude manager

# Custom port
start-claude manager --port 3001

# Alternative command
start-claude manage
```

The interface opens at `http://localhost:2334` (or your specified port).

## Configuration Management

### Adding Configurations

1. **Click "Add Configuration"** button
2. **Fill in details**:
   - **Name**: Unique identifier
   - **Profile Type**: `default` (custom API) or `official` (official Claude)
   - **Base URL**: API endpoint (for default profile)
   - **API Key**: Authentication key
   - **Model**: Claude model to use
   - **Advanced Options**: Additional settings

3. **Advanced Options**:
   - **Transformer Enabled**: Enable format conversion for non-Anthropic APIs
   - **Permission Mode**: Set Claude Code permission behavior
   - **Order**: Priority for load balancing (lower = higher priority)
   - **Proxy Settings**: HTTP/HTTPS proxy configuration

### Editing Configurations

1. **Click configuration card** to expand details
2. **Click "Edit"** button
3. **Modify settings** with real-time validation
4. **Save changes** - automatically syncs if S3 is enabled

### Configuration Cards

Each configuration displays:

- **Name and Profile Type** with visual indicators
- **Status Indicator**: Healthy/Unhealthy/Unknown
- **Primary Details**: Model, URL, key preview
- **Action Buttons**: Edit, Delete, Duplicate, Test
- **Drag Handle**: For reordering (affects load balancing priority)

### Bulk Operations

- **Search and Filter**: Use search bar to filter configurations
- **Select Multiple**: Checkbox selection for bulk actions
- **Bulk Delete**: Remove multiple configurations
- **Export/Import**: JSON export/import functionality

## System Settings

Access system-wide settings via the **Settings** tab or gear icon.

### Balance Mode Settings

Configure default load balancing behavior:

- **Enable by Default**: Automatically start in balance mode

  ```json
  "balanceMode": {
    "enableByDefault": true
  }
  ```

- **Health Check Interval**: Monitoring frequency (10s - 5min)

  ```json
  "healthCheckInterval": 30000
  ```

- **Ban Duration**: Failed endpoint timeout (1min - 1hour)

  ```json
  "banDuration": 300000
  ```

- **Disable Health Checks**: Use simple round-robin only
  ```json
  "disableHealthChecks": true
  ```

### S3 Sync Settings

Configure automatic synchronization:

- **Auto Upload**: Upload configs when changed

  ```json
  "s3Sync": {
    "autoUpload": true
  }
  ```

- **Auto Download**: Download on manager startup

  ```json
  "s3Sync": {
    "autoDownload": true
  }
  ```

- **Conflict Resolution**: Handle sync conflicts
  - `local`: Keep local changes
  - `remote`: Use remote changes
  - `prompt`: Ask user each time

### Command Override Settings

Manage shell command aliases:

- **Override Status**: Show current status (enabled/disabled)
- **Supported Shells**: Display compatible shells
- **Enable/Disable**: Toggle command override
- **Shell Detection**: Show detected shell and config file

## Monitoring and Status

### Health Monitoring

Real-time endpoint health status:

- **Green**: Endpoint healthy and responsive
- **Red**: Endpoint failed health checks
- **Yellow**: Endpoint testing in progress
- **Gray**: Health status unknown

### System Status

Monitor system components:

- **Proxy Server**: Status and port information
- **Load Balancer**: Active endpoints and health
- **S3 Sync**: Last sync time and status
- **Configuration Count**: Total and active configs

### Activity Log

View recent system activity:

- Configuration changes
- Health check results
- S3 sync operations
- Error messages and warnings

## Advanced Features

### Configuration Testing

Test individual configurations:

1. **Click "Test" button** on configuration card
2. **View results**: Response time, status, error details
3. **Health Status**: Updates based on test results

### Import/Export

**Export Configurations**:

```bash
# Via web interface: Settings → Export
# Creates JSON file with all configurations
```

**Import Configurations**:

```bash
# Via web interface: Settings → Import
# Upload JSON file with configurations
```

### Theme Customization

**Dark Mode Options**:

- **Auto**: Follow system theme
- **Light**: Always use light theme
- **Dark**: Always use dark theme

**Accessibility**:

- High contrast mode
- Reduced motion support
- Keyboard navigation
- Screen reader compatibility

## Configuration Examples

### Multi-Provider Setup

Using the web interface to create a robust multi-provider configuration:

1. **Primary Anthropic Config**:
   - Name: `anthropic-primary`
   - Order: `0` (highest priority)
   - Profile: `default`
   - Base URL: `https://api.anthropic.com`

2. **OpenAI Backup**:
   - Name: `openai-backup`
   - Order: `10` (lower priority)
   - Transformer: `enabled`
   - Base URL: `https://api.openai.com/v1`

3. **Custom Provider Fallback**:
   - Name: `custom-fallback`
   - Order: `20` (lowest priority)
   - Transformer: `enabled`
   - Base URL: `https://custom-api.com/v1`

### Official Claude with Proxy

For users behind corporate firewalls:

1. **Profile Type**: `official`
2. **HTTP Proxy**: `http://proxy.company.com:8080`
3. **HTTPS Proxy**: `https://proxy.company.com:8080`
4. **No API key required** (uses official authentication)

## Troubleshooting

### Manager Won't Start

Common issues:

```bash
# Port already in use
start-claude manager --port 3001

# Permission issues
sudo start-claude manager

# Configuration file errors
start-claude edit-config
```

### Interface Not Loading

Check browser console for errors:

1. **CORS Issues**: Ensure proper origin configuration
2. **Network Connectivity**: Verify manager is running
3. **Browser Compatibility**: Use modern browser (Chrome, Firefox, Safari, Edge)

### Configuration Validation Errors

The interface shows detailed validation messages:

- **Required Fields**: Missing name, base URL, or API key
- **Format Errors**: Invalid URL format or API key format
- **Duplicate Names**: Configuration names must be unique
- **Order Conflicts**: Duplicate order values (warning only)

### S3 Sync Issues

Common S3 integration problems:

- **AWS Credentials**: Ensure valid AWS access key and secret
- **Bucket Access**: Verify bucket exists and is accessible
- **Network Issues**: Check firewall and proxy settings
- **Conflict Resolution**: Handle sync conflicts properly

## API Integration

The web interface exposes REST API endpoints:

### Configuration Endpoints

```bash
# Get all configurations
GET http://localhost:2334/api/configs

# Create new configuration
POST http://localhost:2334/api/configs
{
  "name": "new-config",
  "baseUrl": "https://api.example.com",
  "apiKey": "sk-key"
}

# Update configuration
PUT http://localhost:2334/api/configs/config-name

# Delete configuration
DELETE http://localhost:2334/api/configs/config-name
```

### System Settings Endpoints

```bash
# Get system settings
GET http://localhost:2334/api/settings

# Update system settings
PUT http://localhost:2334/api/settings
{
  "balanceMode": {
    "enableByDefault": true
  }
}
```

### Health Check Endpoints

```bash
# Get health status
GET http://localhost:2334/api/health

# Test specific configuration
POST http://localhost:2334/api/test/config-name
```

## Security Considerations

### Access Control

The web interface runs on localhost by default:

- **Local Access Only**: Prevents external access
- **No Authentication**: Assumes trusted local environment
- **HTTPS Option**: Can be configured for secure connections

### Sensitive Data

Configuration management handles sensitive data:

- **API Key Masking**: Keys displayed as `sk-***xxx` in interface
- **Secure Storage**: Configurations stored in user directory
- **No Logging**: API keys not logged in browser console

### Network Security

For production deployments:

```bash
# Bind to specific interface
start-claude manager --host 0.0.0.0 --port 3000

# Use reverse proxy (nginx, Apache)
# Configure HTTPS termination
# Add authentication layer
```

## Performance Optimization

### Large Configuration Sets

For managing many configurations:

- **Virtual Scrolling**: Handles 100+ configurations efficiently
- **Search Indexing**: Fast filtering and searching
- **Lazy Loading**: Load configuration details on demand
- **Batch Operations**: Efficient bulk operations

### Network Optimization

- **Compression**: Gzip compression for API responses
- **Caching**: Browser caching for static assets
- **WebSocket**: Real-time updates for health status
- **Debounced Search**: Efficient search with input debouncing

The web configuration manager provides a comprehensive, user-friendly interface for managing all aspects of start-claude, from basic configuration to advanced system settings and monitoring.
