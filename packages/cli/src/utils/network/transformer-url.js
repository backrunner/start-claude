export function createTransformerUrl(path, baseUrl, fallbackBaseUrl) {
    const effectiveBaseUrl = baseUrl || fallbackBaseUrl;
    if (!effectiveBaseUrl) {
        throw new Error('Base URL is required for transformer URL construction');
    }
    const normalizedBaseUrl = `${effectiveBaseUrl.replace(/\/$/, '')}/`;
    return new URL(path, normalizedBaseUrl);
}
