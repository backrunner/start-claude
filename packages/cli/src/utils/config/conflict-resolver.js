import { UILogger } from '../cli/ui';
export function detectConfigConflicts(localConfig, remoteConfig) {
    const conflicts = [];
    const localConfigMap = new Map(localConfig.configs.map(c => [c.id || c.name.toLowerCase(), c]));
    const remoteConfigMap = new Map(remoteConfig.configs.map(c => [c.id || c.name.toLowerCase(), c]));
    Array.from(localConfigMap.keys()).forEach((key) => {
        const localItem = localConfigMap.get(key);
        const remoteItem = remoteConfigMap.get(key);
        if (remoteItem) {
            const fieldsToCheck = [
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
                'claudeCodeDisableNonessentialTraffic',
                'claudeCodeDisableExperimentalBetas',
                'claudeCodeMaxRetries',
                'claudeCodeRetryWatchdog',
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
            ];
            for (const field of fieldsToCheck) {
                const localValue = localItem[field];
                const remoteValue = remoteItem[field];
                if (localValue !== undefined && remoteValue !== undefined && localValue !== remoteValue) {
                    conflicts.push({
                        configName: localItem.name,
                        field,
                        localValue,
                        remoteValue,
                        conflictType: 'value',
                    });
                }
            }
            if (localItem.order !== remoteItem.order && localItem.order !== undefined && remoteItem.order !== undefined) {
                conflicts.push({
                    configName: localItem.name,
                    field: 'order',
                    localValue: localItem.order,
                    remoteValue: remoteItem.order,
                    conflictType: 'order',
                });
            }
        }
    });
    Array.from(localConfigMap.keys()).forEach((key) => {
        const localItem = localConfigMap.get(key);
        if (!remoteConfigMap.has(key)) {
            conflicts.push({
                configName: localItem.name,
                field: 'name',
                localValue: 'exists',
                remoteValue: 'missing',
                conflictType: 'existence',
            });
        }
    });
    Array.from(remoteConfigMap.keys()).forEach((key) => {
        const remoteItem = remoteConfigMap.get(key);
        if (!localConfigMap.has(key)) {
            conflicts.push({
                configName: remoteItem.name,
                field: 'name',
                localValue: 'missing',
                remoteValue: 'exists',
                conflictType: 'existence',
            });
        }
    });
    return conflicts;
}
export function resolveConfigConflicts(localConfig, remoteConfig, options = {}) {
    const conflicts = detectConfigConflicts(localConfig, remoteConfig);
    const resolutionDetails = [];
    if (conflicts.length === 0) {
        return {
            hasConflicts: false,
            conflicts: [],
            resolvedConfig: remoteConfig,
            resolutionStrategy: 'remote',
            resolutionDetails: ['No conflicts detected, using remote configuration'],
        };
    }
    let strategy = 'merged';
    if (options.preferLocal)
        strategy = 'local';
    if (options.preferRemote)
        strategy = 'remote';
    let resolvedConfig;
    switch (strategy) {
        case 'local':
            resolvedConfig = localConfig;
            resolutionDetails.push('Using local configuration (user preference)');
            break;
        case 'remote':
            resolvedConfig = remoteConfig;
            resolutionDetails.push('Using remote configuration (user preference)');
            break;
        case 'merged':
            resolvedConfig = smartMergeConfigs(localConfig, remoteConfig, conflicts, resolutionDetails, options);
            break;
    }
    return {
        hasConflicts: true,
        conflicts,
        resolvedConfig,
        resolutionStrategy: strategy,
        resolutionDetails,
    };
}
function smartMergeConfigs(localConfig, remoteConfig, conflicts, resolutionDetails, options) {
    const resolved = {
        version: Math.max(localConfig.version, remoteConfig.version),
        configs: [...remoteConfig.configs],
        settings: { ...remoteConfig.settings },
    };
    const localConfigMap = new Map(localConfig.configs.map(c => [c.id || c.name.toLowerCase(), c]));
    const resolvedConfigMap = new Map(resolved.configs.map(c => [c.id || c.name.toLowerCase(), c]));
    for (const conflict of conflicts) {
        const localItem = Array.from(localConfigMap.values()).find(c => c.name === conflict.configName);
        const configKey = localItem?.id || conflict.configName.toLowerCase();
        switch (conflict.conflictType) {
            case 'existence':
                if (conflict.localValue === 'exists' && conflict.remoteValue === 'missing') {
                    const localItem = localConfigMap.get(configKey);
                    if (localItem && !localItem.isDeleted) {
                        resolved.configs.push(localItem);
                        resolutionDetails.push(`Added local-only config: ${conflict.configName}`);
                    }
                    else if (localItem?.isDeleted) {
                        resolutionDetails.push(`Respected local deletion of config: ${conflict.configName}`);
                    }
                }
                else if (conflict.localValue === 'missing' && conflict.remoteValue === 'exists') {
                    const localTombstone = localConfigMap.get(configKey);
                    if (localTombstone?.isDeleted) {
                        const remoteConfig = resolvedConfigMap.get(configKey);
                        if (remoteConfig) {
                            remoteConfig.isDeleted = true;
                            remoteConfig.deletedAt = localTombstone.deletedAt;
                            delete remoteConfig.apiKey;
                            delete remoteConfig.authToken;
                            delete remoteConfig.authorization;
                            delete remoteConfig.awsBearerTokenBedrock;
                            resolutionDetails.push(`Applied local deletion to remote config: ${conflict.configName}`);
                        }
                    }
                }
                break;
            case 'value': {
                const resolvedItem = resolvedConfigMap.get(configKey);
                const localItem = localConfigMap.get(configKey);
                if (resolvedItem && localItem) {
                    const resolvedValue = resolveFieldConflict(conflict.field, conflict.localValue, conflict.remoteValue, resolutionDetails, options);
                    resolvedItem[conflict.field] = resolvedValue;
                }
                break;
            }
            case 'order': {
                const resolvedOrderItem = resolvedConfigMap.get(configKey);
                const localOrderItem = localConfigMap.get(configKey);
                if (resolvedOrderItem && localOrderItem && localOrderItem.order !== undefined) {
                    resolvedOrderItem.order = localOrderItem.order;
                    resolutionDetails.push(`Preserved local order for ${conflict.configName}: ${localOrderItem.order}`);
                }
                break;
            }
        }
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    resolved.configs = resolved.configs.filter((config) => {
        if (!config.isDeleted || !config.deletedAt) {
            return true;
        }
        return new Date(config.deletedAt) > thirtyDaysAgo;
    });
    resolved.configs.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order;
        }
        if (a.order !== undefined)
            return -1;
        if (b.order !== undefined)
            return 1;
        return 0;
    });
    return resolved;
}
function resolveFieldConflict(field, localValue, remoteValue, resolutionDetails, options) {
    switch (field) {
        case 'apiKey':
        case 'authToken':
        case 'authorization':
        case 'awsBearerTokenBedrock':
            resolutionDetails.push(`Using local ${field} (security preference)`);
            return localValue;
        case 'isDefault':
            resolutionDetails.push(`Using local default setting for ${field}`);
            return localValue;
        case 'enabled':
            resolutionDetails.push(`Preserving local enabled state: ${localValue}`);
            return localValue;
        case 'transformerEnabled':
            resolutionDetails.push(`Preserving local transformer setting: ${localValue}`);
            return localValue;
        case 'baseUrl':
        case 'model':
            resolutionDetails.push(`Using remote ${field}: ${remoteValue} (newer configuration)`);
            return remoteValue;
        case 'permissionMode':
            resolutionDetails.push(`Preserving local permission mode: ${localValue}`);
            return localValue;
        case 'bashDefaultTimeoutMs':
        case 'bashMaxTimeoutMs':
        case 'bashMaxOutputLength':
        case 'maxOutputTokens':
        case 'claudeCodeMaxRetries':
        case 'maxThinkingTokens':
        case 'mcpTimeout':
        case 'mcpToolTimeout':
        case 'maxMcpOutputTokens': {
            const numericLocal = typeof localValue === 'number' ? localValue : 0;
            const numericRemote = typeof remoteValue === 'number' ? remoteValue : 0;
            const resolved = Math.max(numericLocal, numericRemote);
            resolutionDetails.push(`Using higher ${field}: ${resolved}`);
            return resolved;
        }
        case 'httpProxy':
        case 'httpsProxy': {
            resolutionDetails.push(`Preserving local proxy setting: ${localValue}`);
            return localValue;
        }
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
        case 'claudeCodeDisableExperimentalBetas':
        case 'claudeCodeRetryWatchdog':
        case 'vertexRegionHaiku':
        case 'vertexRegionSonnet':
        case 'vertexRegion37Sonnet':
        case 'vertexRegion40Opus':
        case 'vertexRegion40Sonnet':
        case 'vertexRegion45Sonnet': {
            if (options.verbose) {
                resolutionDetails.push(`Using remote ${String(field)}: ${remoteValue} (newer configuration)`);
            }
            return remoteValue;
        }
        case 'env': {
            const mergedEnv = { ...(remoteValue || {}), ...(localValue || {}) };
            resolutionDetails.push(`Merged env variables with local values taking precedence`);
            return mergedEnv;
        }
        case 'transformerHeaders': {
            const mergedHeaders = { ...(remoteValue || {}), ...(localValue || {}) };
            resolutionDetails.push(`Merged transformer headers with local values taking precedence`);
            return mergedHeaders;
        }
        case 'isDeleted':
            if (localValue && remoteValue) {
                resolutionDetails.push(`Both configs marked as deleted, preserving deletion state`);
                return true;
            }
            if (localValue || remoteValue) {
                resolutionDetails.push(`Preserving deletion state: ${localValue || remoteValue}`);
                return localValue || remoteValue;
            }
            return false;
        case 'deletedAt':
            if (localValue && remoteValue) {
                const localTime = new Date(localValue).getTime();
                const remoteTime = new Date(remoteValue).getTime();
                const resolved = localTime > remoteTime ? localValue : remoteValue;
                resolutionDetails.push(`Using more recent deletion timestamp: ${resolved}`);
                return resolved;
            }
            resolutionDetails.push(`Using deletion timestamp: ${localValue || remoteValue}`);
            return localValue || remoteValue;
        case 'transformer':
            resolutionDetails.push(`Preserving local transformer setting: ${localValue}`);
            return localValue;
        case 'id':
            resolutionDetails.push(`Preserving local ID: ${localValue}`);
            return localValue;
        case 'enabledExtensions': {
            const localExt = localValue || {};
            const remoteExt = remoteValue || {};
            const useGlobalDefaults = localExt.useGlobalDefaults ?? remoteExt.useGlobalDefaults ?? true;
            let overrides;
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
                };
            }
            const mcpServers = useGlobalDefaults ? undefined : [...new Set([...(localExt.mcpServers || []), ...(remoteExt.mcpServers || [])])];
            const skills = useGlobalDefaults ? undefined : [...new Set([...(localExt.skills || []), ...(remoteExt.skills || [])])];
            const subagents = useGlobalDefaults ? undefined : [...new Set([...(localExt.subagents || []), ...(remoteExt.subagents || [])])];
            resolutionDetails.push(`Merged enabled extensions with local preferences taking precedence`);
            return {
                useGlobalDefaults,
                overrides,
                mcpServers,
                skills,
                subagents,
            };
        }
        default: {
            if (options.verbose) {
                resolutionDetails.push(`Using remote ${String(field)}: ${remoteValue} (default merge strategy)`);
            }
            return remoteValue;
        }
    }
}
export function displayConflictResolution(resolution, options = {}) {
    const logger = new UILogger(options.verbose);
    if (!resolution.hasConflicts) {
        logger.displayVerbose('No configuration conflicts detected');
        return;
    }
    logger.displayWarning(`⚠️  Detected ${resolution.conflicts.length} configuration conflicts`);
    if (options.verbose) {
        logger.displayInfo('\n🔍 Conflict Details:');
        for (const conflict of resolution.conflicts) {
            logger.displayInfo(`  • ${conflict.configName}.${conflict.field}: local="${conflict.localValue}" vs remote="${conflict.remoteValue}"`);
        }
    }
    logger.displayInfo(`\n🛠️  Resolution Strategy: ${resolution.resolutionStrategy}`);
    if (options.verbose && resolution.resolutionDetails.length > 0) {
        logger.displayInfo('\n📋 Resolution Details:');
        for (const detail of resolution.resolutionDetails) {
            logger.displayInfo(`  • ${detail}`);
        }
    }
    logger.displayInfo(`\n✅ Conflicts resolved automatically using smart merge strategy`);
}
