import type { ClaudeConfig, SystemSettings } from '../config/types'

/**
 * Resolved extensions interface - the final list of enabled extensions
 */
export interface ResolvedExtensions {
  mcpServers: string[]
  skills: string[]
  subagents: string[]
}

/**
 * Resolve which extensions should actually be enabled for a profile
 *
 * Logic:
 * - Proxy mode: ONLY use global defaults, ignore all profile overrides
 * - Regular mode with useGlobalDefaults: apply overrides (remove first, then add)
 * - Legacy mode: use explicit lists from profile
 *
 * @param config - The profile configuration
 * @param settings - System settings containing defaults
 * @param isProxyMode - Whether running in proxy mode (multiple configs)
 * @returns Resolved list of enabled extension IDs
 */
export function resolveEnabledExtensions(
  config: ClaudeConfig,
  settings: SystemSettings,
  isProxyMode: boolean = false,
): ResolvedExtensions {
  // Proxy mode: ONLY use global defaults, ignore all profile overrides
  if (isProxyMode) {
    const defaults = settings.defaultEnabledExtensions || {
      mcpServers: [],
      skills: [],
      subagents: [],
    }

    return {
      mcpServers: [...defaults.mcpServers],
      skills: [...defaults.skills],
      subagents: [...defaults.subagents],
    }
  }

  // Regular mode: check profile configuration
  if (!config.enabledExtensions) {
    // No extensions configured, return empty
    return {
      mcpServers: [],
      skills: [],
      subagents: [],
    }
  }

  // Check if using global defaults with overrides
  if (config.enabledExtensions.useGlobalDefaults) {
    const defaults = settings.defaultEnabledExtensions || {
      mcpServers: [],
      skills: [],
      subagents: [],
    }

    const overrides = config.enabledExtensions.overrides || {}

    return {
      mcpServers: applyOverrides(defaults.mcpServers, overrides.mcpServers),
      skills: applyOverrides(defaults.skills, overrides.skills),
      subagents: applyOverrides(defaults.subagents, overrides.subagents),
    }
  }

  // Legacy mode: use explicit lists
  return {
    mcpServers: config.enabledExtensions.mcpServers || [],
    skills: config.enabledExtensions.skills || [],
    subagents: config.enabledExtensions.subagents || [],
  }
}

/**
 * Apply overrides (additions and removals) to a base list
 *
 * Logic:
 * 1. Start with base list
 * 2. Remove all items in the 'remove' list
 * 3. Add all items in the 'add' list (that aren't already present)
 *
 * @param base - Base list of IDs
 * @param override - Override specification with add/remove lists
 * @param override.add - IDs to add to the base list
 * @param override.remove - IDs to remove from the base list
 * @returns Resulting list after applying overrides
 */
function applyOverrides(
  base: string[],
  override?: { add?: string[], remove?: string[] },
): string[] {
  if (!override) {
    return [...base]
  }

  let result = [...base]

  // Step 1: Remove items
  if (override.remove && override.remove.length > 0) {
    result = result.filter(id => !override.remove!.includes(id))
  }

  // Step 2: Add items (only if not already present)
  if (override.add && override.add.length > 0) {
    const newItems = override.add.filter(id => !result.includes(id))
    result.push(...newItems)
  }

  return result
}
