import type { ConfigService } from '../services/config'

import type { Transformer, TransformerConstructor } from '../types/transformer'
import { displayVerbose } from '../utils/ui'

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
  private verbose: boolean = false

  constructor(private readonly configService: ConfigService, verbose: boolean = false) {
    this.verbose = verbose
  }

  registerTransformer(name: string, transformer: Transformer): void {
    this.transformers.set(name, transformer)
    const domainInfo = transformer.domain ? ` (domain: ${transformer.domain})` : ''
    const defaultInfo = transformer.isDefault ? ' [DEFAULT]' : ''

    displayVerbose(
      `register transformer: ${name}${domainInfo}${defaultInfo}`,
      this.verbose,
    )
  }

  getTransformer(name: string): Transformer | TransformerConstructor | undefined {
    return this.transformers.get(name)
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

        // Temporarily override require for the specific module loading
        module.constructor.prototype.require = function (id: string) {
          if (id === 'claude-code-router') {
            return {
              displayVerbose: (msg: string) => displayVerbose(msg, true),
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
      displayVerbose(`load transformer (${config.path}) error: ${error instanceof Error ? error.message : String(error)}`, this.verbose)
      return false
    }
  }

  async initialize(): Promise<void> {
    try {
      await this.registerDefaultTransformersInternal()
      await this.loadFromConfig()
    }
    catch (error) {
      displayVerbose(`TransformerService init error: ${error instanceof Error ? error.message : String(error)}`, this.verbose)
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

      displayVerbose('Default transformers registered: OpenAI (default), OpenRouter, Gemini', this.verbose)
    }
    catch (error) {
      displayVerbose(`transformer register error: ${error instanceof Error ? error.message : String(error)}`, this.verbose)
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

  // Find transformer by endpoint domain from config baseUrl
  findTransformerByDomain(baseUrl?: string): Transformer | null {
    if (!baseUrl) {
      return null
    }

    try {
      const url = new URL(baseUrl)
      const hostname = url.hostname
      displayVerbose(`Looking for transformer for hostname: ${hostname}`, this.verbose)

      const entries = Array.from(this.transformers.entries())

      // First try to find exact domain match
      for (const [name, transformer] of entries) {
        if (typeof transformer === 'object' && transformer.domain) {
          // Check exact match first
          if (transformer.domain === hostname) {
            displayVerbose(`Found transformer by exact domain match: ${name} for ${hostname}`, this.verbose)
            return transformer
          }

          // Check if hostname contains the transformer domain (for subdomains)
          if (hostname.includes(transformer.domain)) {
            displayVerbose(`Found transformer by domain substring match: ${name} (${transformer.domain}) for ${hostname}`, this.verbose)
            return transformer
          }

          // Check if transformer domain contains hostname (for cases like api.openrouter.ai vs openrouter.ai)
          if (transformer.domain.includes(hostname.replace(/^api\./, ''))) {
            displayVerbose(`Found transformer by root domain match: ${name} (${transformer.domain}) for ${hostname}`, this.verbose)
            return transformer
          }
        }
      }

      // If no domain match found, look for default transformer
      for (const [name, transformer] of entries) {
        if (typeof transformer === 'object' && transformer.isDefault === true) {
          displayVerbose(`Using default transformer: ${name} for ${hostname}`, this.verbose)
          return transformer
        }
      }

      return null
    }
    catch {
      displayVerbose(`Failed to parse baseUrl ${baseUrl} for transformer matching`, this.verbose)
      return null
    }
  }
}
