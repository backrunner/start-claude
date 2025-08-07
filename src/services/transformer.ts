import type { ConfigService } from '../services/config'
import type { Transformer, TransformerConstructor } from '../types/transformer'
import * as Module from 'node:module'
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
    displayVerbose(
      `register transformer: ${name}${transformer.endPoint
        ? ` (endpoint: ${transformer.endPoint})`
        : ' (no endpoint)'
      }`,
      this.verbose,
    )
  }

  getTransformer(name: string): Transformer | TransformerConstructor | undefined {
    return this.transformers.get(name)
  }

  getAllTransformers(): Map<string, Transformer | TransformerConstructor> {
    return new Map(this.transformers)
  }

  getTransformersWithEndpoint(): { name: string, transformer: Transformer }[] {
    const result: { name: string, transformer: Transformer }[] = []
    const entries = Array.from(this.transformers.entries())

    for (const [name, transformer] of entries) {
      if (typeof transformer === 'object' && transformer.endPoint) {
        result.push({ name, transformer })
      }
    }

    return result
  }

  getTransformersWithoutEndpoint(): {
    name: string
    transformer: Transformer
  }[] {
    const result: { name: string, transformer: Transformer }[] = []
    const entries = Array.from(this.transformers.entries())

    for (const [name, transformer] of entries) {
      if (typeof transformer === 'object' && !transformer.endPoint) {
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
      // @ts-expect-error - Monkey patching module loader for dynamic transformer loading
      const originalLoad = Module._load
      // @ts-expect-error - Monkey patching module loader for dynamic transformer loading
      Module._load = function (request: string, _parent: any, _isMain: boolean) {
        if (request === 'claude-code-router') {
          return {
            displayVerbose: (msg: string) => displayVerbose(msg, true),
          }
        }
        return originalLoad.call(Module, request, _parent, _isMain)
      }
      if (config.path) {
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
      // Default transformers can be registered here
      // For now, we'll implement basic OpenAI-compatible transformers
      this.registerTransformer('openai', {
        name: 'openai',
        endPoint: '/v1/chat/completions',
        transformRequestOut: async (request: any) => {
          // Transform OpenAI format to unified format
          return {
            model: request.model || 'gpt-3.5-turbo',
            messages: request.messages || [],
            max_tokens: request.max_tokens,
            temperature: request.temperature,
            top_p: request.top_p,
            stream: request.stream,
            tools: request.tools,
            tool_choice: request.tool_choice,
            stop_sequences: request.stop,
          }
        },
        transformResponseOut: async (response: Response) => {
          return response
        },
      })
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

  // Find transformer by endpoint
  findTransformerByEndpoint(endpoint: string): Transformer | null {
    const entries = Array.from(this.transformers.entries())
    for (const [, transformer] of entries) {
      if (typeof transformer === 'object' && transformer.endPoint === endpoint) {
        return transformer
      }
    }
    return null
  }

  // Find transformer by request path
  findTransformerByPath(path: string): Transformer | null {
    const entries = Array.from(this.transformers.entries())
    for (const [, transformer] of entries) {
      if (typeof transformer === 'object' && transformer.endPoint && path.startsWith(transformer.endPoint)) {
        return transformer
      }
    }
    return null
  }
}
