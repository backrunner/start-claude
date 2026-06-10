export { GeminiTransformer } from './gemini';
export { OpenaiTransformer } from './openai';
export { OpenAIResponsesTransformer } from './openai-responses';
export { OpenrouterTransformer } from './openrouter';
export const availableTransformers = {
    openai: async () => import('./openai').then(m => m.OpenaiTransformer),
    'openai-responses': async () => import('./openai-responses').then(m => m.OpenAIResponsesTransformer),
    openrouter: async () => import('./openrouter').then(m => m.OpenrouterTransformer),
    gemini: async () => import('./gemini').then(m => m.GeminiTransformer),
};
export async function getTransformer(name) {
    const transformerLoader = availableTransformers[name];
    if (!transformerLoader) {
        throw new Error(`Transformer "${name}" not found`);
    }
    const TransformerClass = await transformerLoader();
    return new TransformerClass();
}
