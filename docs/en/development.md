# Development Guide

## Prerequisites

- Node.js 18+
- npm (for installation and Claude Code CLI)

## Setup

```bash
git clone https://github.com/your-username/start-claude.git
cd start-claude
npm install
```

## Available Scripts

- `npm run build` - Build the project
- `npm run watch` - Build and watch for changes
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix linting issues
- `npm test` - Run tests
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Run tests with coverage

## Testing

The project uses Vitest for testing:

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/config.test.ts

# Watch mode
npm run test:watch
```

## Project Structure

```
src/
├── cli/
│   ├── balance.ts        # Load balancer CLI handling
│   ├── claude.ts         # Claude CLI integration & auto-install
│   ├── common.ts         # Common CLI utilities
│   ├── main.ts           # Main CLI application
│   └── override.ts       # Claude command override functionality
├── core/
│   ├── config.ts         # Configuration management logic
│   ├── load-balancer.ts  # Load balancer implementation
│   └── types.ts          # TypeScript type definitions
├── storage/
│   └── s3-sync.ts        # S3 synchronization functionality
└── utils/
    ├── detection.ts      # Claude installation detection
    ├── editor.ts         # Editor integration
    ├── ui.ts             # User interface utilities
    └── update-checker.ts # Auto-update functionality

tests/                    # Test files mirror src structure
docs/                     # Documentation
├── en/                   # English documentation
└── zh/                   # Chinese documentation
```

## Architecture Overview

### Configuration Management

The `ConfigManager` class handles:

- Reading/writing configuration files
- Validation and type checking
- Default configuration management
- Configuration file format versioning

### Load Balancer

The `LoadBalancer` class provides:

- Health monitoring of multiple endpoints
- Round-robin request distribution
- Automatic failover and recovery
- Priority-based endpoint ordering

### CLI Interface

Built with Commander.js:

- Command parsing and validation
- Interactive prompts with Inquirer.js
- Colorful output with custom UI utilities
- Comprehensive help and error messages

### Storage Sync

S3-compatible synchronization:

- Multi-provider support (AWS S3, Cloudflare R2, Backblaze B2)
- Conflict resolution strategies
- Secure credential management

## Code Style

The project uses ESLint with a strict configuration:

```bash
# Check code style
npm run lint

# Auto-fix style issues
npm run lint:fix
```

Key style guidelines:

- TypeScript strict mode enabled
- Explicit function return types required
- No unused variables allowed
- Consistent import/export ordering
- Trailing commas required

## Testing Strategy

### Unit Tests

Each major component has comprehensive unit tests:

- Configuration management (`config.test.ts`)
- Load balancer functionality (`load-balancer.test.ts`)
- CLI commands (`claude.test.ts`)
- S3 sync operations (`s3-sync.test.ts`)
- Editor integration (`editor.test.ts`)

### Mocking Strategy

Tests use Vitest mocking for:

- File system operations
- HTTP requests
- Child process execution
- UI output functions

### Test Data

Test configurations and fixtures are defined inline to ensure test isolation.

## Building and Distribution

### Build Process

The project uses Rollup for building:

```bash
npm run build
```

This creates:

- `bin/cli.cjs` - CommonJS bundle
- `bin/cli.mjs` - ES modules bundle

### Package Configuration

The `package.json` includes:

- Dual module support (CJS + ESM)
- Executable binary configuration
- Comprehensive dependency management
- npm publish configuration

## Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for your changes
5. Run tests: `npm test`
6. Run linting: `npm run lint:fix`
7. Commit your changes: `git commit -m 'Add amazing feature'`
8. Push to the branch: `git push origin feature/amazing-feature`
9. Open a Pull Request

### Commit Message Guidelines

Use conventional commits:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Build process or auxiliary tool changes

### Code Review Process

Pull requests require:

- All tests passing
- Linting checks passing
- Code review approval
- Documentation updates for new features

## Debugging

### Local Development

```bash
# Build and link for local testing
npm run build
npm link

# Test CLI commands
start-claude --help
```

### Debug Configuration

The project includes VS Code debug configuration:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug CLI",
  "program": "${workspaceFolder}/bin/cli.mjs",
  "args": ["--help"],
  "skipFiles": ["<node_internals>/**"]
}
```

### Common Debug Scenarios

1. **Configuration Issues**: Check `~/.start-claude/config.json` format
2. **S3 Sync Problems**: Verify credentials and bucket permissions
3. **Load Balancer**: Monitor health check requests and responses
4. **Editor Integration**: Check editor detection and path resolution

## Performance Considerations

### Startup Performance

- Lazy loading of heavy dependencies
- Configuration caching
- Minimal initial file reads

### Memory Usage

- Streaming for large file operations
- Proper cleanup of temporary files
- Limited concurrent operations

### Network Operations

- Request timeouts and retries
- Connection pooling for health checks
- Graceful degradation for network issues

## Security

### Credential Management

- API keys stored in user's home directory
- File permissions restricted to user only
- No credentials logged or transmitted unnecessarily

### Input Validation

- All user inputs validated and sanitized
- Configuration format validation
- Safe file path handling

### Dependency Security

Regular security audits:

```bash
npm audit
npm audit fix
```

## Release Process

### Version Management

The project follows semantic versioning:

- Major: Breaking changes
- Minor: New features, backwards compatible
- Patch: Bug fixes, backwards compatible

### Release Checklist

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Run full test suite
4. Build and test distribution
5. Create git tag
6. Publish to npm
7. Create GitHub release with notes

## Troubleshooting Development Issues

### Build Issues

```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clean TypeScript cache
npm run build -- --clean
```

### Test Issues

```bash
# Run tests with verbose output
npm test -- --reporter=verbose

# Run specific test pattern
npm test -- --grep "configuration"
```

### Linting Issues

```bash
# See detailed linting errors
npm run lint -- --format=codeframe

# Fix auto-fixable issues
npm run lint:fix
```
