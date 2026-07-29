export var SpeedTestStrategy;
(function (SpeedTestStrategy) {
    SpeedTestStrategy["ResponseTime"] = "response-time";
    SpeedTestStrategy["HeadRequest"] = "head-request";
    SpeedTestStrategy["Ping"] = "ping";
})(SpeedTestStrategy || (SpeedTestStrategy = {}));
export var LoadBalancerStrategy;
(function (LoadBalancerStrategy) {
    LoadBalancerStrategy["Fallback"] = "Fallback";
    LoadBalancerStrategy["Polling"] = "Polling";
    LoadBalancerStrategy["SpeedFirst"] = "Speed First";
})(LoadBalancerStrategy || (LoadBalancerStrategy = {}));
export function createDefaultBalanceMode() {
    return {
        enableByDefault: false,
        strategy: LoadBalancerStrategy.Fallback,
        healthCheck: {
            enabled: true,
            intervalMs: 30000,
        },
        failedEndpoint: {
            banDurationSeconds: 300,
        },
        speedFirst: {
            responseTimeWindowMs: 300000,
            minSamples: 2,
            speedTestIntervalSeconds: 300,
            speedTestStrategy: SpeedTestStrategy.ResponseTime,
        },
    };
}
export function createDefaultSystemSettings(settings = {}) {
    const defaultBalanceMode = createDefaultBalanceMode();
    const balanceMode = settings.balanceMode;
    const healthCheck = {
        ...defaultBalanceMode.healthCheck,
        ...balanceMode?.healthCheck,
    };
    const failedEndpoint = {
        ...defaultBalanceMode.failedEndpoint,
        ...balanceMode?.failedEndpoint,
    };
    const speedFirst = balanceMode?.speedFirst
        ? {
            ...defaultBalanceMode.speedFirst,
            ...balanceMode.speedFirst,
        }
        : defaultBalanceMode.speedFirst;
    return {
        ...settings,
        overrideClaudeCommand: settings.overrideClaudeCommand ?? false,
        syncClaudeProviderSettings: settings.syncClaudeProviderSettings ?? false,
        enableToolSearch: settings.enableToolSearch ?? false,
        balanceMode: {
            ...defaultBalanceMode,
            ...balanceMode,
            healthCheck,
            failedEndpoint,
            speedFirst,
        },
    };
}
export const CURRENT_CONFIG_VERSION = 3;
export const CURRENT_S3_CONFIG_VERSION = 1;
