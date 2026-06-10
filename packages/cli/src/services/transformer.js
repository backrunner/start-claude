import { UILogger } from '../utils/cli/ui';
export class TransformerService {
    configService;
    transformers = new Map();
    logger;
    constructor(configService, verbose = false) {
        this.configService = configService;
        this.logger = new UILogger(verbose);
    }
    registerTransformer(name, transformer) {
        this.transformers.set(name, transformer);
        const domainInfo = transformer.domain ? ` (domain: ${transformer.domain})` : '';
        const defaultInfo = transformer.isDefault ? ' [DEFAULT]' : '';
        this.logger.displayVerbose(`register transformer: ${name}${domainInfo}${defaultInfo}`);
    }
    getTransformer(name) {
        return this.transformers.get(name);
    }
    findTransformerByName(name) {
        const transformer = this.getTransformer(name);
        if (transformer && typeof transformer === 'object') {
            return transformer;
        }
        return null;
    }
    getAllTransformers() {
        return new Map(this.transformers);
    }
    getTransformersWithDomain() {
        const result = [];
        const entries = Array.from(this.transformers.entries());
        for (const [name, transformer] of entries) {
            if (typeof transformer === 'object' && transformer.domain) {
                result.push({ name, transformer });
            }
        }
        return result;
    }
    removeTransformer(name) {
        return this.transformers.delete(name);
    }
    hasTransformer(name) {
        return this.transformers.has(name);
    }
    async registerTransformerFromConfig(config) {
        try {
            if (config.path) {
                const originalRequire = module.constructor.prototype.require;
                module.constructor.prototype.require = (id) => {
                    if (id === 'claude-code-router') {
                        return {
                            displayVerbose: (msg) => this.logger.displayVerbose(msg),
                        };
                    }
                    return originalRequire.call(this, id);
                };
                try {
                    const module = require(require.resolve(config.path));
                    if (module) {
                        const instance = new module(config.options);
                        if (!instance.name) {
                            throw new Error(`Transformer instance from ${config.path} does not have a name property.`);
                        }
                        this.registerTransformer(instance.name, instance);
                        return true;
                    }
                }
                finally {
                    module.constructor.prototype.require = originalRequire;
                }
            }
            return false;
        }
        catch (error) {
            this.logger.displayVerbose(`load transformer (${config.path}) error: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    async initialize() {
        try {
            await this.registerDefaultTransformersInternal();
            await this.loadFromConfig();
        }
        catch (error) {
            this.logger.displayVerbose(`TransformerService init error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async registerDefaultTransformersInternal() {
        try {
            const { OpenaiTransformer } = await import('../transformers/openai');
            const openaiTransformer = new OpenaiTransformer();
            this.registerTransformer('openai', openaiTransformer);
            const { OpenrouterTransformer } = await import('../transformers/openrouter');
            const openrouterTransformer = new OpenrouterTransformer();
            this.registerTransformer('openrouter', openrouterTransformer);
            const { OpenAIResponsesTransformer } = await import('../transformers/openai-responses');
            const openaiResponsesTransformer = new OpenAIResponsesTransformer();
            this.registerTransformer('openai-responses', openaiResponsesTransformer);
            const { GeminiTransformer } = await import('../transformers/gemini');
            const geminiTransformer = new GeminiTransformer();
            this.registerTransformer('gemini', geminiTransformer);
            this.logger.displayVerbose('Default transformers registered: OpenAI (default), OpenAI Responses, OpenRouter, Gemini');
        }
        catch (error) {
            this.logger.displayVerbose(`transformer register error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async loadFromConfig() {
        const transformers = this.configService.get('transformers', []);
        for (const transformer of transformers) {
            await this.registerTransformerFromConfig(transformer);
        }
    }
    findTransformerByDomain(baseUrl, transformerEnabled, transformer) {
        if (transformer && transformer !== 'auto') {
            const specificTransformer = this.findTransformerByName(transformer);
            if (specificTransformer) {
                this.logger.displayVerbose(`Using manually selected transformer: ${transformer}`);
                return specificTransformer;
            }
            else {
                this.logger.displayVerbose(`Manually selected transformer "${transformer}" not found`);
                return null;
            }
        }
        if (!baseUrl) {
            return null;
        }
        try {
            const url = new URL(baseUrl);
            const hostname = url.hostname;
            this.logger.displayVerbose(`Looking for transformer for hostname: ${hostname}`);
            const entries = Array.from(this.transformers.entries());
            for (const [name, transformer] of entries) {
                if (typeof transformer === 'object' && transformer.domain) {
                    if (transformer.domain === hostname) {
                        this.logger.displayVerbose(`Found transformer by exact domain match: ${name} for ${hostname}`);
                        return transformer;
                    }
                    if (hostname.includes(transformer.domain)) {
                        this.logger.displayVerbose(`Found transformer by domain substring match: ${name} (${transformer.domain}) for ${hostname}`);
                        return transformer;
                    }
                    if (transformer.domain.includes(hostname.replace(/^api\./, ''))) {
                        this.logger.displayVerbose(`Found transformer by root domain match: ${name} (${transformer.domain}) for ${hostname}`);
                        return transformer;
                    }
                }
            }
            for (const [name, transformer] of entries) {
                if (typeof transformer === 'object' && transformer.isDefault === true) {
                    this.logger.displayVerbose(`Using default transformer: ${name} for ${hostname}`);
                    return transformer;
                }
            }
            return null;
        }
        catch {
            this.logger.displayVerbose(`Failed to parse baseUrl ${baseUrl} for transformer matching`);
            return null;
        }
    }
    static isTransformerEnabled(transformerEnabled) {
        return transformerEnabled === true;
    }
    static getTransformerType(transformerEnabled) {
        if (typeof transformerEnabled === 'string' && transformerEnabled !== 'true') {
            return transformerEnabled === 'auto' ? 'auto' : transformerEnabled;
        }
        return 'auto';
    }
}
