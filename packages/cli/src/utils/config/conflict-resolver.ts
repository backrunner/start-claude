import type { ClaudeConfig, ConfigFile } from '../../config/types'
import { UILogger } from '../cli/ui'

export interface ConfigConflict {
  configName: string
  field: keyof ClaudeConfig
  localValue: any
  remoteValue: any
  conflictType: 'value' | 'existence' | 'order'
}

export interface ConflictResolution {
  hasConflicts: boolean
  conflicts: ConfigConflict[]
  resolvedConfig: ConfigFile
  resolutionStrategy: 'local' | 'remote' | 'merged'
  resolutionDetails: string[]
}

export interface ConflictResolutionOptions {
  preferLocal?: boolean
  preferRemote?: boolean
  autoResolve?: boolean
  verbose?: boolean
}

/**
 * Detects conflicts between local and remote configuration files
 * Uses UUID (id) for matching when available, falls back to name for legacy configs
 */
export function detectConfigConflicts(
  localConfig: ConfigFile,
  remoteConfig: ConfigFile,
): ConfigConflict[] {
  const conflicts: ConfigConflict[] = []

  // Create maps for easier lookup using UUID when available, otherwise name
  const localConfigMap = new Map(localConfig.configs.map(c => [c.id || c.name.toLowerCase(), c]))
  const remoteConfigMap = new Map(remoteConfig.configs.map(c => [c.id || c.name.toLowerCase(), c]))

  // Check for conflicts in existing configs
  Array.from(localConfigMap.keys()).forEach((key) => {
    const localItem = localConfigMap.get(key)!
    const remoteItem = remoteConfigMap.get(key)

    if (remoteItem) {
      // Compare each field for conflicts
      const fieldsToCheck: (keyof ClaudeConfig)[] = [
        'baseUrl',
        'apiKey',
        'model',
        'permissionMode',
        'transformerEnabled',
        'isDefault',
        'isDeleted',
        'order',
        'enabled',
        'authToken',
        'authorization',
        'customHeaders',
        'smallFastModel',
        'smallFastModelAwsRegion',
        'awsBearerTokenBedrock',
        'bashDefaultTimeoutMs',
        'bashMaxTimeoutMs',
        'bashMaxOutputLength',
        'maintainProjectWorkingDir',
        'apiKeyHelperTtlMs',
        'ideSkipAutoInstall',
        'maxOutputTokens',
        'useBedrock',
        'useVertex',
        'skipBedrockAuth',
        'skipVertexAuth',
        'disableNonessentialTraffic',
        'disableTerminalTitle',
        'disableAutoupdater',
        'disableBugCommand',
        'disableCostWarnings',
        'disableErrorReporting',
        'disableNonEssentialModelCalls',
        'disableTelemetry',
        'httpProxy',
        'httpsProxy',
        'maxThinkingTokens',
        'mcpTimeout',
        'mcpToolTimeout',
        'maxMcpOutputTokens',
        'vertexRegionHaiku',
        'vertexRegionSonnet',
        'vertexRegion37Sonnet',
        'vertexRegion40Opus',
        'vertexRegion40Sonnet',
        'vertexRegion45Sonnet',
      ]

      for (const field of fieldsToCheck) {
        const localValue = localItem[field]
        const remoteValue = remoteItem[field]

        // Only consider it a conflict if both values exist and are different
        if (localValue !== undefined && remoteValue !== undefined && localValue !== remoteValue) {
          conflicts.push({
            configName: localItem.name,
            field,
            localValue,
            remoteValue,
            conflictType: 'value',
          })
        }
      }

      // Check for order conflicts specifically
      if (localItem.order !== remoteItem.order && localItem.order !== undefined && remoteItem.order !== undefined) {
        conflicts.push({
          configName: localItem.name,
          field: 'order',
          localValue: localItem.order,
          remoteValue: remoteItem.order,
          conflictType: 'order',
        })
      }
    }
  })

  // Check for configs that exist only locally or remotely
  Array.from(localConfigMap.keys()).forEach((key) => {
    const localItem = localConfigMap.get(key)!
    if (!remoteConfigMap.has(key)) {
      conflicts.push({
        configName: localItem.name,
        field: 'name',
        localValue: 'exists',
        remoteValue: 'missing',
        conflictType: 'existence',
      })
    }
  })

  Array.from(remoteConfigMap.keys()).forEach((key) => {
    const remoteItem = remoteConfigMap.get(key)!
    if (!localConfigMap.has(key)) {
      conflicts.push({
        configName: remoteItem.name,
        field: 'name',
        localValue: 'missing',
        remoteValue: 'exists',
        conflictType: 'existence',
      })
    }
  })

  return conflicts
}

