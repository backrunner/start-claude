export function resolveEnabledExtensions(config, settings, isProxyMode = false) {
    if (isProxyMode) {
        const defaults = settings.defaultEnabledExtensions || {
            mcpServers: [],
            skills: [],
            subagents: [],
        };
        return {
            mcpServers: [...defaults.mcpServers],
            skills: [...defaults.skills],
            subagents: [...defaults.subagents],
        };
    }
    if (!config.enabledExtensions) {
        return {
            mcpServers: [],
            skills: [],
            subagents: [],
        };
    }
    if (config.enabledExtensions.useGlobalDefaults) {
        const defaults = settings.defaultEnabledExtensions || {
            mcpServers: [],
            skills: [],
            subagents: [],
        };
        const overrides = config.enabledExtensions.overrides || {};
        return {
            mcpServers: applyOverrides(defaults.mcpServers, overrides.mcpServers),
            skills: applyOverrides(defaults.skills, overrides.skills),
            subagents: applyOverrides(defaults.subagents, overrides.subagents),
        };
    }
    return {
        mcpServers: config.enabledExtensions.mcpServers || [],
        skills: config.enabledExtensions.skills || [],
        subagents: config.enabledExtensions.subagents || [],
    };
}
function applyOverrides(base, override) {
    if (!override) {
        return [...base];
    }
    let result = [...base];
    if (override.remove && override.remove.length > 0) {
        result = result.filter(id => !override.remove.includes(id));
    }
    if (override.add && override.add.length > 0) {
        const newItems = override.add.filter(id => !result.includes(id));
        result.push(...newItems);
    }
    return result;
}
