import type { ConfigService } from '../services/config'

import type { Transformer, TransformerConstructor } from '../types/transformer'
import { UILogger } from '../utils/cli/ui'

interface TransformerConfig {
  transformers: Array<{
    name: string
    type: 'class' | 'module'
    path?: string
    options?: any
  }>
}

export class TransformerService {
  private transformers: Map<string, Transformer | TransformerConstructor> = new Map()
  private logger: UILogger

  constructor(private readonly configService: ConfigService, verbose: boolean = false) {
    this.logger = new UILogger(verbose)
  }

  registerTransformer(name: string, transformer: Transformer): void {
    this.transformers.set(name, transformer)
    const domainInfo = transformer.domain ? ` (domain: ${transformer.domain})` : ''
    const defaultInfo = transformer.isDefault ? ' [DEFAULT]' : ''

    this.logger.displayVerbose(
      `register transformer: ${name}${domainInfo}${defaultInfo}`,
    )
  }

  getTransformer(name: string): Transformer | TransformerConstructor | undefined {
    return this.transformers.get(name)
  }

  findTransformerByName(name: string): Transformer | null {
    const transformer = this.getTransformer(name)
    if (transformer && typeof transformer === 'object') {
      return transformer
    }
    return null
  }

  getAllTransformers(): Map<string, Transformer | TransformerConstructor> {
    return new Map(this.transformers)
  }

  getTransformersWithDomain(): { name: string, transformer: Transformer }[] {
    const result: { name: string, transformer: Transformer }[] = []
    const entries = Array.from(this.transformers.entries())

    for (const [name, transformer] of entries) {
      if (typeof transformer === 'object' && transformer.domain) {
        result.push({ name, transformer })
      }
    }

    return result
  }

  removeTransformer(name: string): boolean {
    return this.transformers.delete(name)
  }

  hasTransformer(name: string): boolean {
    return this.transformers.has(name)
  }

  async registerTransformerFromConfig(config: {
    path?: string
    options?: any
  }): Promise<boolean> {
    try {
      if (config.path) {
        // Use require.cache manipulation instead of Module._load override
        const originalRequire = module.constructor.prototype.require
        const logger = this.logger

        // Temporarily override require for the specific module loading
        module.constructor.prototype.require = function (id: string) {
          if (id === 'claude-code-router') {
            return {
              displayVerbose: (msg: string) => logger.displayVerbose(msg),
            }
          }
          return originalRequire.call(this, id)
        }

        try {
          // eslint-disable-next-line ts/no-require-imports
          const module = require(require.resolve(config.path))
          if (module) {
            // eslint-disable-next-line new-cap
            const instance = new module(config.options)
            if (!instance.name) {
              throw new Error(
                `Transformer instance from ${config.path} does not have a name property.`,
              )
            }
            this.registerTransformer(instance.name, instance)
            return true
          }
        }
        finally {
          // Always restore the original require
          module.constructor.prototype.require = originalRequire
        }
      }
      return false
    }
    catch (error: unknown) {
      this.logger.displayVerbose(`load transformer (${config.path}) error: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  async initialize(): Promise<void> {
    try {
      await this.registerDefaultTransformersInternal()
      await this.loadFromConfig()
    }
    catch (error) {
      this.logger.displayVerbose(`TransformerService init error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async registerDefaultTransformersInternal(): Promise<void> {
    try {
      // Register OpenAI as the default transformer (fallback)
      const { OpenaiTransformer } = await import('../transformers/openai')
      const openaiTransformer = new OpenaiTransformer()
      this.registerTransformer('openai', openaiTransformer)

      // Register OpenRouter transformer
      const { OpenrouterTransformer } = await import('../transformers/openrouter')
      const openrouterTransformer = new OpenrouterTransformer()
      this.registerTransformer('openrouter', openrouterTransformer)

      // Register Gemini transformer
      const { GeminiTransformer } = await import('../transformers/gemini')
      const geminiTransformer = new GeminiTransformer()
      this.registerTransformer('gemini', geminiTransformer)

      this.logger.displayVerbose('Default transformers registered: OpenAI (default), OpenRouter, Gemini')
    }
    catch (error) {
      this.logger.displayVerbose(`transformer register error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async loadFromConfig(): Promise<void> {
    const transformers = this.configService.get<
      TransformerConfig['transformers']
    >('transformers', [])
    for (const transformer of transformers) {
      await this.registerTransformerFromConfig(transformer)
    }
  }

  // Find transformer by endpoint domain from config baseUrl or by manual selection
  findTransformerByDomain(baseUrl?: string, transformerEnabled?: boolean, transformer?: string): Transformer | null {
    // If transformer is explicitly specified and not 'auto', use it directly
    if (transformer && transformer !== 'auto') {
      const specificTransformer = this.findTransformerByName(transformer)
      if (specificTransformer) {
        this.logger.displayVerbose(`Using manually selected transformer: ${transformer}`)
        return specificTransformer
      }
      else {
        this.logger.displayVerbose(`Manually selected transformer "${transformer}" not found`)
        return null // Don't fall back to domain matching if user explicitly specified a transformer
      }
    }

    // Only do domain matching if no transformer was specified or it was set to 'auto'
    if (!baseUrl) {
      return null
    }

    try {
      const url = new URL(baseUrl)
      const hostname = url.hostname
      this.logger.displayVerbose(`Looking for transformer for hostname: ${hostname}`)

      const entries = Array.from(this.transformers.entries())

      // First try to find exact domain match
      for (const [name, transformer] of entries) {
        if (typeof transformer === 'object' && transformer.domain) {
          // Check exact match first
          if (transformer.domain === hostname) {
            this.logger.displayVerbose(`Found transformer by exact domain match: ${name} for ${hostname}`)
            return transformer
          }

          // Check if hostname contains the transformer domain (for subdomains)
          if (hostname.includes(transformer.domain)) {
            this.logger.displayVerbose(`Found transformer by domain substring match: ${name} (${transformer.domain}) for ${hostname}`)
            return transformer
          }

          // Check if transformer domain contains hostname (for cases like api.openrouter.ai vs openrouter.ai)
          if (transformer.domain.includes(hostname.replace(/^api\./, ''))) {
            this.logger.displayVerbose(`Found transformer by root domain match: ${name} (${transformer.domain}) for ${hostname}`)
            return transformer
          }
        }
      }

      // If no domain match found, look for default transformer
      for (const [name, transformer] of entries) {
        if (typeof transformer === 'object' && transformer.isDefault === true) {
          this.logger.displayVerbose(`Using default transformer: ${name} for ${hostname}`)
          return transformer
        }
      }

      return null
    }
    catch {
      this.logger.displayVerbose(`Failed to parse baseUrl ${baseUrl} for transformer matching`)
      return null
    }
  }

  // Helper function to check if transformer is enabled
  static isTransformerEnabled(transformerEnabled?: boolean): boolean {
    return transformerEnabled === true
  }

  // Helper function to get transformer type from config (keeping for backward compatibility)
  static getTransformerType(transformerEnabled?: boolean | string): string | 'auto' {
    if (typeof transformerEnabled === 'string' && transformerEnabled !== 'true') {
      return transformerEnabled === 'auto' ? 'auto' : transformerEnabled
    }
    return 'auto'
  }
}
