export { GeminiTransformer } from './gemini'
export { OpenaiTransformer } from './openai'
export { OpenAIResponsesTransformer } from './openai-responses'
export { OpenrouterTransformer } from './openrouter'

// Export all available transformers
export const availableTransformers = {
  openai: async () => import('./openai').then(m => m.OpenaiTransformer),
  'openai-responses': async () => import('./openai-responses').then(m => m.OpenAIResponsesTransformer),
  openrouter: async () => import('./openrouter').then(m => m.OpenrouterTransformer),
  gemini: async () => import('./gemini').then(m => m.GeminiTransformer),
}

// Helper function to get transformer by name
export async function getTransformer(name: string): Promise<InstanceType<any>> {
  const transformerLoader = availableTransformers[name as keyof typeof availableTransformers]
  if (!transformerLoader) {
    throw new Error(`Transformer "${name}" not found`)
  }
  const TransformerClass = await transformerLoader()
  return new TransformerClass()
}