/**
 * Smart conflict resolution with multiple strategies
 */
export function resolveConfigConflicts(
  localConfig: ConfigFile,
  remoteConfig: ConfigFile,
  options: ConflictResolutionOptions = {},
): ConflictResolution {
  const conflicts = detectConfigConflicts(localConfig, remoteConfig)
  const resolutionDetails: string[] = []

  if (conflicts.length === 0) {
    return {
      hasConflicts: false,
      conflicts: [],
      resolvedConfig: remoteConfig, // Use remote if no conflicts
      resolutionStrategy: 'remote',
      resolutionDetails: ['No conflicts detected, using remote configuration'],
    }
  }

  // Determine resolution strategy
  let strategy: 'local' | 'remote' | 'merged' = 'merged'
  if (options.preferLocal)
    strategy = 'local'
  if (options.preferRemote)
    strategy = 'remote'

  let resolvedConfig: ConfigFile

  switch (strategy) {
    case 'local':
      resolvedConfig = localConfig
      resolutionDetails.push('Using local configuration (user preference)')
      break

    case 'remote':
      resolvedConfig = remoteConfig
      resolutionDetails.push('Using remote configuration (user preference)')
      break

    case 'merged':
      resolvedConfig = smartMergeConfigs(localConfig, remoteConfig, conflicts, resolutionDetails, options)
      break
  }

  return {
    hasConflicts: true,
    conflicts,
    resolvedConfig,
    resolutionStrategy: strategy,
    resolutionDetails,
  }
}

/**
 * Smart merge strategy using tombstone approach for deletion tracking
 * Uses UUID (id) for matching when available, falls back to name for legacy configs
 */
