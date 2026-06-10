export function normalizeConfigName(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[\s\-]+/g, '');
}
export function configNamesMatch(name1, name2) {
    return normalizeConfigName(name1) === normalizeConfigName(name2);
}
export function findConfigByName(configs, targetName) {
    const normalizedTarget = normalizeConfigName(targetName);
    return configs.find(config => normalizeConfigName(config.name) === normalizedTarget);
}
export function findNameConflict(configs, targetName, excludeConfig) {
    const normalizedTarget = normalizeConfigName(targetName);
    return configs.find(config => config !== excludeConfig
        && normalizeConfigName(config.name) === normalizedTarget);
}
export function getNameConflictMessage(newName, existingName) {
    if (newName === existingName) {
        return `Configuration "${existingName}" already exists`;
    }
    return `Configuration name "${newName}" conflicts with existing configuration "${existingName}" (names are treated as equivalent when ignoring case and spaces/hyphens)`;
}
