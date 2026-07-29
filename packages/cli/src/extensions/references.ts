import type { ClaudeConfig, ConfigFile, ExtensionsLibrary } from '../config/types'

export function pruneMissingExtensionReferences(configFile: ConfigFile): void {
  const library = configFile.settings.extensionsLibrary || createEmptyLibrary()
  const defaults = configFile.settings.defaultEnabledExtensions

  if (defaults) {
    defaults.mcpServers = keepExistingIds(defaults.mcpServers, library.mcpServers)
    defaults.skills = keepExistingIds(defaults.skills, library.skills)
    defaults.subagents = keepExistingIds(defaults.subagents, library.subagents)
  }

  for (const config of configFile.configs) {
    pruneConfigReferences(config, library)
  }
}

function pruneConfigReferences(config: ClaudeConfig, library: ExtensionsLibrary): void {
  const enabled = config.enabledExtensions
  if (!enabled) {
    return
  }

  if (enabled.mcpServers) {
    enabled.mcpServers = keepExistingIds(enabled.mcpServers, library.mcpServers)
  }
  if (enabled.skills) {
    enabled.skills = keepExistingIds(enabled.skills, library.skills)
  }
  if (enabled.subagents) {
    enabled.subagents = keepExistingIds(enabled.subagents, library.subagents)
  }

  const overrides = enabled.overrides
  if (!overrides) {
    return
  }

  if (overrides.mcpServers) {
    overrides.mcpServers.add = keepExistingOptionalIds(overrides.mcpServers.add, library.mcpServers)
    overrides.mcpServers.remove = keepExistingOptionalIds(overrides.mcpServers.remove, library.mcpServers)
  }
  if (overrides.skills) {
    overrides.skills.add = keepExistingOptionalIds(overrides.skills.add, library.skills)
    overrides.skills.remove = keepExistingOptionalIds(overrides.skills.remove, library.skills)
  }
  if (overrides.subagents) {
    overrides.subagents.add = keepExistingOptionalIds(overrides.subagents.add, library.subagents)
    overrides.subagents.remove = keepExistingOptionalIds(overrides.subagents.remove, library.subagents)
  }
}

function keepExistingOptionalIds<T>(
  ids: string[] | undefined,
  definitions: Record<string, T>,
): string[] | undefined {
  return ids ? keepExistingIds(ids, definitions) : undefined
}

function keepExistingIds<T>(ids: string[], definitions: Record<string, T>): string[] {
  return [...new Set(ids.filter(id => hasOwn(definitions, id)))]
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function createEmptyLibrary(): ExtensionsLibrary {
  return {
    mcpServers: {},
    skills: {},
    subagents: {},
  }
}
