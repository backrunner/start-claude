import type { ClaudeConfig, ConfigFile } from '../../config/types'
import { displayInfo, displayVerbose, displayWarning } from '../cli/ui'

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
 */
export function detectConfigConflicts(
  localConfig: ConfigFile,
  remoteConfig: ConfigFile,
): ConfigConflict[] {
  const conflicts: ConfigConflict[] = []

  // Create maps for easier lookup
  const localConfigMap = new Map(localConfig.configs.map(c => [c.name.toLowerCase(), c]))
  const remoteConfigMap = new Map(remoteConfig.configs.map(c => [c.name.toLowerCase(), c]))

  // Check for conflicts in existing configs
  for (const [name, localItem] of localConfigMap) {
    const remoteItem = remoteConfigMap.get(name)

    if (remoteItem) {
      // Compare each field for conflicts
      const fieldsToCheck: (keyof ClaudeConfig)[] = [
        'baseUrl',
        'apiKey',
        'model',
        'permissionMode',
        'transformerEnabled',
        'isDefault',
        'order',
        'enabled',
        'authToken',
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
  }

  // Check for configs that exist only locally or remotely
  for (const [name, localItem] of localConfigMap) {
    if (!remoteConfigMap.has(name)) {
      conflicts.push({
        configName: localItem.name,
        field: 'name',
        localValue: 'exists',
        remoteValue: 'missing',
        conflictType: 'existence',
      })
    }
  }

  for (const [name, remoteItem] of remoteConfigMap) {
    if (!localConfigMap.has(name)) {
      conflicts.push({
        configName: remoteItem.name,
        field: 'name',
        localValue: 'missing',
        remoteValue: 'exists',
        conflictType: 'existence',
      })
    }
  }

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
 * Smart merge strategy that handles different types of conflicts intelligently
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

  const localConfigMap = new Map(localConfig.configs.map(c => [c.name.toLowerCase(), c]))
  const resolvedConfigMap = new Map(resolved.configs.map(c => [c.name.toLowerCase(), c]))

  // Apply smart resolution rules
  for (const conflict of conflicts) {
    const configName = conflict.configName.toLowerCase()

    switch (conflict.conflictType) {
      case 'existence':
        if (conflict.localValue === 'exists' && conflict.remoteValue === 'missing') {
          // Local config doesn't exist remotely - add it
          const localItem = localConfigMap.get(configName)
          if (localItem) {
            resolved.configs.push(localItem)
            resolutionDetails.push(`Added local-only config: ${conflict.configName}`)
          }
        }
        // If remote exists but local doesn't, keep remote (already in resolved)
        break

      case 'value': {
        const resolvedItem = resolvedConfigMap.get(configName)
        const localItem = localConfigMap.get(configName)

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
        const resolvedOrderItem = resolvedConfigMap.get(configName)
        const localOrderItem = localConfigMap.get(configName)

        if (resolvedOrderItem && localOrderItem && localOrderItem.order !== undefined) {
          resolvedOrderItem.order = localOrderItem.order
          resolutionDetails.push(`Preserved local order for ${conflict.configName}: ${localOrderItem.order}`)
        }
        break
      }
    }
  }

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
    case 'vertexRegionHaiku':
    case 'vertexRegionSonnet':
    case 'vertexRegion37Sonnet':
    case 'vertexRegion40Opus':
    case 'vertexRegion40Sonnet': {
      // For configuration fields, prefer remote (newer configuration)
      if (options.verbose) {
        resolutionDetails.push(`Using remote ${String(field)}: ${remoteValue} (newer configuration)`)
      }
      return remoteValue
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
  if (!resolution.hasConflicts) {
    displayVerbose('No configuration conflicts detected', options.verbose)
    return
  }

  displayWarning(`⚠️  Detected ${resolution.conflicts.length} configuration conflicts`)

  if (options.verbose) {
    displayInfo('\n🔍 Conflict Details:')
    for (const conflict of resolution.conflicts) {
      displayInfo(`  • ${conflict.configName}.${conflict.field}: local="${conflict.localValue}" vs remote="${conflict.remoteValue}"`)
    }
  }

  displayInfo(`\n🛠️  Resolution Strategy: ${resolution.resolutionStrategy}`)

  if (options.verbose && resolution.resolutionDetails.length > 0) {
    displayInfo('\n📋 Resolution Details:')
    for (const detail of resolution.resolutionDetails) {
      displayInfo(`  • ${detail}`)
    }
  }

  displayInfo(`\n✅ Conflicts resolved automatically using smart merge strategy`)
}