function smartMergeConfigs(
  localConfig: ConfigFile,
  remoteConfig: ConfigFile,
  conflicts: ConfigConflict[],
  resolutionDetails: string[],
  options: ConflictResolutionOptions,
): ConfigFile {
  // Start with remote config as base (newer version)
  const resolved: ConfigFile = {
    version: Math.max(localConfig.version, remoteConfig.version),
    configs: [...remoteConfig.configs],
    settings: { ...remoteConfig.settings },
  }

  // Create maps using UUID when available, otherwise name
  const localConfigMap = new Map(localConfig.configs.map(c => [c.id || c.name.toLowerCase(), c]))
  const resolvedConfigMap = new Map(resolved.configs.map(c => [c.id || c.name.toLowerCase(), c]))

  // Apply smart resolution rules
  for (const conflict of conflicts) {
    // Find the config by its ID if available
    const localItem = Array.from(localConfigMap.values()).find(c => c.name === conflict.configName)
    const configKey = localItem?.id || conflict.configName.toLowerCase()

    switch (conflict.conflictType) {
      case 'existence':
        if (conflict.localValue === 'exists' && conflict.remoteValue === 'missing') {
          // Local config exists but missing remotely
          const localItem = localConfigMap.get(configKey)
          if (localItem && !localItem.isDeleted) {
            // Only add if local config is not deleted (i.e., it's a genuine new config)
            resolved.configs.push(localItem)
            resolutionDetails.push(`Added local-only config: ${conflict.configName}`)
          }
          else if (localItem?.isDeleted) {
            // Local has a deletion tombstone - respect the deletion
            resolutionDetails.push(`Respected local deletion of config: ${conflict.configName}`)
          }
        }
        else if (conflict.localValue === 'missing' && conflict.remoteValue === 'exists') {
          // Remote config exists but missing locally - keep remote (already in resolved)
          // Unless we have a local deletion record indicating this was intentionally deleted
          const localTombstone = localConfigMap.get(configKey)
          if (localTombstone?.isDeleted) {
            // We have a local deletion tombstone, so apply the deletion to remote
            const remoteConfig = resolvedConfigMap.get(configKey)
            if (remoteConfig) {
              remoteConfig.isDeleted = true
              remoteConfig.deletedAt = localTombstone.deletedAt
              // Clear sensitive data
              delete remoteConfig.apiKey
              delete remoteConfig.authToken
              delete remoteConfig.authorization
              delete remoteConfig.awsBearerTokenBedrock
              resolutionDetails.push(`Applied local deletion to remote config: ${conflict.configName}`)
            }
          }
        }
        break

      case 'value': {
        const resolvedItem = resolvedConfigMap.get(configKey)
        const localItem = localConfigMap.get(configKey)

        if (resolvedItem && localItem) {
          // Smart field-specific resolution
          const resolvedValue = resolveFieldConflict(
            conflict.field,
            conflict.localValue,
            conflict.remoteValue,
            resolutionDetails,
            options,
          )

          // Apply the resolved value
          ;(resolvedItem as any)[conflict.field] = resolvedValue
        }
        break
      }

      case 'order': {
        // For order conflicts, prefer local user's organization
        const resolvedOrderItem = resolvedConfigMap.get(configKey)
        const localOrderItem = localConfigMap.get(configKey)

        if (resolvedOrderItem && localOrderItem && localOrderItem.order !== undefined) {
          resolvedOrderItem.order = localOrderItem.order
          resolutionDetails.push(`Preserved local order for ${conflict.configName}: ${localOrderItem.order}`)
        }
        break
      }
    }
  }

  // Clean up old deletion tombstones (older than 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  resolved.configs = resolved.configs.filter((config) => {
    if (!config.isDeleted || !config.deletedAt) {
      return true // Keep non-deleted configs
    }
    return new Date(config.deletedAt) > thirtyDaysAgo // Keep recent deletions
  })

  // Sort configs by order if specified
  resolved.configs.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order
    }
    if (a.order !== undefined)
      return -1
    if (b.order !== undefined)
      return 1
    return 0
  })

  return resolved
}

/**
 * Field-specific conflict resolution logic
 */
