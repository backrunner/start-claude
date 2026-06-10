import { Buffer } from 'node:buffer';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import { performance } from 'node:perf_hooks';
import { SpeedTestStrategy } from '../../config/types';
import { UILogger } from '../cli/ui';
import { getConfigApiKey } from '../config/credentials';
import { fileLogger } from '../logging/file-logger';
const GENERAL_TEST_HEADERS = {
    'x-app': 'cli',
    'Content-Type': 'application/json',
    'User-Agent': 'claude-cli/2.0.14 (external, cli)',
    'anthropic-dangerous-direct-browser-access': 'true',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14,token-counting-2024-11-01',
    'x-stainless-helper-method': 'stream',
    'accept-language': '*',
    'accept-encoding': 'gzip, deflate',
    'connection': 'keep-alive',
    'accept': 'application/json',
    'x-stainless-retry-count': '0',
    'x-stainless-lang': 'js',
    'x-stainless-package-version': '0.60.0',
    'x-stainless-os': 'Windows',
    'x-stainless-arch': 'x64',
    'x-stainless-runtime': 'node',
    'x-stainless-runtime-version': 'v22.18.0',
    'sec-fetch-mode': 'cors',
};
export class SpeedTestManager {
    config;
    ui;
    constructor(config) {
        this.config = config;
        this.ui = new UILogger(this.config.verbose);
    }
    async testEndpointSpeed(endpoint) {
        const startTime = performance.now();
        if (this.config.debug || this.config.verbose) {
            this.ui.verbose(`🔍 Starting ${this.config.strategy} test for endpoint: ${endpoint.name}`);
            this.ui.verbose(`🌐 Target URL: ${endpoint.baseUrl}`);
            this.ui.verbose(`⏱️ Timeout: ${this.config.timeout}ms`);
        }
        try {
            let responseTime;
            switch (this.config.strategy) {
                case SpeedTestStrategy.ResponseTime:
                    responseTime = await this.testResponseTime(endpoint);
                    break;
                case SpeedTestStrategy.HeadRequest:
                    responseTime = await this.testHeadRequest(endpoint);
                    break;
                case SpeedTestStrategy.Ping:
                    responseTime = await this.testPing(endpoint);
                    break;
                default:
                    throw new Error(`Unknown speed test strategy: ${String(this.config.strategy)}`);
            }
            if (this.config.debug) {
                fileLogger.debug('SPEED_TEST_SUCCESS', `Speed test completed for endpoint`, {
                    endpointName: endpoint.name,
                    strategy: this.config.strategy,
                    responseTime,
                    totalTime: performance.now() - startTime,
                });
            }
            return {
                responseTime,
                success: true,
                strategy: this.config.strategy,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (this.config.debug) {
                fileLogger.debug('SPEED_TEST_FAILED', `Speed test failed for endpoint`, {
                    endpointName: endpoint.name,
                    strategy: this.config.strategy,
                    error: errorMessage,
                    totalTime: performance.now() - startTime,
                });
            }
            return {
                responseTime: Number.POSITIVE_INFINITY,
                success: false,
                error: errorMessage,
                strategy: this.config.strategy,
            };
        }
    }
    async testResponseTime(endpoint) {
        return new Promise((resolve, reject) => {
            if (!endpoint.baseUrl) {
                reject(new Error('Endpoint baseUrl is required for response time test'));
                return;
            }
            const baseUrl = endpoint.baseUrl.endsWith('/') ? endpoint.baseUrl.slice(0, -1) : endpoint.baseUrl;
            const testUrl = new URL(`${baseUrl}/v1/messages?beta=true`);
            const startTime = performance.now();
            const testBody = JSON.stringify({
                model: endpoint.model || 'claude-3-5-haiku-20241022',
                max_tokens: 512,
                messages: [
                    {
                        role: 'user',
                        content: 'hi',
                    },
                ],
                system: [
                    {
                        type: 'text',
                        text: 'Analyze if this message indicates a new conversation topic. If it does, extract a 2-3 word title that captures the new topic. Format your response as a JSON object with two fields: \'isNewTopic\' (boolean) and \'title\' (string, or null if isNewTopic is false). Only include these fields, no other text.',
                    },
                ],
                metadata: {
                    user_id: 'start-claude-test',
                },
                temperature: 0,
                stream: true,
            });
            const isHttps = testUrl.protocol === 'https:';
            const httpModule = isHttps ? https : http;
            const apiKey = getConfigApiKey(endpoint);
            if (this.config.debug || this.config.verbose) {
                this.ui.verbose(`📤 Sending POST request to: ${testUrl.toString()}`);
                this.ui.verbose(`🔑 Using API key: ${apiKey?.substring(0, 8)}***`);
                this.ui.verbose(`🤖 Model: ${endpoint.model || 'claude-3-5-haiku-20241022'}`);
                this.ui.verbose(`📦 Payload size: ${Buffer.byteLength(testBody)} bytes`);
            }
            const requestOptions = {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Length': Buffer.byteLength(testBody),
                    ...GENERAL_TEST_HEADERS,
                },
                timeout: this.config.timeout,
                agent: isHttps ? this.config.httpsAgent : this.config.httpAgent,
            };
            const req = httpModule.request(testUrl, requestOptions, (res) => {
                const responseTime = performance.now() - startTime;
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`📥 Received response: HTTP ${res.statusCode}`);
                    this.ui.verbose(`⏱️ Response time: ${responseTime.toFixed(1)}ms`);
                    if (res.headers['content-type']) {
                        this.ui.verbose(`📄 Content-Type: ${res.headers['content-type']}`);
                    }
                }
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    if (this.config.debug || this.config.verbose) {
                        this.ui.verbose(`✅ Response time test successful`);
                    }
                    resolve(responseTime);
                }
                else {
                    if (this.config.debug || this.config.verbose) {
                        this.ui.verbose(`❌ Response time test failed with status: ${res.statusCode}`);
                    }
                    reject(new Error(`HTTP ${res.statusCode}: Response time test failed`));
                }
                res.resume();
            });
            req.on('error', (error) => {
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`🚫 Request error: ${error.message}`);
                }
                reject(new Error(`Response time test error: ${error.message}`));
            });
            req.on('timeout', () => {
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`⏰ Request timeout after ${this.config.timeout}ms`);
                }
                req.destroy();
                reject(new Error('Response time test timeout'));
            });
            req.write(testBody);
            req.end();
        });
    }
    async testHeadRequest(endpoint) {
        return new Promise((resolve, reject) => {
            if (!endpoint.baseUrl) {
                reject(new Error('Endpoint baseUrl is required for HEAD request test'));
                return;
            }
            const baseUrl = endpoint.baseUrl.endsWith('/') ? endpoint.baseUrl.slice(0, -1) : endpoint.baseUrl;
            const testUrl = new URL(`${baseUrl}/v1/messages?beta=true`);
            const startTime = performance.now();
            const isHttps = testUrl.protocol === 'https:';
            const httpModule = isHttps ? https : http;
            const apiKey = getConfigApiKey(endpoint);
            if (this.config.debug || this.config.verbose) {
                this.ui.verbose(`📤 Sending HEAD request to: ${testUrl.toString()}`);
                this.ui.verbose(`🔑 Using API key: ${apiKey?.substring(0, 8)}***`);
            }
            const requestOptions = {
                method: 'HEAD',
                headers: {
                    'x-api-key': apiKey,
                    ...GENERAL_TEST_HEADERS,
                },
                timeout: this.config.timeout,
                agent: isHttps ? this.config.httpsAgent : this.config.httpAgent,
            };
            const req = httpModule.request(testUrl, requestOptions, (res) => {
                const responseTime = performance.now() - startTime;
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`📥 Received HEAD response: HTTP ${res.statusCode}`);
                    this.ui.verbose(`⏱️ Response time: ${responseTime.toFixed(1)}ms`);
                }
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    if (this.config.debug || this.config.verbose) {
                        this.ui.verbose(`✅ HEAD request test successful`);
                    }
                    resolve(responseTime);
                }
                else {
                    if (this.config.debug || this.config.verbose) {
                        this.ui.verbose(`❌ HEAD request test failed with status: ${res.statusCode}`);
                    }
                    reject(new Error(`HTTP ${res.statusCode}: HEAD request test failed`));
                }
                res.resume();
            });
            req.on('error', (error) => {
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`🚫 HEAD request error: ${error.message}`);
                }
                reject(new Error(`HEAD request test error: ${error.message}`));
            });
            req.on('timeout', () => {
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`⏰ HEAD request timeout after ${this.config.timeout}ms`);
                }
                req.destroy();
                reject(new Error('HEAD request test timeout'));
            });
            req.end();
        });
    }
    async testPing(endpoint) {
        return new Promise((resolve, reject) => {
            if (!endpoint.baseUrl) {
                reject(new Error('Endpoint baseUrl is required for ping test'));
                return;
            }
            const testUrl = new URL(endpoint.baseUrl);
            const startTime = performance.now();
            const isHttps = testUrl.protocol === 'https:';
            const defaultPort = isHttps ? 443 : 80;
            const port = testUrl.port ? Number.parseInt(testUrl.port, 10) : defaultPort;
            if (this.config.debug || this.config.verbose) {
                this.ui.verbose(`🔌 Attempting TCP connection to: ${testUrl.hostname}:${port}`);
                this.ui.verbose(`🔒 Protocol: ${isHttps ? 'HTTPS' : 'HTTP'}`);
            }
            const socket = new net.Socket();
            socket.setTimeout(this.config.timeout);
            socket.connect(port, testUrl.hostname, () => {
                const responseTime = performance.now() - startTime;
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`✅ TCP connection successful`);
                    this.ui.verbose(`⏱️ Connection time: ${responseTime.toFixed(1)}ms`);
                }
                socket.destroy();
                resolve(responseTime);
            });
            socket.on('error', (error) => {
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`🚫 TCP connection error: ${error.message}`);
                }
                socket.destroy();
                reject(new Error(`Ping test error: ${error.message}`));
            });
            socket.on('timeout', () => {
                if (this.config.debug || this.config.verbose) {
                    this.ui.verbose(`⏰ TCP connection timeout after ${this.config.timeout}ms`);
                }
                socket.destroy();
                reject(new Error('Ping test timeout'));
            });
        });
    }
    async testMultipleEndpoints(endpoints) {
        const results = new Map();
        if (endpoints.length === 0) {
            return results;
        }
        if (this.config.verbose) {
            this.ui.verbose(`🔍 Testing ${endpoints.length} endpoints using ${this.config.strategy} strategy`);
        }
        const testPromises = endpoints.map(async (endpoint) => {
            const result = await this.testEndpointSpeed(endpoint);
            const endpointKey = endpoint.name || endpoint.baseUrl || 'unknown';
            results.set(endpointKey, result);
            return { endpoint: endpointKey, result };
        });
        const settledResults = await Promise.allSettled(testPromises);
        settledResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                const endpointName = endpoints[index].name || endpoints[index].baseUrl || 'unknown';
                if (this.config.debug) {
                    fileLogger.debug('SPEED_TEST_PROMISE_REJECTED', 'Speed test promise was rejected', {
                        endpointName,
                        error: result.reason,
                    });
                }
                results.set(endpointName, {
                    responseTime: Number.POSITIVE_INFINITY,
                    success: false,
                    error: 'Promise rejected',
                    strategy: this.config.strategy,
                });
            }
        });
        if (this.config.verbose) {
            this.logSpeedTestResults(results);
        }
        return results;
    }
    logSpeedTestResults(results) {
        const sortedResults = Array.from(results.entries())
            .filter(([, result]) => result.success)
            .sort(([, a], [, b]) => a.responseTime - b.responseTime);
        if (sortedResults.length > 0) {
            this.ui.verbose(`📊 Speed test results (${this.config.strategy}):`);
            sortedResults.forEach(([name, result], index) => {
                const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
                this.ui.verbose(`   ${emoji} ${name}: ${result.responseTime.toFixed(1)}ms`);
            });
        }
        const failedResults = Array.from(results.entries()).filter(([, result]) => !result.success);
        if (failedResults.length > 0) {
            this.ui.verbose(`❌ Failed tests:`);
            failedResults.forEach(([name, result]) => {
                this.ui.verbose(`   • ${name}: ${result.error}`);
            });
        }
    }
    static getFastestEndpoint(results) {
        const successfulResults = Array.from(results.entries())
            .filter(([, result]) => result.success)
            .sort(([, a], [, b]) => a.responseTime - b.responseTime);
        return successfulResults.length > 0 ? successfulResults[0][0] : null;
    }
    static fromConfig(strategy = SpeedTestStrategy.ResponseTime, options = {}) {
        const config = {
            strategy,
            timeout: 8000,
            verbose: false,
            debug: false,
            ...options,
        };
        return new SpeedTestManager(config);
    }
}
