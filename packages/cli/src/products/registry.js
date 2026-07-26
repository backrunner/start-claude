const productDefinitions = {
    codex: {
        id: 'codex',
        title: 'Start Codex',
        shortTitle: 'Codex',
        description: 'Manage OpenAI Codex CLI configurations',
        configDirName: '.start-codex',
        nativeConfigDirName: '.codex',
        cliCommand: 'codex',
        packageName: '@openai/codex',
        docsUrl: 'https://developers.openai.com/codex',
        managerPath: '/codex',
        defaultModel: 'gpt-5.6-sol',
        defaultApiKeyEnvVar: 'OPENAI_API_KEY',
        supportsBaseUrl: true,
        supportsSandbox: true,
        authModes: ['api-key', 'oauth'],
    },
    gemini: {
        id: 'gemini',
        title: 'Start Gemini',
        shortTitle: 'Gemini',
        description: 'Manage Google Gemini CLI configurations',
        configDirName: '.start-gemini',
        nativeConfigDirName: '.gemini',
        cliCommand: 'gemini',
        packageName: '@google/gemini-cli',
        docsUrl: 'https://geminicli.com/docs',
        managerPath: '/gemini',
        defaultModel: 'gemini-3-flash-preview',
        defaultApiKeyEnvVar: 'GEMINI_API_KEY',
        supportsBaseUrl: true,
        supportsSandbox: false,
        authModes: ['api-key', 'oauth', 'vertex-ai'],
    },
};
export function getProductDefinition(productId) {
    return productDefinitions[productId];
}
export function isExternalProductId(value) {
    return value === 'codex' || value === 'gemini';
}
export function listProductDefinitions() {
    return Object.values(productDefinitions);
}