function resolveFieldConflict(
  field: keyof ClaudeConfig,
  localValue: any,
  remoteValue: any,
  resolutionDetails: string[],
  options: ConflictResolutionOptions,
): any {
  // Field-specific resolution rules
  switch (field) {
    case 'apiKey':
    case 'authToken':
    case 'authorization':
    case 'awsBearerTokenBedrock':
      // For sensitive fields, prefer local (user's current keys)
      resolutionDetails.push(`Using local ${field} (security preference)`)
      return localValue

    case 'isDefault':
      // Only one config should be default - prefer local user's choice
      resolutionDetails.push(`Using local default setting for ${field}`)
      return localValue

    case 'enabled':
      // User's enable/disable preference should be preserved
      resolutionDetails.push(`Preserving local enabled state: ${localValue}`)
      return localValue

    case 'transformerEnabled':
      // Feature enablement - prefer local user's choice
      resolutionDetails.push(`Preserving local transformer setting: ${localValue}`)
      return localValue

    case 'baseUrl':
    case 'model':
      // For configuration parameters, prefer newer remote values
      resolutionDetails.push(`Using remote ${field}: ${remoteValue} (newer configuration)`)
      return remoteValue

    case 'permissionMode':
      // Security-related settings - prefer local
      resolutionDetails.push(`Preserving local permission mode: ${localValue}`)
      return localValue

    case 'bashDefaultTimeoutMs':
    case 'bashMaxTimeoutMs':
    case 'bashMaxOutputLength':
    case 'maxOutputTokens':
    case 'maxThinkingTokens':
    case 'mcpTimeout':
    case 'mcpToolTimeout':
    case 'maxMcpOutputTokens': {
      // For timeout/limit settings, use the more conservative (typically higher) value
      const numericLocal = typeof localValue === 'number' ? localValue : 0
      const numericRemote = typeof remoteValue === 'number' ? remoteValue : 0
      const resolved = Math.max(numericLocal, numericRemote)
      resolutionDetails.push(`Using higher ${field}: ${resolved}`)
      return resolved
    }

    case 'httpProxy':
    case 'httpsProxy': {
      // Network settings - prefer local
      resolutionDetails.push(`Preserving local proxy setting: ${localValue}`)
      return localValue
    }

    // Configuration fields - prefer remote (newer configuration)
    case 'name':
    case 'profileType':
    case 'order':
    case 'customHeaders':
    case 'smallFastModel':
    case 'smallFastModelAwsRegion':
    case 'maintainProjectWorkingDir':
    case 'apiKeyHelperTtlMs':
    case 'ideSkipAutoInstall':
    case 'useBedrock':
    case 'useVertex':
    case 'skipBedrockAuth':
    case 'skipVertexAuth':
    case 'disableNonessentialTraffic':
    case 'disableTerminalTitle':
    case 'disableAutoupdater':
    case 'disableBugCommand':
    case 'disableCostWarnings':
    case 'disableErrorReporting':
    case 'disableNonEssentialModelCalls':
    case 'disableTelemetry':
    case 'claudeCodeDisableNonessentialTraffic':
    case 'vertexRegionHaiku':
    case 'vertexRegionSonnet':
    case 'vertexRegion37Sonnet':
    case 'vertexRegion40Opus':
    case 'vertexRegion40Sonnet':
    case 'vertexRegion45Sonnet': {
      // For configuration fields, prefer remote (newer configuration)
      if (options.verbose) {
        resolutionDetails.push(`Using remote ${String(field)}: ${remoteValue} (newer configuration)`)
      }
      return remoteValue
    }

    case 'env': {
      // For env maps, merge both with local taking precedence for conflicts
      const mergedEnv = { ...(remoteValue || {}), ...(localValue || {}) }
      resolutionDetails.push(`Merged env variables with local values taking precedence`)
      return mergedEnv
    }

    case 'transformerHeaders': {
      // For transformer headers, merge both with local taking precedence for conflicts
      const mergedHeaders = { ...(remoteValue || {}), ...(localValue || {}) }
      resolutionDetails.push(`Merged transformer headers with local values taking precedence`)
      return mergedHeaders
    }

    case 'isDeleted':
      // For deletion flags, prefer the more recent deletion
      if (localValue && remoteValue) {
        // Both are deleted, need to check timestamps
        resolutionDetails.push(`Both configs marked as deleted, preserving deletion state`)
        return true
      }
      // One is deleted, one is not - respect the deletion
      if (localValue || remoteValue) {
        resolutionDetails.push(`Preserving deletion state: ${localValue || remoteValue}`)
        return localValue || remoteValue
      }
      return false

    case 'deletedAt':
      // For deletion timestamps, prefer the more recent one
      if (localValue && remoteValue) {
        const localTime = new Date(localValue).getTime()
        const remoteTime = new Date(remoteValue).getTime()
        const resolved = localTime > remoteTime ? localValue : remoteValue
        resolutionDetails.push(`Using more recent deletion timestamp: ${resolved}`)
        return resolved
      }
      // If only one has a deletion timestamp, use it
      resolutionDetails.push(`Using deletion timestamp: ${localValue || remoteValue}`)
      return localValue || remoteValue

    case 'transformer':
      // For transformer settings, prefer local user's choice
      resolutionDetails.push(`Preserving local transformer setting: ${localValue}`)
      return localValue

    case 'id':
      // For ID fields, prefer local (maintain consistency)
      resolutionDetails.push(`Preserving local ID: ${localValue}`)
      return localValue

    case 'enabledExtensions': {
      // For enabled extensions, merge both with local taking precedence
      // This preserves user's local extension choices while incorporating remote additions
      const localExt = localValue || {}
      const remoteExt = remoteValue || {}

      // Merge useGlobalDefaults preference (prefer local)
      const useGlobalDefaults = localExt.useGlobalDefaults ?? remoteExt.useGlobalDefaults ?? true

      // Merge overrides (if using global defaults mode)
      let overrides
      if (useGlobalDefaults) {
        overrides = {
          mcpServers: {
            add: [...new Set([...(localExt.overrides?.mcpServers?.add || []), ...(remoteExt.overrides?.mcpServers?.add || [])])],
            remove: [...new Set([...(localExt.overrides?.mcpServers?.remove || []), ...(remoteExt.overrides?.mcpServers?.remove || [])])],
          },
          skills: {
            add: [...new Set([...(localExt.overrides?.skills?.add || []), ...(remoteExt.overrides?.skills?.add || [])])],
            remove: [...new Set([...(localExt.overrides?.skills?.remove || []), ...(remoteExt.overrides?.skills?.remove || [])])],
          },
          subagents: {
            add: [...new Set([...(localExt.overrides?.subagents?.add || []), ...(remoteExt.overrides?.subagents?.add || [])])],
            remove: [...new Set([...(localExt.overrides?.subagents?.remove || []), ...(remoteExt.overrides?.subagents?.remove || [])])],
          },
        }
      }

      // Merge explicit lists (if not using global defaults mode)
      const mcpServers = useGlobalDefaults ? undefined : [...new Set([...(localExt.mcpServers || []), ...(remoteExt.mcpServers || [])])]
      const skills = useGlobalDefaults ? undefined : [...new Set([...(localExt.skills || []), ...(remoteExt.skills || [])])]
      const subagents = useGlobalDefaults ? undefined : [...new Set([...(localExt.subagents || []), ...(remoteExt.subagents || [])])]

      resolutionDetails.push(`Merged enabled extensions with local preferences taking precedence`)
      return {
        useGlobalDefaults,
        overrides,
        mcpServers,
        skills,
        subagents,
      }
    }

    default: {
      // For other fields, prefer remote (newer configuration)
      if (options.verbose) {
        resolutionDetails.push(`Using remote ${String(field)}: ${remoteValue} (default merge strategy)`)
      }
      return remoteValue
    }
  }
}

/**
 * Display conflict resolution summary
 */
export function displayConflictResolution(resolution: ConflictResolution, options: ConflictResolutionOptions = {}): void {
  const logger = new UILogger(options.verbose)

  if (!resolution.hasConflicts) {
    logger.displayVerbose('No configuration conflicts detected')
    return
  }

  logger.displayWarning(`⚠️  Detected ${resolution.conflicts.length} configuration conflicts`)

  if (options.verbose) {
    logger.displayInfo('\n🔍 Conflict Details:')
    for (const conflict of resolution.conflicts) {
      logger.displayInfo(`  • ${conflict.configName}.${conflict.field}: local="${conflict.localValue}" vs remote="${conflict.remoteValue}"`)
    }
  }

  logger.displayInfo(`\n🛠️  Resolution Strategy: ${resolution.resolutionStrategy}`)

  if (options.verbose && resolution.resolutionDetails.length > 0) {
    logger.displayInfo('\n📋 Resolution Details:')
    for (const detail of resolution.resolutionDetails) {
      logger.displayInfo(`  • ${detail}`)
    }
  }

  logger.displayInfo(`\n✅ Conflicts resolved automatically using smart merge strategy`)
}
