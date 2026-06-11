import { Buffer } from 'node:buffer';
import * as http from 'node:http';
import * as https from 'node:https';
import process from 'node:process';
import { PassThrough } from 'node:stream';
import dayjs from 'dayjs';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { LoadBalancerStrategy, SpeedTestStrategy } from '../config/types';
import { ConfigService } from '../services/config';
import { TransformerService } from '../services/transformer';
import { UILogger } from '../utils/cli/ui';
import { getConfigApiKey, hasConfigApiCredentials } from '../utils/config/credentials';
import { fileLogger } from '../utils/logging/file-logger';
import { SpeedTestManager } from '../utils/network/speed-test';
import { calculateTokenCount } from '../utils/token-counter';
import { convertOpenAIResponseToAnthropic, convertOpenAIStreamToAnthropic, isOpenAIFormat } from '../utils/transformer/openai-to-anthropic';
export class ProxyServer {
    ui;
    endpoints = [];
    currentIndex = 0;
    server;
    healthCheckInterval;
    speedTestInterval;
    healthCheckIntervalMs = 30000;
    healthCheckEnabled = true;
    failedEndpointBanDurationSeconds = 300;
    proxyApiKey = 'sk-claude-proxy-server';
    transformerService;
    configService;
    proxyMode;
    enableLoadBalance = false;
    enableTransform = false;
    verbose = false;
    debug = false;
    proxyUrl;
    httpAgent;
    httpsAgent;
    loadBalancerStrategy = LoadBalancerStrategy.Fallback;
    speedFirstConfig = {
        responseTimeWindowMs: 300000,
        minSamples: 2,
        speedTestIntervalSeconds: 300,
        speedTestStrategy: SpeedTestStrategy.ResponseTime,
    };
    speedTestManager;
    constructor(configs, proxyMode, systemSettings, proxyUrl) {
        this.proxyMode = proxyMode || {};
        this.verbose = this.proxyMode.verbose || false;
        this.debug = this.proxyMode.debug || false;
        this.proxyUrl = proxyUrl
            || process.env.HTTPS_PROXY
            || process.env.https_proxy
            || process.env.HTTP_PROXY
            || process.env.http_proxy;
        if (this.debug && !this.verbose) {
            this.verbose = true;
        }
        this.ui = new UILogger(this.verbose);
        if (this.debug) {
            fileLogger.enable();
            fileLogger.info('PROXY', 'Debug logging enabled for proxy server');
            fileLogger.info('PROXY', `Verbose mode: ${this.verbose}`);
        }
        if (this.proxyUrl) {
            this.httpAgent = new HttpProxyAgent(this.proxyUrl);
            this.httpsAgent = new HttpsProxyAgent(this.proxyUrl);
            this.ui.verbose(`Proxy configured: ${this.proxyUrl}`);
            fileLogger.debug('PROXY', `HTTP/HTTPS proxy configured: ${this.proxyUrl}`);
        }
        if (systemSettings?.balanceMode) {
            this.healthCheckIntervalMs = systemSettings.balanceMode.healthCheck?.intervalMs || 30000;
            this.healthCheckEnabled = systemSettings.balanceMode.healthCheck?.enabled !== false;
            this.failedEndpointBanDurationSeconds = systemSettings.balanceMode.failedEndpoint?.banDurationSeconds || 300;
            this.loadBalancerStrategy = systemSettings.balanceMode.strategy || LoadBalancerStrategy.Fallback;
            if (this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst && systemSettings.balanceMode.speedFirst) {
                this.speedFirstConfig = {
                    responseTimeWindowMs: systemSettings.balanceMode.speedFirst.responseTimeWindowMs || 300000,
                    minSamples: systemSettings.balanceMode.speedFirst.minSamples || 3,
                    speedTestIntervalSeconds: systemSettings.balanceMode.speedFirst.speedTestIntervalSeconds || 300,
                    speedTestStrategy: systemSettings.balanceMode.speedFirst.speedTestStrategy || SpeedTestStrategy.ResponseTime,
                };
                this.speedTestManager = SpeedTestManager.fromConfig(this.speedFirstConfig.speedTestStrategy, {
                    timeout: 8000,
                    verbose: this.verbose,
                    debug: this.debug,
                    httpAgent: this.httpAgent,
                    httpsAgent: this.httpsAgent,
                });
            }
        }
        this.configService = new ConfigService();
        this.transformerService = new TransformerService(this.configService, this.verbose);
        this.enableLoadBalance = this.proxyMode.enableLoadBalance || false;
        this.enableTransform = this.proxyMode.enableTransform || false;
        this.ui.verbose(`Initializing proxy server - LoadBalance: ${this.enableLoadBalance}, Transform: ${this.enableTransform}`);
        if (this.enableLoadBalance) {
            const validConfigs = configs.filter((c) => {
                const hasApiCredentials = hasConfigApiCredentials(c);
                const hasTransformerEnabled = 'transformerEnabled' in c && TransformerService.isTransformerEnabled(c.transformerEnabled);
                if (hasTransformerEnabled && !hasApiCredentials) {
                    throw new Error(`Configuration "${c.name}" has transformerEnabled but is missing baseUrl or apiKey/authToken. Transformer configurations must include the real external API credentials (e.g., https://openrouter.ai + real API key).`);
                }
                return hasApiCredentials || hasTransformerEnabled;
            });
            if (validConfigs.length === 0) {
                throw new Error('No configurations found for load balancing (need either API credentials or transformer enabled)');
            }
            this.ui.verbose(`Found ${validConfigs.length} valid configs for load balancing`);
            validConfigs.sort((a, b) => {
                const orderA = a.order ?? 0;
                const orderB = b.order ?? 0;
                return orderA - orderB;
            });
            this.endpoints = validConfigs.map(config => ({
                config,
                isHealthy: true,
                lastCheck: 0,
                failureCount: 0,
                responseTimes: [],
                averageResponseTime: 0,
                totalRequests: 0,
            }));
        }
        else {
            if (this.enableTransform) {
                const transformerConfigs = configs.filter((c) => {
                    const hasTransformerEnabled = 'transformerEnabled' in c && TransformerService.isTransformerEnabled(c.transformerEnabled);
                    const hasApiCredentials = hasConfigApiCredentials(c);
                    if (hasTransformerEnabled && !hasApiCredentials) {
                        throw new Error(`Configuration "${c.name}" has transformerEnabled but is missing baseUrl or apiKey/authToken. Transformer configurations must include the real external API credentials (e.g., https://openrouter.ai + real API key).`);
                    }
                    return hasTransformerEnabled;
                });
                if (transformerConfigs.length > 0) {
                    this.endpoints = transformerConfigs.map(config => ({
                        config,
                        isHealthy: true,
                        lastCheck: 0,
                        failureCount: 0,
                        responseTimes: [],
                        averageResponseTime: 0,
                        totalRequests: 0,
                    }));
                }
                else {
                    throw new Error('No transformer-enabled configurations found. Transformer mode requires at least one configuration with transformerEnabled enabled.');
                }
            }
            else {
                throw new Error('No processing mode enabled. Please enable either load balancing (enableLoadBalance: true) or transformers (enableTransform: true).');
            }
        }
        this.ui.verbose(`Initialized with ${this.endpoints.length} endpoint(s)`);
    }
    async formatUniversalResponse(responseBody, statusCode, headers, res) {
        try {
            if (isOpenAIFormat(responseBody)) {
                try {
                    const openaiResponse = JSON.parse(responseBody);
                    const anthropicResponse = convertOpenAIResponseToAnthropic(openaiResponse);
                    return JSON.stringify(anthropicResponse);
                }
                catch (conversionError) {
                    if (this.debug) {
                        fileLogger.error('OPENAI_CONVERSION_ERROR', 'Failed to convert OpenAI response to Anthropic format', {
                            error: conversionError instanceof Error ? conversionError.message : 'Unknown error',
                            originalBody: responseBody,
                        });
                    }
                }
            }
            if (statusCode >= 400 && !res.headersSent) {
                res.statusCode = statusCode;
            }
            if (!responseBody.trim()) {
                return JSON.stringify({
                    error: {
                        message: 'Empty response from upstream',
                        type: 'empty_response',
                    },
                });
            }
            const parsedBody = JSON.parse(responseBody);
            return JSON.stringify(parsedBody);
        }
        catch (parseError) {
            if (this.debug) {
                fileLogger.error('RESPONSE_FORMAT_ERROR', 'Failed to parse response as JSON', {
                    originalBody: responseBody,
                    statusCode,
                    parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
                });
            }
            return JSON.stringify({
                error: {
                    message: 'Invalid response format from upstream',
                    type: 'format_error',
                    originalResponse: responseBody,
                },
            });
        }
    }
    constructTargetUrl(requestPath, baseUrl) {
        const base = new URL(baseUrl);
        const path = requestPath.replace(/^\/+/, '');
        const baseHref = base.href.endsWith('/') ? base.href : `${base.href}/`;
        const targetUrl = new URL(path, baseHref);
        if (this.debug) {
            fileLogger.debug('URL_CONSTRUCTION', 'Constructed target URL for proxy request', {
                originalBaseUrl: baseUrl,
                requestPath,
                constructedUrl: targetUrl.toString(),
                basePath: base.pathname,
                finalPath: targetUrl.pathname,
            });
        }
        return targetUrl;
    }
    getAgent(isHttps) {
        if (this.proxyUrl) {
            return isHttps ? this.httpsAgent : this.httpAgent;
        }
        return undefined;
    }
    async initialize() {
        if (this.enableTransform) {
            await this.transformerService.initialize();
            this.ui.success('🔧 Transformer service initialized');
        }
    }
    getProxyApiKey() {
        return this.proxyApiKey;
    }
    async startServer(port = 2333) {
        if (this.enableTransform) {
            await this.initialize();
        }
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                void this.handleRequest(req, res);
            });
            this.server.listen(port, () => {
                const features = [];
                if (this.enableLoadBalance) {
                    features.push(`Load Balancer (${this.loadBalancerStrategy})`);
                }
                if (this.enableTransform) {
                    features.push('Transformer');
                }
                const featureText = features.length > 0 ? ` (${features.join(' + ')})` : '';
                this.ui.success(`🚀 Proxy server started on port ${port}${featureText}`);
                if (this.enableLoadBalance && this.healthCheckEnabled) {
                    this.startHealthChecks();
                }
                if (this.enableLoadBalance && this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst) {
                    this.startSpeedTests();
                }
                resolve();
            });
            this.server.on('error', (error) => {
                this.ui.error(`❌ Failed to start proxy server: ${error.message}`);
                reject(error);
            });
        });
    }
    getServerPort() {
        if (!this.server) {
            return undefined;
        }
        const address = this.server.address();
        if (!address || typeof address === 'string') {
            return undefined;
        }
        return address.port;
    }
    async handleSwitchRequest(req, res) {
        try {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                void (async () => {
                    try {
                        const body = Buffer.concat(chunks);
                        const switchRequest = JSON.parse(body.toString());
                        if (!switchRequest.configs || !Array.isArray(switchRequest.configs)) {
                            res.writeHead(400, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*',
                            });
                            res.end(JSON.stringify({
                                error: {
                                    message: 'Invalid switch request: configs array required',
                                    type: 'invalid_request',
                                },
                            }));
                            return;
                        }
                        const result = await this.switchConfigs(switchRequest.configs);
                        if (result.success) {
                            res.writeHead(200, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*',
                            });
                            res.end(JSON.stringify({
                                success: true,
                                message: result.message,
                                healthyEndpoints: result.healthyEndpoints,
                                totalEndpoints: result.totalEndpoints,
                                endpointDetails: result.endpointDetails,
                                speedTestResults: result.speedTestResults,
                            }));
                        }
                        else {
                            res.writeHead(503, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*',
                            });
                            res.end(JSON.stringify({
                                success: false,
                                error: {
                                    message: result.message,
                                    type: 'switch_failed',
                                },
                                endpointDetails: result.endpointDetails,
                            }));
                        }
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        res.writeHead(500, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                        });
                        res.end(JSON.stringify({
                            success: false,
                            error: {
                                message: `Switch request failed: ${errorMessage}`,
                                type: 'internal_error',
                            },
                        }));
                    }
                })();
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            res.writeHead(500, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify({
                success: false,
                error: {
                    message: errorMessage,
                    type: 'internal_error',
                },
            }));
        }
    }
    async handleStatusRequest(req, res) {
        try {
            const status = this.getStatus();
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(status));
            if (this.debug) {
                fileLogger.info('STATUS_REQUEST', 'Proxy status requested', {
                    total: status.total,
                    healthy: status.healthy,
                    unhealthy: status.unhealthy,
                    loadBalance: status.loadBalance,
                    transform: status.transform,
                    strategy: status.strategy,
                });
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (this.debug) {
                fileLogger.error('STATUS_REQUEST_ERROR', 'Failed to get proxy status', {
                    error: errorMessage,
                });
            }
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: `Status request failed: ${errorMessage}`,
                    type: 'internal_error',
                },
            }));
        }
    }
    async handleCountTokensRequest(req, res) {
        try {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                void (async () => {
                    try {
                        const body = Buffer.concat(chunks);
                        const requestBody = JSON.parse(body.toString());
                        const { messages, system, tools } = requestBody;
                        if (!messages || !Array.isArray(messages)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                error: {
                                    message: 'Invalid request: messages array required',
                                    type: 'invalid_request',
                                },
                            }));
                            return;
                        }
                        const tokenCount = calculateTokenCount(messages, system, tools);
                        if (this.debug) {
                            fileLogger.info('COUNT_TOKENS', 'Token count calculated locally', {
                                messageCount: messages.length,
                                hasSystem: !!system,
                                hasTools: !!tools,
                                toolCount: tools?.length || 0,
                                inputTokens: tokenCount,
                            });
                        }
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                        });
                        res.end(JSON.stringify({
                            input_tokens: tokenCount,
                        }));
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        if (this.debug) {
                            fileLogger.error('COUNT_TOKENS_ERROR', 'Failed to calculate token count', {
                                error: errorMessage,
                            });
                        }
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: {
                                message: `Token count calculation failed: ${errorMessage}`,
                                type: 'internal_error',
                            },
                        }));
                    }
                })();
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: errorMessage,
                    type: 'internal_error',
                },
            }));
        }
    }
    async switchConfigs(configs) {
        try {
            const validConfigs = configs.filter((c) => {
                const hasApiCredentials = hasConfigApiCredentials(c);
                const hasTransformerEnabled = 'transformerEnabled' in c && TransformerService.isTransformerEnabled(c.transformerEnabled);
                if (hasTransformerEnabled && !hasApiCredentials) {
                    return false;
                }
                if (this.enableTransform && !this.enableLoadBalance) {
                    return hasTransformerEnabled && hasApiCredentials;
                }
                return hasApiCredentials || hasTransformerEnabled;
            });
            if (validConfigs.length === 0) {
                return {
                    success: false,
                    message: this.enableTransform && !this.enableLoadBalance
                        ? 'No transformer-enabled configurations with complete API credentials provided'
                        : 'No valid configurations provided',
                };
            }
            validConfigs.sort((a, b) => {
                const orderA = a.order ?? 0;
                const orderB = b.order ?? 0;
                return orderA - orderB;
            });
            const newEndpoints = validConfigs.map(config => ({
                config,
                isHealthy: true,
                lastCheck: 0,
                failureCount: 0,
                responseTimes: [],
                averageResponseTime: 0,
                totalRequests: 0,
            }));
            const healthyEndpoints = [];
            const endpointDetails = [];
            const healthCheckPromises = newEndpoints.map(async (endpoint) => {
                const configName = endpoint.config.name || endpoint.config.baseUrl || 'unknown';
                try {
                    await this.performHealthCheckRequest(endpoint, { timeout: 5000, isInitial: true });
                    healthyEndpoints.push(endpoint);
                    endpointDetails.push({ name: configName, healthy: true });
                    return { endpoint, success: true };
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    this.markEndpointUnhealthy(endpoint, errorMessage);
                    endpointDetails.push({ name: configName, healthy: false, error: errorMessage });
                    return { endpoint, success: false, error: errorMessage };
                }
            });
            await Promise.all(healthCheckPromises);
            if (healthyEndpoints.length === 0) {
                return {
                    success: false,
                    message: 'All new endpoints failed health checks',
                    endpointDetails,
                };
            }
            this.endpoints = newEndpoints;
            this.currentIndex = 0;
            let speedTestResults;
            if (this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst && healthyEndpoints.length > 1) {
                const speedTestManager = SpeedTestManager.fromConfig(this.speedFirstConfig.speedTestStrategy, {
                    timeout: 8000,
                    verbose: this.verbose,
                    debug: this.debug,
                    httpAgent: this.httpAgent,
                    httpsAgent: this.httpsAgent,
                });
                try {
                    const endpointConfigs = healthyEndpoints.map(e => e.config);
                    const speedResults = await speedTestManager.testMultipleEndpoints(endpointConfigs);
                    speedTestResults = [];
                    for (const endpoint of healthyEndpoints) {
                        const endpointName = endpoint.config.name || endpoint.config.baseUrl || 'unknown';
                        const result = speedResults.get(endpointName);
                        if (result && result.success) {
                            this.recordResponseTime(endpoint, result.responseTime);
                            speedTestResults.push({ name: endpointName, responseTime: result.responseTime });
                        }
                    }
                    speedTestResults.sort((a, b) => a.responseTime - b.responseTime);
                }
                catch (error) {
                    if (this.debug) {
                        fileLogger.error('SWITCH_SPEED_TEST_ERROR', 'Speed test failed during config switch', {
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                    }
                }
            }
            const healthyCount = this.endpoints.filter(e => e.isHealthy).length;
            const message = `Successfully switched to ${configs.length} new configurations (${healthyCount} healthy)`;
            return {
                success: true,
                message,
                healthyEndpoints: healthyCount,
                totalEndpoints: configs.length,
                endpointDetails,
                speedTestResults,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                message: `Config switch failed: ${errorMessage}`,
            };
        }
    }
    async handleRequest(req, res) {
        try {
            if (this.debug) {
                fileLogger.info('INCOMING_REQUEST', 'Received HTTP request', {
                    method: req.method || 'UNKNOWN',
                    url: req.url || '/',
                    userAgent: req.headers['user-agent'] || 'unknown',
                    contentType: req.headers['content-type'] || 'unknown',
                    origin: req.headers.origin || 'unknown',
                    headers: req.headers,
                });
            }
            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
                    'Access-Control-Max-Age': '86400',
                });
                res.end();
                if (this.debug) {
                    fileLogger.info('CORS_PREFLIGHT', 'Handled CORS preflight request', {
                        method: req.method || 'OPTIONS',
                        origin: req.headers.origin || 'unknown',
                        requestHeaders: req.headers['access-control-request-headers'] || 'none',
                        response: 'CORS preflight response sent',
                    });
                }
                return;
            }
            this.ui.verbose(`Handling ${req.method} ${req.url}`);
            if (req.url === '/__switch' && req.method === 'POST') {
                await this.handleSwitchRequest(req, res);
                return;
            }
            if (req.url === '/__status' && req.method === 'GET') {
                await this.handleStatusRequest(req, res);
                return;
            }
            if (req.url?.includes('/v1/messages/count_tokens') && req.method === 'POST') {
                if (this.enableTransform) {
                    await this.handleCountTokensRequest(req, res);
                    return;
                }
            }
            if (this.enableLoadBalance) {
                const endpoint = this.getNextHealthyEndpoint();
                if (!endpoint) {
                    res.writeHead(503, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: {
                            message: 'All endpoints are currently unavailable',
                            type: 'service_unavailable',
                        },
                    }));
                    return;
                }
                await this.proxyRequest(req, res, endpoint);
            }
            else if (this.enableTransform) {
                const transformerEndpoint = this.endpoints.find(e => 'transformerEnabled' in e.config && TransformerService.isTransformerEnabled(e.config.transformerEnabled));
                if (!transformerEndpoint) {
                    res.writeHead(503, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: {
                            message: 'No transformer-enabled endpoints available',
                            type: 'service_unavailable',
                        },
                    }));
                    return;
                }
                await this.proxyRequest(req, res, transformerEndpoint);
            }
            else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: 'No handler found for this request',
                        type: 'not_found',
                    },
                }));
            }
        }
        catch (error) {
            this.ui.error(`⚠️ Request handling error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            if (this.debug) {
                fileLogger.error('REQUEST_HANDLING_ERROR', 'Exception caught in main request handler', {
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    errorStack: error instanceof Error ? error.stack : undefined,
                    method: req.method || 'UNKNOWN',
                    url: req.url || '/',
                    userAgent: req.headers['user-agent'] || 'unknown',
                    contentType: req.headers['content-type'] || 'unknown',
                    origin: req.headers.origin || 'unknown',
                });
            }
            const errorResponse = {
                error: {
                    message: 'Internal server error',
                    type: 'internal_error',
                },
            };
            if (this.debug) {
                fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 500 error response due to request handling error', {
                    statusCode: 500,
                    errorType: 'internal_error',
                    originalError: error instanceof Error ? error.message : 'Unknown error',
                    responseBody: errorResponse,
                });
            }
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(errorResponse));
        }
    }
    getNextHealthyEndpoint() {
        const now = Date.now();
        const availableEndpoints = this.endpoints.filter((e) => {
            if (!this.healthCheckEnabled && e.bannedUntil) {
                if (now < e.bannedUntil) {
                    return false;
                }
                else {
                    e.isHealthy = true;
                    e.bannedUntil = undefined;
                }
            }
            return e.isHealthy;
        });
        if (availableEndpoints.length === 0) {
            return null;
        }
        if (this.loadBalancerStrategy === LoadBalancerStrategy.Fallback) {
            return this.selectEndpointFallback(availableEndpoints);
        }
        else if (this.loadBalancerStrategy === LoadBalancerStrategy.Polling) {
            return this.selectEndpointPolling(availableEndpoints);
        }
        else if (this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst) {
            return this.selectEndpointSpeedFirst(availableEndpoints);
        }
        else {
            this.ui.warning(`Unknown load balancer strategy: ${String(this.loadBalancerStrategy)}, falling back to Fallback mode`);
            return this.selectEndpointFallback(availableEndpoints);
        }
    }
    selectEndpointFallback(availableEndpoints) {
        const priorityGroups = new Map();
        for (const endpoint of availableEndpoints) {
            const priority = endpoint.config.order ?? 0;
            if (!priorityGroups.has(priority)) {
                priorityGroups.set(priority, []);
            }
            priorityGroups.get(priority).push(endpoint);
        }
        const sortedPriorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);
        const highestPriorityEndpoints = priorityGroups.get(sortedPriorities[0]);
        const endpoint = highestPriorityEndpoints[this.currentIndex % highestPriorityEndpoints.length];
        this.currentIndex = (this.currentIndex + 1) % highestPriorityEndpoints.length;
        return endpoint;
    }
    selectEndpointPolling(availableEndpoints) {
        const endpoint = availableEndpoints[this.currentIndex % availableEndpoints.length];
        this.currentIndex = (this.currentIndex + 1) % availableEndpoints.length;
        return endpoint;
    }
    selectEndpointSpeedFirst(availableEndpoints) {
        const endpointsWithSamples = availableEndpoints.filter(e => e.responseTimes.length >= Math.max(1, this.speedFirstConfig.minSamples));
        if (endpointsWithSamples.length === 0) {
            this.ui.verbose('Speed First: Not enough samples, using round-robin to gather data');
            return this.selectEndpointPolling(availableEndpoints);
        }
        const sortedBySpeed = endpointsWithSamples.sort((a, b) => a.averageResponseTime - b.averageResponseTime);
        this.ui.verbose(`Speed First: Selected fastest endpoint ${sortedBySpeed[0].config.name} (avg: ${sortedBySpeed[0].averageResponseTime}ms, samples: ${sortedBySpeed[0].responseTimes.length})`);
        if (this.debug) {
            fileLogger.info('SPEED_FIRST_SELECTION', `Fastest endpoint selected for request`, {
                selectedEndpoint: sortedBySpeed[0].config.name,
                averageResponseTime: sortedBySpeed[0].averageResponseTime,
                sampleCount: sortedBySpeed[0].responseTimes.length,
                totalRequests: sortedBySpeed[0].totalRequests,
                alternativeEndpoints: sortedBySpeed.slice(1, 3).map(e => ({
                    name: e.config.name,
                    averageResponseTime: e.averageResponseTime,
                    sampleCount: e.responseTimes.length,
                })),
            });
        }
        return sortedBySpeed[0];
    }
    recordResponseTime(endpoint, responseTime) {
        endpoint.responseTimes.push(responseTime);
        endpoint.lastResponseTime = responseTime;
        endpoint.totalRequests++;
        if (endpoint.responseTimes.length > 100) {
            endpoint.responseTimes = endpoint.responseTimes.slice(-50);
        }
        this.updateAverageResponseTime(endpoint);
        if (this.debug) {
            fileLogger.info('RESPONSE_TIME_RECORDED', 'Recorded response time for Speed First strategy', {
                endpointName: endpoint.config.name,
                responseTime,
                sampleCount: endpoint.responseTimes.length,
                newAverage: endpoint.averageResponseTime,
                totalRequests: endpoint.totalRequests,
            });
        }
    }
    updateAverageResponseTime(endpoint) {
        if (endpoint.responseTimes.length === 0) {
            endpoint.averageResponseTime = 0;
            return;
        }
        const sum = endpoint.responseTimes.reduce((acc, time) => acc + time, 0);
        endpoint.averageResponseTime = sum / endpoint.responseTimes.length;
    }
    startRequestTiming() {
        return {
            startTime: Date.now(),
        };
    }
    recordFirstToken(timing) {
        if (!timing.firstTokenTime) {
            timing.firstTokenTime = Date.now();
            timing.duration = timing.firstTokenTime - timing.startTime;
        }
    }
    prepareResponseHeaders(headers) {
        const cleanHeaders = { ...headers };
        delete cleanHeaders.connection;
        delete cleanHeaders['transfer-encoding'];
        return cleanHeaders;
    }
    prepareRequestHeaders(originalHeaders, targetUrl, config) {
        const headers = { ...originalHeaders };
        headers['x-api-key'] = getConfigApiKey(config);
        delete headers.authorization;
        if (config.authorization && config.authorization.trim().length > 0) {
            headers.authorization = config.authorization.trim();
        }
        else if (config.authToken && config.authToken.trim().length > 0) {
            headers.authorization = `Bearer ${config.authToken.trim()}`;
        }
        if (config.customHeaders && config.customHeaders.trim().length > 0) {
            const customHeaderLines = config.customHeaders.trim().split('\n');
            for (const line of customHeaderLines) {
                const trimmedLine = line.trim();
                if (trimmedLine.length === 0)
                    continue;
                const colonIndex = trimmedLine.indexOf(':');
                if (colonIndex > 0) {
                    const headerName = trimmedLine.substring(0, colonIndex).trim().toLowerCase();
                    const headerValue = trimmedLine.substring(colonIndex + 1).trim();
                    if (headerName && headerValue) {
                        headers[headerName] = headerValue;
                    }
                }
            }
        }
        headers.host = targetUrl.host;
        delete headers.connection;
        delete headers['proxy-connection'];
        delete headers['transfer-encoding'];
        delete headers.upgrade;
        return headers;
    }
    prepareTransformerRequestHeaders(baseHeaders, transformerHeaders, requestBody, userAgent) {
        const overrideHeaders = transformerHeaders || {};
        const hasOverrideAuth = Object.entries(overrideHeaders).some(([key, value]) => key.toLowerCase() === 'authorization' && Boolean(value));
        const hasOverrideApiKey = Object.entries(overrideHeaders).some(([key, value]) => key.toLowerCase() === 'x-api-key' && Boolean(value));
        const headers = {};
        for (const [key, value] of Object.entries(baseHeaders)) {
            if ((hasOverrideAuth || hasOverrideApiKey) && key.toLowerCase() === 'authorization') {
                continue;
            }
            headers[key] = value;
        }
        Object.assign(headers, overrideHeaders, {
            'Content-Length': Buffer.byteLength(requestBody).toString(),
            'User-Agent': userAgent || 'start-claude-proxy',
        });
        const hasExplicitAuth = Object.entries(headers).some(([key, value]) => key.toLowerCase() === 'authorization' && Boolean(value));
        const hasApiKey = Object.entries(headers).some(([key, value]) => key.toLowerCase() === 'x-api-key' && Boolean(value));
        if (hasExplicitAuth || hasApiKey) {
            this.removeAuthorizationHeaderValue(headers, 'Bearer undefined');
        }
        return headers;
    }
    responseHeadersToRecord(headers) {
        const result = {};
        headers.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }
    removeHeader(headers, headerName) {
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === headerName) {
                delete headers[key];
            }
        }
    }
    removeAuthorizationHeaderValue(headers, valueToRemove) {
        for (const [key, value] of Object.entries(headers)) {
            if (key.toLowerCase() === 'authorization' && value === valueToRemove) {
                delete headers[key];
            }
        }
    }
    detectOpenAIChatSSE(buffer) {
        const normalizedBuffer = buffer.replace(/\r\n/g, '\n');
        if (/^event:\s*(message_start|content_block_start|content_block_delta|content_block_stop|message_delta|message_stop|error)$/m.test(normalizedBuffer)) {
            return false;
        }
        let sawDone = false;
        for (const line of normalizedBuffer.split('\n')) {
            if (!line.startsWith('data:')) {
                continue;
            }
            const data = line.slice(5).trim();
            if (!data) {
                continue;
            }
            if (data === '[DONE]') {
                sawDone = true;
                continue;
            }
            try {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed.choices) || parsed.error) {
                    return true;
                }
                if (typeof parsed.type === 'string') {
                    if (parsed.type === 'message_start'
                        || parsed.type === 'message_delta'
                        || parsed.type === 'message_stop'
                        || parsed.type.startsWith('content_block_')) {
                        return false;
                    }
                }
            }
            catch {
            }
        }
        return sawDone ? true : null;
    }
    async isOpenAIChatSSEStream(stream) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let bytesRead = 0;
        try {
            while (bytesRead < 16384) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                bytesRead += value.byteLength;
                buffer += decoder.decode(value, { stream: true });
                const detected = this.detectOpenAIChatSSE(buffer);
                if (detected !== null) {
                    return detected;
                }
            }
            return this.detectOpenAIChatSSE(buffer) === true;
        }
        finally {
            void reader.cancel().catch(() => undefined);
            reader.releaseLock();
        }
    }
    async createTransformerResponseStream(response, fallbackStream) {
        const responseBody = response.body || fallbackStream;
        const [sniffStream, outputStream] = responseBody.tee();
        if (await this.isOpenAIChatSSEStream(sniffStream)) {
            return convertOpenAIStreamToAnthropic(outputStream);
        }
        return outputStream;
    }
    prepareTransformedBodyHeaders(headers, body) {
        const finalHeaders = { ...headers };
        this.removeHeader(finalHeaders, 'content-encoding');
        this.removeHeader(finalHeaders, 'content-length');
        finalHeaders['Content-Length'] = Buffer.byteLength(body).toString();
        return finalHeaders;
    }
    prepareTransformedStreamHeaders(headers) {
        const finalHeaders = { ...headers };
        this.removeHeader(finalHeaders, 'content-encoding');
        this.removeHeader(finalHeaders, 'content-length');
        return finalHeaders;
    }
    async applyTransformerFormatResponse(response, context) {
        if (!context.isTransformer || !context.transformer?.formatResponse) {
            return response;
        }
        try {
            const transformedResponse = await context.transformer.formatResponse(response);
            if (this.debug) {
                fileLogger.info('TRANSFORM_RESPONSE_OUTPUT', 'Response transformed by formatResponse', {
                    transformerName: context.transformerName,
                    statusCode: transformedResponse.status,
                });
            }
            return transformedResponse;
        }
        catch (transformError) {
            if (this.debug) {
                fileLogger.error('TRANSFORM_RESPONSE_ERROR', 'Failed to transform response with formatResponse', {
                    transformerName: context.transformerName,
                    statusCode: response.status,
                    error: transformError instanceof Error ? transformError.message : 'Unknown error',
                });
            }
            return response;
        }
    }
    async handleHttpErrorResponse(proxyRes, res, endpoint, req, body, requestData, context = {}) {
        if (!proxyRes.statusCode || proxyRes.statusCode < 400) {
            return false;
        }
        const statusCode = proxyRes.statusCode;
        const errorMessage = `HTTP ${statusCode}`;
        const pathWithoutQuery = req.url?.split('?')[0].replace(/\/+$/, '');
        const isMainMessagesEndpoint = pathWithoutQuery === '/v1/messages';
        if (!isMainMessagesEndpoint) {
            if (this.debug) {
                fileLogger.info('NON_MAIN_ENDPOINT_ERROR', 'Non-main endpoint error from upstream (not marking endpoint unhealthy)', {
                    endpointName: endpoint.config.name,
                    requestUrl: req.url,
                    pathWithoutQuery,
                    statusCode,
                });
            }
            return false;
        }
        if (this.endpoints.length === 1) {
            return false;
        }
        this.markEndpointUnhealthy(endpoint, errorMessage);
        const shouldRetry = (statusCode >= 404 && statusCode <= 499) || statusCode >= 500;
        if (shouldRetry && this.enableLoadBalance && !res.headersSent) {
            const nextEndpoint = this.getNextHealthyEndpoint();
            if (nextEndpoint && nextEndpoint !== endpoint) {
                const endpointType = context.isTransformer ? `transformer ${endpoint.config.name}` : endpoint.config.name;
                this.ui.verbose(`HTTP ${statusCode} from ${endpointType}, retrying with ${nextEndpoint.config.name}`);
                if (this.debug) {
                    fileLogger.info('HTTP_ERROR_RETRY', `Retrying ${context.isTransformer ? 'transformer' : 'regular'} request due to HTTP error from endpoint`, {
                        statusCode,
                        failedEndpoint: endpoint.config.name,
                        retryEndpoint: nextEndpoint.config.name,
                        ...(context.transformerName ? { transformerName: context.transformerName } : {}),
                        loadBalancerStrategy: this.loadBalancerStrategy,
                    });
                }
                if (context.isTransformer) {
                    void this.proxyRequest(req, res, nextEndpoint);
                }
                else {
                    void this.retryRequest(req.method || 'GET', req.url || '/', { ...req.headers }, body, res, nextEndpoint, Boolean(requestData.stream));
                }
                return true;
            }
        }
        return false;
    }
    async processResponseStream(proxyRes, res, endpoint, requestTiming, context = {}) {
        const initialResponseHeaders = this.prepareResponseHeaders(proxyRes.headers);
        if (requestTiming) {
            proxyRes.once('data', () => {
                this.recordFirstToken(requestTiming);
                if (requestTiming.duration !== undefined) {
                    this.recordResponseTime(endpoint, requestTiming.duration);
                }
            });
        }
        const isSSE = this.isStreamingResponse(proxyRes.headers);
        if (isSSE && context.isTransformer) {
            await this.handleDirectStreamConversion(proxyRes, res, initialResponseHeaders, context);
        }
        else if (isSSE && !context.isTransformer) {
            await this.handleDirectStreamPassthrough(proxyRes, res, initialResponseHeaders);
        }
        else {
            await this.handleBufferedResponse(proxyRes, res, initialResponseHeaders, context, endpoint);
        }
        if (proxyRes.statusCode && proxyRes.statusCode < 400) {
            this.markEndpointHealthy(endpoint);
        }
    }
    isStreamingResponse(headers) {
        const contentType = headers['content-type'] || headers['Content-Type'] || '';
        return contentType.includes('text/event-stream');
    }
    async handleDirectStreamPassthrough(proxyRes, res, headers) {
        try {
            if (!res.headersSent) {
                const finalHeaders = {
                    ...headers,
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                };
                res.writeHead(proxyRes.statusCode || 200, finalHeaders);
            }
            proxyRes.pipe(res);
            if (this.debug) {
                fileLogger.info('SSE_PASSTHROUGH', 'Streaming SSE response directly to client (transparent proxy)', {
                    statusCode: proxyRes.statusCode || 200,
                    contentType: headers['content-type'],
                });
            }
        }
        catch (error) {
            if (this.debug) {
                fileLogger.error('SSE_PASSTHROUGH_ERROR', 'Error during SSE stream passthrough', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: 'SSE streaming error',
                        type: 'stream_error',
                    },
                }));
            }
        }
    }
    async handleDirectStreamConversion(proxyRes, res, headers, context) {
        try {
            const incomingStream = new ReadableStream({
                start(controller) {
                    proxyRes.on('data', (chunk) => {
                        controller.enqueue(new Uint8Array(chunk));
                    });
                    proxyRes.on('end', () => {
                        controller.close();
                    });
                    proxyRes.on('error', (error) => {
                        controller.error(error);
                    });
                },
            });
            const responseForTransformation = new Response(incomingStream, {
                status: proxyRes.statusCode || 200,
                statusText: proxyRes.statusMessage || 'OK',
                headers: proxyRes.headers,
            });
            const formattedResponse = await this.applyTransformerFormatResponse(responseForTransformation, {
                isTransformer: true,
                transformer: context.transformer,
                transformerName: context.transformerName,
            });
            const formattedHeaders = {
                ...headers,
                ...this.responseHeadersToRecord(formattedResponse.headers),
            };
            const convertedStream = await this.createTransformerResponseStream(formattedResponse, incomingStream);
            if (!res.headersSent) {
                const finalHeaders = this.prepareTransformedStreamHeaders({
                    ...formattedHeaders,
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                });
                res.writeHead(formattedResponse.status || proxyRes.statusCode || 200, finalHeaders);
            }
            const reader = convertedStream.getReader();
            const decoder = new TextDecoder();
            try {
                let chunkCount = 0;
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    chunkCount++;
                    res.write(decoder.decode(value));
                    if (this.debug && chunkCount <= 5) {
                        fileLogger.debug('STREAMING_CHUNK', `Streaming chunk ${chunkCount}`, {
                            transformerName: context.transformerName,
                            chunkSize: value.length,
                            content: decoder.decode(value).substring(0, 200),
                        });
                    }
                }
                if (this.debug) {
                    fileLogger.info('STREAMING_COMPLETE', 'Direct stream conversion completed', {
                        transformerName: context.transformerName,
                        totalChunks: chunkCount,
                    });
                }
            }
            finally {
                reader.releaseLock();
                res.end();
            }
        }
        catch (error) {
            if (this.debug) {
                fileLogger.error('DIRECT_STREAM_ERROR', 'Direct streaming conversion failed', {
                    transformerName: context.transformerName,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
            await this.handleBufferedResponse(proxyRes, res, headers, context, null);
        }
    }
    async handleBufferedResponse(proxyRes, res, headers, context, endpoint) {
        let rawResponseBody = '';
        const passThrough = new PassThrough();
        passThrough.on('data', (chunk) => {
            rawResponseBody += chunk.toString();
        });
        passThrough.on('end', () => {
            void (async () => {
                try {
                    let finalResponseBody = rawResponseBody;
                    let finalResponseHeaders = { ...headers };
                    if (context.isTransformer && context.transformer?.formatResponse) {
                        const responseForTransformation = new Response(rawResponseBody, {
                            status: proxyRes.statusCode || 200,
                            statusText: proxyRes.statusMessage || 'OK',
                            headers: proxyRes.headers,
                        });
                        const transformedResponse = await this.applyTransformerFormatResponse(responseForTransformation, context);
                        finalResponseBody = await transformedResponse.text();
                        finalResponseHeaders = {
                            ...finalResponseHeaders,
                            ...this.responseHeadersToRecord(transformedResponse.headers),
                        };
                    }
                    let formattedFinalResponseBody = finalResponseBody;
                    if (context.isTransformer) {
                        const formatted = await this.formatUniversalResponse(finalResponseBody, proxyRes.statusCode || 200, finalResponseHeaders, res);
                        if (formatted === null) {
                            fileLogger.error('RESPONSE_FORMAT_ERROR', 'Unexpected null response from formatUniversalResponse', {
                                statusCode: proxyRes.statusCode || 200,
                                bodySize: finalResponseBody.length,
                            });
                            return;
                        }
                        formattedFinalResponseBody = formatted;
                    }
                    if (this.debug && endpoint) {
                        const logType = context.isTransformer ? 'EXTERNAL_API_RESPONSE' : 'REGULAR_API_RESPONSE';
                        const logMessage = context.isTransformer ? 'Raw response from external API' : 'Raw response from external API (direct proxy)';
                        fileLogger.info(logType, logMessage, {
                            ...(context.transformerName ? { transformerName: context.transformerName } : {}),
                            ...(context.provider ? { targetProvider: context.provider.name } : {}),
                            endpointName: endpoint.config.name,
                            targetUrl: context.targetUrl?.toString() || endpoint.config.baseUrl,
                            statusCode: proxyRes.statusCode || 0,
                            body: rawResponseBody,
                            formattedBody: formattedFinalResponseBody,
                        });
                    }
                    if (context.clientExpectsStream && formattedFinalResponseBody) {
                        const sseHeaders = this.prepareTransformedStreamHeaders({
                            ...finalResponseHeaders,
                            'Content-Type': 'text/event-stream',
                            'Cache-Control': 'no-cache',
                            'Connection': 'keep-alive',
                        });
                        if (!res.headersSent) {
                            res.writeHead(proxyRes.statusCode || 200, sseHeaders);
                        }
                        res.write(`data: ${formattedFinalResponseBody}\n\n`);
                        res.write(`data: [DONE]\n\n`);
                        res.end();
                        if (this.debug) {
                            fileLogger.info('STREAM_CONVERSION', 'Converted regular response to SSE format for streaming client', {
                                ...(context.transformerName ? { transformerName: context.transformerName } : {}),
                                statusCode: proxyRes.statusCode || 200,
                                bodySize: formattedFinalResponseBody.length,
                            });
                        }
                        return;
                    }
                    if (!res.headersSent) {
                        res.writeHead(proxyRes.statusCode || 200, context.isTransformer
                            ? this.prepareTransformedBodyHeaders(finalResponseHeaders, formattedFinalResponseBody)
                            : finalResponseHeaders);
                    }
                    res.end(formattedFinalResponseBody);
                }
                catch (error) {
                    if (this.debug) {
                        fileLogger.error('RESPONSE_PROCESSING_ERROR', 'Error processing response', {
                            ...(context.transformerName ? { transformerName: context.transformerName } : {}),
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                    }
                    if (!context.isTransformer) {
                        if (!res.headersSent) {
                            res.writeHead(proxyRes.statusCode || 200, headers);
                        }
                        res.end(rawResponseBody);
                        return;
                    }
                    const formattedFallbackResponse = await this.formatUniversalResponse(rawResponseBody, proxyRes.statusCode || 200, headers, res);
                    if (!res.headersSent) {
                        res.writeHead(proxyRes.statusCode || 200, headers);
                    }
                    res.end(formattedFallbackResponse);
                }
            })();
        });
        proxyRes.pipe(passThrough);
    }
    async proxyRequest(req, res, endpoint) {
        const requestTiming = this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst ? this.startRequestTiming() : null;
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            void (async () => {
                try {
                    const body = Buffer.concat(chunks);
                    let requestData = {};
                    let bodyText;
                    if (body.length > 0) {
                        try {
                            bodyText = body.toString();
                            requestData = JSON.parse(bodyText);
                            if (this.debug) {
                                fileLogger.info('INCOMING_REQUEST', 'Received request body for transformation', {
                                    bodySize: body.length,
                                    model: requestData.model,
                                    messageCount: requestData.messages?.length || 0,
                                    hasTools: requestData.tools ? requestData.tools.length : 0,
                                    body: requestData,
                                });
                            }
                        }
                        catch {
                            this.ui.verbose('Could not parse request JSON for transformer check');
                            if (this.debug) {
                                fileLogger.info('REQUEST_PARSE_ERROR', 'Received non-JSON request body', {
                                    bodySize: body.length,
                                    contentType: req.headers['content-type'] || 'unknown',
                                    body: bodyText || body.toString(),
                                });
                            }
                        }
                    }
                    if (this.enableTransform && 'transformerEnabled' in endpoint.config && TransformerService.isTransformerEnabled(endpoint.config.transformerEnabled)) {
                        this.ui.verbose(`Checking for transformer for endpoint: ${endpoint.config.baseUrl}`);
                        const transformer = this.transformerService.findTransformerByDomain(endpoint.config.baseUrl, endpoint.config.transformerEnabled, endpoint.config.transformer);
                        if (transformer) {
                            const transformerName = Array.from(this.transformerService.getAllTransformers().entries())
                                .find(([, t]) => t === transformer)?.[0] || 'unknown';
                            this.ui.verbose(`Found transformer for domain ${endpoint.config.baseUrl}: ${transformerName}`);
                            const provider = {
                                name: endpoint.config.name || 'unknown',
                                baseUrl: endpoint.config.baseUrl || `https://${transformer.domain}`,
                                apiKey: getConfigApiKey(endpoint.config) || '',
                                model: endpoint.config.model || '',
                            };
                            if (!provider.baseUrl || !provider.apiKey) {
                                throw new Error(`Transformer-enabled endpoint "${endpoint.config.name}" requires both baseUrl and apiKey/authToken for the external API`);
                            }
                            if (!transformer.normalizeRequest) {
                                throw new Error(`Transformer ${transformerName} is missing normalizeRequest method`);
                            }
                            const normalizeResult = await transformer.normalizeRequest(requestData, provider);
                            let finalRequest = normalizeResult.body;
                            if (transformer.formatRequest) {
                                finalRequest = await transformer.formatRequest(normalizeResult.body);
                                this.ui.verbose(`Request formatted by ${transformer.domain || 'transformer'}`);
                                if (this.debug) {
                                    fileLogger.logTransform('FORMAT_REQUEST', transformerName, normalizeResult.body, finalRequest);
                                }
                            }
                            else {
                                this.ui.verbose(`Request normalized by ${transformer.domain || 'transformer'}`);
                                if (this.debug) {
                                    fileLogger.logTransform('NORMALIZE_REQUEST', transformerName, requestData, finalRequest);
                                }
                            }
                            const requestBody = JSON.stringify(finalRequest);
                            if (this.debug) {
                                fileLogger.info('TRANSFORM_COMPLETE', 'Request transformation completed', {
                                    transformerName,
                                    originalModel: requestData.model,
                                    targetProvider: provider.name,
                                    bodySize: requestBody.length,
                                    body: finalRequest,
                                });
                            }
                            const targetUrl = normalizeResult.config.url;
                            const headers = this.prepareTransformerRequestHeaders(normalizeResult.config.headers, endpoint.config.transformerHeaders, requestBody, req.headers['user-agent']);
                            if (this.debug) {
                                fileLogger.info('OUTBOUND_REQUEST', 'Sending transformed request to external API', {
                                    transformerName,
                                    targetProvider: provider.name,
                                    originalUrl: req.url,
                                    transformerUrl: targetUrl.toString(),
                                    method: req.method || 'POST',
                                    headers,
                                    body: finalRequest,
                                });
                            }
                            const isHttps = targetUrl.protocol === 'https:';
                            const httpModule = isHttps ? https : http;
                            const options = {
                                method: req.method || 'POST',
                                headers,
                                timeout: 30000,
                                agent: this.getAgent(isHttps),
                            };
                            const proxyReq = httpModule.request(targetUrl, options, (proxyRes) => {
                                void (async () => {
                                    if (this.debug) {
                                        fileLogger.info('TRANSFORM_RESPONSE', 'Received response from external API via transformer', {
                                            statusCode: proxyRes.statusCode || 0,
                                            statusMessage: proxyRes.statusMessage || 'Unknown',
                                            transformerName,
                                            targetProvider: provider.name,
                                            targetUrl: targetUrl.toString(),
                                            headers: proxyRes.headers,
                                        });
                                    }
                                    const wasHandled = await this.handleHttpErrorResponse(proxyRes, res, endpoint, req, body, requestData, {
                                        isTransformer: true,
                                        transformerName,
                                    });
                                    if (wasHandled) {
                                        return;
                                    }
                                    void this.processResponseStream(proxyRes, res, endpoint, requestTiming, {
                                        isTransformer: true,
                                        transformer,
                                        transformerName,
                                        provider,
                                        targetUrl,
                                        clientExpectsStream: Boolean(requestData.stream),
                                    });
                                })();
                            });
                            proxyReq.on('error', (error) => {
                                this.markEndpointUnhealthy(endpoint, error.message);
                                if (this.debug) {
                                    fileLogger.error('TRANSFORM_REQUEST_FAILED', `External API request failed via transformer`, {
                                        transformerName,
                                        targetProvider: provider.name,
                                        targetUrl: targetUrl.toString(),
                                        errorMessage: error.message,
                                        endpointName: endpoint.config.name,
                                    });
                                }
                                if (!res.headersSent) {
                                    const errorResponse = {
                                        error: {
                                            message: `Transformer proxy request failed: ${error.message}`,
                                            type: 'proxy_error',
                                        },
                                    };
                                    if (this.debug) {
                                        fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 502 error response due to transformer request failure', {
                                            statusCode: 502,
                                            errorType: 'proxy_error',
                                            transformerName,
                                            targetProvider: provider.name,
                                            targetUrl: targetUrl.toString(),
                                            originalError: error.message,
                                            endpointName: endpoint.config.name,
                                            responseBody: errorResponse,
                                        });
                                    }
                                    res.writeHead(502, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify(errorResponse));
                                }
                            });
                            proxyReq.on('timeout', () => {
                                this.markEndpointUnhealthy(endpoint, 'Request timeout');
                                if (this.debug) {
                                    fileLogger.error('TRANSFORM_REQUEST_TIMEOUT', 'Transformer request timed out', {
                                        transformerName,
                                        targetProvider: provider.name,
                                        targetUrl: targetUrl.toString(),
                                        endpointName: endpoint.config.name,
                                        timeoutMs: 30000,
                                    });
                                }
                                proxyReq.destroy();
                                if (!res.headersSent) {
                                    const errorResponse = {
                                        error: {
                                            message: 'Request timeout',
                                            type: 'timeout_error',
                                        },
                                    };
                                    if (this.debug) {
                                        fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 504 error response due to timeout', {
                                            statusCode: 504,
                                            errorType: 'timeout_error',
                                            transformerName,
                                            targetProvider: provider.name,
                                            responseBody: errorResponse,
                                        });
                                    }
                                    res.writeHead(504, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify(errorResponse));
                                }
                            });
                            proxyReq.write(requestBody);
                            proxyReq.end();
                            return;
                        }
                    }
                    if (!hasConfigApiCredentials(endpoint.config)) {
                        this.ui.verbose(`Endpoint ${endpoint.config.name} has no API credentials, skipping`);
                        this.markEndpointUnhealthy(endpoint, 'Missing API credentials');
                        const nextEndpoint = this.getNextHealthyEndpoint();
                        if (nextEndpoint && nextEndpoint !== endpoint) {
                            this.ui.verbose(`Retrying with next endpoint: ${nextEndpoint.config.name}`);
                            void this.retryRequest(req.method || 'GET', req.url || '/', { ...req.headers }, body, res, nextEndpoint, Boolean(requestData.stream));
                            return;
                        }
                        res.writeHead(503, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: {
                                message: 'No endpoints with API credentials available',
                                type: 'service_unavailable',
                            },
                        }));
                        return;
                    }
                    const targetUrl = this.constructTargetUrl(req.url || '/', endpoint.config.baseUrl || '');
                    const headers = this.prepareRequestHeaders(req.headers, targetUrl, endpoint.config);
                    const isHttps = targetUrl.protocol === 'https:';
                    const httpModule = isHttps ? https : http;
                    const options = {
                        method: req.method,
                        headers,
                        timeout: 30000,
                        agent: this.getAgent(isHttps),
                    };
                    const proxyReq = httpModule.request(targetUrl, options, (proxyRes) => {
                        void (async () => {
                            if (this.debug) {
                                fileLogger.info('REGULAR_RESPONSE', 'Received response from external API (direct proxy)', {
                                    statusCode: proxyRes.statusCode || 0,
                                    statusMessage: proxyRes.statusMessage || 'Unknown',
                                    endpointName: endpoint.config.name,
                                    targetUrl: targetUrl.toString(),
                                    headers: proxyRes.headers,
                                });
                            }
                            const wasHandled = await this.handleHttpErrorResponse(proxyRes, res, endpoint, req, body, requestData, {
                                isTransformer: false,
                            });
                            if (wasHandled) {
                                return;
                            }
                            void this.processResponseStream(proxyRes, res, endpoint, requestTiming, {
                                isTransformer: false,
                                targetUrl,
                                clientExpectsStream: Boolean(requestData.stream),
                            });
                        })();
                    });
                    proxyReq.on('error', (error) => {
                        this.markEndpointUnhealthy(endpoint, error.message);
                        if (this.debug) {
                            fileLogger.error('REGULAR_REQUEST_FAILED', `Direct proxy request failed`, {
                                targetUrl: targetUrl.toString(),
                                endpointName: endpoint.config.name,
                                errorMessage: error.message,
                                method: req.method || 'GET',
                            });
                        }
                        if (!res.headersSent) {
                            const retryEndpoint = this.getNextHealthyEndpoint();
                            if (retryEndpoint && retryEndpoint !== endpoint) {
                                void this.retryRequest(req.method || 'GET', req.url || '/', { ...req.headers }, body, res, retryEndpoint, Boolean(requestData.stream));
                                return;
                            }
                            res.writeHead(502, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                error: {
                                    message: `Upstream server error: ${error.message}`,
                                    type: 'upstream_error',
                                },
                            }));
                        }
                    });
                    proxyReq.on('timeout', () => {
                        this.markEndpointUnhealthy(endpoint, 'Request timeout');
                        if (this.debug) {
                            fileLogger.error('REGULAR_REQUEST_TIMEOUT', 'Regular proxy request timed out', {
                                targetUrl: targetUrl.toString(),
                                endpointName: endpoint.config.name,
                                timeoutMs: 30000,
                                method: req.method || 'GET',
                            });
                        }
                        proxyReq.destroy();
                        if (!res.headersSent) {
                            const errorResponse = {
                                error: {
                                    message: 'Request timeout',
                                    type: 'timeout_error',
                                },
                            };
                            if (this.debug) {
                                fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 504 error response due to timeout', {
                                    statusCode: 504,
                                    errorType: 'timeout_error',
                                    endpointName: endpoint.config.name,
                                    targetUrl: targetUrl.toString(),
                                    responseBody: errorResponse,
                                });
                            }
                            res.writeHead(504, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(errorResponse));
                        }
                    });
                    if (body.length > 0) {
                        proxyReq.write(body);
                    }
                    proxyReq.end();
                }
                catch (error) {
                    this.markEndpointUnhealthy(endpoint, error instanceof Error ? error.message : 'Unknown error');
                    if (this.debug) {
                        fileLogger.error('PROXY_REQUEST_EXCEPTION', 'Exception caught during proxy request processing', {
                            errorMessage: error instanceof Error ? error.message : 'Unknown error',
                            errorStack: error instanceof Error ? error.stack : undefined,
                            endpointName: endpoint.config.name,
                            endpointUrl: endpoint.config.baseUrl,
                            method: req.method || 'UNKNOWN',
                            url: req.url || '/',
                            hasTransformer: this.enableTransform && 'transformerEnabled' in endpoint.config && TransformerService.isTransformerEnabled(endpoint.config.transformerEnabled),
                        });
                    }
                    if (!res.headersSent) {
                        const errorResponse = {
                            error: {
                                message: 'Proxy request failed',
                                type: 'proxy_error',
                            },
                        };
                        if (this.debug) {
                            fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 500 error response due to proxy request exception', {
                                statusCode: 500,
                                errorType: 'proxy_error',
                                endpointName: endpoint.config.name,
                                originalError: error instanceof Error ? error.message : 'Unknown error',
                                responseBody: errorResponse,
                            });
                        }
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(errorResponse));
                    }
                }
            })();
        });
    }
    async retryRequest(method, url, originalHeaders, body, res, endpoint, clientExpectsStream) {
        const targetUrl = this.constructTargetUrl(url, endpoint.config.baseUrl || '');
        const headers = this.prepareRequestHeaders(originalHeaders, targetUrl, endpoint.config);
        const isHttps = targetUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;
        const options = {
            method,
            headers,
            timeout: 30000,
            agent: this.getAgent(isHttps),
        };
        const proxyReq = httpModule.request(targetUrl, options, (proxyRes) => {
            if (this.debug) {
                fileLogger.info('RETRY_RESPONSE', 'Received response from retry attempt', {
                    statusCode: proxyRes.statusCode || 0,
                    statusMessage: proxyRes.statusMessage || 'Unknown',
                    endpointName: endpoint.config.name,
                    targetUrl: targetUrl.toString(),
                    headers: proxyRes.headers,
                });
            }
            void this.processResponseStream(proxyRes, res, endpoint, null, {
                isTransformer: false,
                targetUrl,
                clientExpectsStream: Boolean(clientExpectsStream),
            });
        });
        proxyReq.on('error', (error) => {
            this.markEndpointUnhealthy(endpoint, error.message);
            if (this.debug) {
                fileLogger.error('RETRY_REQUEST_FAILED', `Retry attempt failed`, {
                    targetUrl: targetUrl.toString(),
                    endpointName: endpoint.config.name,
                    errorMessage: error.message,
                    method,
                });
            }
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: `Upstream server error: ${error.message}`,
                        type: 'upstream_error',
                    },
                }));
            }
        });
        proxyReq.on('timeout', () => {
            this.markEndpointUnhealthy(endpoint, 'Request timeout');
            if (this.debug) {
                fileLogger.error('RETRY_REQUEST_TIMEOUT', 'Retry request timed out', {
                    targetUrl: targetUrl.toString(),
                    endpointName: endpoint.config.name,
                    timeoutMs: 30000,
                    method,
                });
            }
            proxyReq.destroy();
            if (!res.headersSent) {
                const errorResponse = {
                    error: {
                        message: 'Request timeout',
                        type: 'timeout_error',
                    },
                };
                if (this.debug) {
                    fileLogger.error('PROXY_ERROR_RESPONSE', 'Sending 504 error response due to retry timeout', {
                        statusCode: 504,
                        errorType: 'timeout_error',
                        endpointName: endpoint.config.name,
                        targetUrl: targetUrl.toString(),
                        responseBody: errorResponse,
                    });
                }
                res.writeHead(504, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(errorResponse));
            }
        });
        if (body.length > 0) {
            proxyReq.write(body);
        }
        proxyReq.end();
    }
    markEndpointHealthy(endpoint) {
        endpoint.isHealthy = true;
        endpoint.failureCount = 0;
        endpoint.lastError = undefined;
    }
    markEndpointUnhealthy(endpoint, error) {
        if (this.endpoints.length === 1) {
            this.ui.verbose(`Endpoint ${endpoint.config.name} error (single endpoint, keeping available): ${error}`);
            endpoint.failureCount++;
            endpoint.lastError = error;
            endpoint.lastCheck = Date.now();
            return;
        }
        endpoint.isHealthy = false;
        endpoint.failureCount++;
        endpoint.lastError = error;
        endpoint.lastCheck = Date.now();
        if (!this.healthCheckEnabled) {
            endpoint.bannedUntil = Date.now() + (this.failedEndpointBanDurationSeconds * 1000);
            this.ui.verbose(`Endpoint ${endpoint.config.name} banned until ${dayjs(endpoint.bannedUntil).format('YYYY-MM-DD HH:mm:ss')}`);
        }
        if (this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst) {
            this.ui.verbose(`Endpoint ${endpoint.config.name} failed, triggering immediate speed test to find fastest alternative`);
            this.triggerImmediateSpeedTest();
        }
    }
    startHealthChecks() {
        if (!this.healthCheckEnabled) {
            this.ui.verbose('Health checks disabled');
            return;
        }
        this.healthCheckInterval = setInterval(() => {
            void this.performHealthChecks();
        }, this.healthCheckIntervalMs);
        this.ui.verbose(`Health checks started with ${this.healthCheckIntervalMs}ms interval`);
    }
    async performHealthChecks() {
        if (!this.healthCheckEnabled) {
            return;
        }
        const unhealthyEndpoints = this.endpoints.filter(e => !e.isHealthy);
        for (const endpoint of unhealthyEndpoints) {
            if (Date.now() - endpoint.lastCheck < this.healthCheckIntervalMs) {
                continue;
            }
            try {
                await this.healthCheck(endpoint);
            }
            catch {
                endpoint.lastCheck = Date.now();
            }
        }
    }
    async performHealthCheckRequest(endpoint, options = { timeout: 10000 }) {
        const healthCheckSpeedTest = SpeedTestManager.fromConfig(SpeedTestStrategy.ResponseTime, {
            timeout: options.timeout,
            verbose: this.verbose,
            debug: this.debug,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        });
        try {
            const result = await healthCheckSpeedTest.testEndpointSpeed(endpoint.config);
            if (result.success) {
                if (this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst) {
                    this.recordResponseTime(endpoint, result.responseTime);
                }
                if (!options.isInitial) {
                    this.markEndpointHealthy(endpoint);
                }
            }
            else {
                if (!options.isInitial) {
                    endpoint.lastCheck = Date.now();
                    this.markEndpointUnhealthy(endpoint, `Health check failed: ${result.error}`);
                }
                throw new Error(`Health check failed: ${result.error}`);
            }
        }
        catch (error) {
            if (!options.isInitial) {
                endpoint.lastCheck = Date.now();
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.markEndpointUnhealthy(endpoint, `Health check error: ${errorMessage}`);
            }
            throw error;
        }
    }
    async healthCheck(endpoint, isInitial = false) {
        const timeout = isInitial ? 15000 : 10000;
        return this.performHealthCheckRequest(endpoint, { timeout, isInitial });
    }
    startSpeedTests() {
        if (this.loadBalancerStrategy !== LoadBalancerStrategy.SpeedFirst) {
            return;
        }
        this.ui.verbose(`Speed tests started with ${this.speedFirstConfig.speedTestIntervalSeconds}s interval`);
        this.speedTestInterval = setInterval(() => {
            void this.performSpeedTests();
        }, this.speedFirstConfig.speedTestIntervalSeconds * 1000);
    }
    async performSpeedTests() {
        if (this.loadBalancerStrategy !== LoadBalancerStrategy.SpeedFirst || !this.speedTestManager) {
            return;
        }
        const healthyEndpoints = this.endpoints.filter(e => e.isHealthy);
        if (healthyEndpoints.length === 0) {
            this.ui.verbose('Speed test: No healthy endpoints available');
            return;
        }
        this.ui.verbose(`Speed test: Testing ${healthyEndpoints.length} healthy endpoints using ${this.speedFirstConfig.speedTestStrategy} strategy`);
        try {
            const endpointConfigs = healthyEndpoints.map(e => e.config);
            const results = await this.speedTestManager.testMultipleEndpoints(endpointConfigs);
            for (const endpoint of healthyEndpoints) {
                const endpointName = endpoint.config.name || endpoint.config.baseUrl || 'unknown';
                const result = results.get(endpointName);
                if (result) {
                    if (result.success) {
                        this.recordResponseTime(endpoint, result.responseTime);
                    }
                    else {
                        this.markEndpointUnhealthy(endpoint, `Speed test failed: ${result.error}`);
                    }
                }
            }
            if (this.verbose) {
                const sorted = healthyEndpoints
                    .filter(e => e.responseTimes.length >= this.speedFirstConfig.minSamples)
                    .sort((a, b) => a.averageResponseTime - b.averageResponseTime);
                if (sorted.length > 0) {
                    this.ui.verbose(`📊 Speed test results (${this.speedFirstConfig.speedTestStrategy}):`);
                    for (const endpoint of sorted) {
                        this.ui.verbose(`   • ${endpoint.config.name}: ${endpoint.averageResponseTime.toFixed(1)}ms avg (${endpoint.responseTimes.length} samples)`);
                    }
                }
            }
        }
        catch (error) {
            this.ui.verbose(`Speed test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    triggerImmediateSpeedTest() {
        if (this.loadBalancerStrategy !== LoadBalancerStrategy.SpeedFirst) {
            return;
        }
        if (this.speedTestInterval) {
            clearInterval(this.speedTestInterval);
        }
        void this.performSpeedTests();
        this.speedTestInterval = setInterval(() => {
            void this.performSpeedTests();
        }, this.speedFirstConfig.speedTestIntervalSeconds * 1000);
        this.ui.verbose(`Speed test interval reset - next test in ${this.speedFirstConfig.speedTestIntervalSeconds}s`);
    }
    async stop() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.speedTestInterval) {
            clearInterval(this.speedTestInterval);
        }
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    resolve();
                });
            });
        }
    }
    getStatus() {
        const healthy = this.endpoints.filter(e => e.isHealthy).length;
        const result = {
            total: this.endpoints.length,
            healthy,
            unhealthy: this.endpoints.length - healthy,
            endpoints: this.endpoints,
            loadBalance: this.enableLoadBalance,
            transform: this.enableTransform,
        };
        if (this.enableLoadBalance) {
            result.strategy = this.loadBalancerStrategy;
        }
        if (this.enableTransform) {
            result.transformers = Array.from(this.transformerService.getAllTransformers().keys());
        }
        return result;
    }
    async performInitialHealthChecks() {
        if (!this.enableLoadBalance) {
            this.ui.success('🔧 Proxy ready - health checks skipped (load balancing disabled)');
            return;
        }
        if (!this.healthCheckEnabled) {
            this.ui.success('🔧 Proxy ready - health checks disabled, using ban system for failures');
            return;
        }
        let hasShownQuietMessage = false;
        const healthyEndpoints = [];
        const shouldSkipHealthChecks = this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst && this.endpoints.length > 1;
        if (!shouldSkipHealthChecks) {
            for (let i = 0; i < this.endpoints.length; i++) {
                const endpoint = this.endpoints[i];
                const configName = endpoint.config.name || endpoint.config.baseUrl;
                try {
                    if (i === 0 && !hasShownQuietMessage) {
                        this.ui.displayGrey('🔍 Testing endpoints...');
                        hasShownQuietMessage = true;
                    }
                    await this.healthCheck(endpoint, true);
                    healthyEndpoints.push(endpoint);
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    const statusMatch = errorMessage.match(/status (\d+)/);
                    const statusCode = statusMatch ? statusMatch[1] : null;
                    if (statusCode) {
                        this.ui.error(`❌ ${configName} - HTTP ${statusCode}: ${this.getStatusMessage(statusCode)}`);
                    }
                    else {
                        this.ui.error(`❌ ${configName} - ${errorMessage}`);
                    }
                    this.markEndpointUnhealthy(endpoint, errorMessage);
                    if (i === 0) {
                        this.ui.warning('First endpoint failed, trying alternatives...');
                    }
                }
            }
        }
        else {
            healthyEndpoints.push(...this.endpoints);
        }
        if (healthyEndpoints.length > 1 && this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst) {
            this.ui.displayGrey('⚡ Running speed tests on all endpoints...');
            const speedTestManager = SpeedTestManager.fromConfig(SpeedTestStrategy.ResponseTime, {
                timeout: 8000,
                verbose: this.verbose,
                debug: this.debug,
                httpAgent: this.httpAgent,
                httpsAgent: this.httpsAgent,
            });
            try {
                const endpointConfigs = healthyEndpoints.map(e => e.config);
                const speedResults = await speedTestManager.testMultipleEndpoints(endpointConfigs);
                const speedData = [];
                for (const endpoint of healthyEndpoints) {
                    const endpointName = endpoint.config.name || endpoint.config.baseUrl || 'unknown';
                    const result = speedResults.get(endpointName);
                    if (result && result.success) {
                        this.recordResponseTime(endpoint, result.responseTime);
                        speedData.push({ name: endpointName, speed: result.responseTime, success: true });
                    }
                    else {
                        speedData.push({ name: endpointName, speed: 0, success: false });
                    }
                }
                const sortedSpeeds = speedData
                    .filter(s => s.success)
                    .sort((a, b) => a.speed - b.speed);
                if (sortedSpeeds.length > 0) {
                    this.ui.info('');
                    this.ui.success('📊 API Speed Test Results:');
                    sortedSpeeds.forEach((item, index) => {
                        const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
                        this.ui.info(`   ${emoji} ${item.name}: ${item.speed.toFixed(1)}ms`);
                    });
                    this.ui.info('');
                    if (this.debug) {
                        fileLogger.info('SPEED_TEST_RESULTS', 'Initial speed test completed for Speed First strategy', {
                            strategy: this.loadBalancerStrategy,
                            totalTested: sortedSpeeds.length,
                            fastestEndpoint: sortedSpeeds[0].name,
                            fastestSpeed: sortedSpeeds[0].speed,
                            results: sortedSpeeds.map(item => ({
                                name: item.name,
                                responseTime: item.speed,
                            })),
                        });
                    }
                }
                const failedSpeeds = speedData.filter(s => !s.success);
                if (failedSpeeds.length > 0) {
                    this.ui.warning('❌ Speed test failures:');
                    failedSpeeds.forEach((item) => {
                        this.ui.warning(`   • ${item.name}: Speed test failed`);
                    });
                }
            }
            catch (error) {
                this.ui.verbose(`Speed test error during initial checks: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        else if (healthyEndpoints.length > 0) {
            const primaryEndpoint = healthyEndpoints[0];
            const endpointName = primaryEndpoint.config.name || primaryEndpoint.config.baseUrl;
            this.ui.success(`✅ Using endpoint: ${endpointName}`);
            if (this.debug) {
                fileLogger.info('ENDPOINT_SWITCH', `Primary endpoint selected for ${this.loadBalancerStrategy} strategy`, {
                    strategy: this.loadBalancerStrategy,
                    selectedEndpoint: endpointName,
                    totalHealthyEndpoints: healthyEndpoints.length,
                    totalEndpoints: this.endpoints.length,
                });
            }
        }
        if (this.loadBalancerStrategy === LoadBalancerStrategy.SpeedFirst) {
            const readyEndpoints = this.endpoints.filter(e => e.isHealthy && e.responseTimes.length > 0);
            if (readyEndpoints.length > 0) {
                const sorted = readyEndpoints.sort((a, b) => a.averageResponseTime - b.averageResponseTime);
                this.ui.success(`🏁 Speed First ready with ${readyEndpoints.length} endpoints (fastest: ${sorted[0].config.name})`);
                if (this.verbose) {
                    this.ui.verbose('📊 Speed First endpoint timing data:');
                    for (const endpoint of sorted) {
                        this.ui.verbose(`   • ${endpoint.config.name}: ${endpoint.responseTimes.length} samples, avg ${endpoint.averageResponseTime.toFixed(1)}ms`);
                    }
                }
            }
            else {
                this.ui.warning('⚠️ Speed First: No healthy endpoints with timing data collected');
            }
        }
        const healthyCount = this.endpoints.filter(e => e.isHealthy).length;
        if (healthyCount === 0) {
            this.ui.info('');
            this.ui.error('❌ All endpoints failed initial health checks!');
            this.ui.warning('⚠️ Load balancer will continue but may not work properly');
            this.ui.info('');
        }
    }
    getTransformerService() {
        return this.transformerService;
    }
    async addTransformer(name, transformer) {
        this.transformerService.registerTransformer(name, transformer);
    }
    removeTransformer(name) {
        return this.transformerService.removeTransformer(name);
    }
    listTransformers() {
        const transformers = [];
        const entries = Array.from(this.transformerService.getAllTransformers().entries());
        for (const [name, transformer] of entries) {
            if (typeof transformer === 'object') {
                transformers.push({
                    name,
                    hasDomain: !!transformer.domain,
                    domain: transformer.domain,
                });
            }
        }
        return transformers;
    }
    getStatusMessage(statusCode) {
        const code = Number.parseInt(statusCode);
        switch (code) {
            case 400: return 'Bad Request - Invalid request format';
            case 401: return 'Unauthorized - Invalid API key';
            case 403: return 'Forbidden - Access denied';
            case 404: return 'Not Found - Endpoint not available';
            case 429: return 'Rate Limited - Too many requests';
            case 500: return 'Internal Server Error';
            case 502: return 'Bad Gateway - Server unavailable';
            case 503: return 'Service Unavailable';
            case 504: return 'Gateway Timeout';
            default: return `HTTP Error ${code}`;
        }
    }
}
