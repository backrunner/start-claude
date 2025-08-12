# Config Migration System

This directory contains configuration migrations for the start-claude project.

## How to Create a New Migration

1. Create a new file in this directory (e.g., `v2-to-v3-migration.ts`)
2. Extend the `ConfigMigration` class:

```typescript
import type { ConfigFile } from '../types'
import { ConfigMigration } from '../migration'

export class V2ToV3Migration extends ConfigMigration {
  readonly fromVersion = 2
  readonly toVersion = 3
  readonly description = 'Add new feature to config'

  migrate(config: ConfigFile): ConfigFile {
    return {
      ...config,
      version: this.toVersion,
      // Add your migration logic here
    }
  }
}
```

3. Register the migration in your entry point or a central migrations file:

```typescript
import { migrationRegistry } from '../migration'
import { V2ToV3Migration } from './v2-to-v3-migration'

migrationRegistry.register(new V2ToV3Migration())
```

## Migration Guidelines

- Always increment version numbers sequentially
- Test migrations thoroughly with sample data
- Document any breaking changes
- Consider backward compatibility when possible
- Keep migrations simple and focused on one change per migration

## Current Version

The current configuration version is defined in `../types.ts` as `CURRENT_CONFIG_VERSION`.

## Migration Registry

All migrations are managed by the `MigrationRegistry` in `../migration.ts`. The registry automatically finds migration paths between versions and applies them sequentially.
