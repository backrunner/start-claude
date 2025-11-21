/**
 * Utilities for normalizing and matching configuration names
 */

/**
 * Normalize a config name for comparison
 * Handles:
 * - Case insensitivity (lowercase)
 * - Space/hyphen equivalence (but NOT underscore - underscores are treated as distinct)
 * - Trimming whitespace
 *
 * Examples:
 * - "My API" -> "myapi"
 * - "my-api" -> "myapi"
 * - "MY API" -> "myapi"
 * - "my_api" -> "my_api" (underscores are preserved)
 */
export function normalizeConfigName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, '') // Remove spaces and hyphens only (NOT underscores)
}

/**
 * Check if two config names are equivalent
 * Uses normalized comparison to handle different formatting
 */
export function configNamesMatch(name1: string, name2: string): boolean {
  return normalizeConfigName(name1) === normalizeConfigName(name2)
}

/**
 * Find a config by name from a list, using flexible matching
 */
export function findConfigByName<T extends { name: string }>(
  configs: T[],
  targetName: string,
): T | undefined {
  const normalizedTarget = normalizeConfigName(targetName)
  return configs.find(config => normalizeConfigName(config.name) === normalizedTarget)
}

/**
 * Check if a config name conflicts with existing configs
 * Returns the conflicting config if found, otherwise undefined
 */
export function findNameConflict<T extends { name: string }>(
  configs: T[],
  targetName: string,
  excludeConfig?: T,
): T | undefined {
  const normalizedTarget = normalizeConfigName(targetName)
  return configs.find(config =>
    config !== excludeConfig
    && normalizeConfigName(config.name) === normalizedTarget,
  )
}

/**
 * Get a user-friendly error message for config name conflicts
 */
export function getNameConflictMessage(newName: string, existingName: string): string {
  if (newName === existingName) {
    return `Configuration "${existingName}" already exists`
  }
  return `Configuration name "${newName}" conflicts with existing configuration "${existingName}" (names are treated as equivalent when ignoring case and spaces/hyphens)`
}
