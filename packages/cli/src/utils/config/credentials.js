export function getConfigApiKey(config) {
    const apiKey = config.apiKey?.trim();
    if (apiKey) {
        return apiKey;
    }
    const authToken = config.authToken?.trim();
    return authToken || undefined;
}
export function hasConfigApiCredentials(config) {
    return Boolean(config.baseUrl?.trim() && getConfigApiKey(config));
}
