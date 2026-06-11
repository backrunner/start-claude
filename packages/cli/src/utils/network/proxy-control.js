import { Buffer } from 'node:buffer';
import * as http from 'node:http';
const PROXY_STATUS_TIMEOUT_MS = 1000;
const PROXY_SWITCH_TIMEOUT_MS = 30000;
export async function sendProxySwitchRequest(port, configs) {
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify({ configs });
        const options = {
            hostname: 'localhost',
            port,
            path: '/__switch',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody),
            },
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (isProxySwitchResult(response)) {
                        resolve(response);
                    }
                    else if (isProxySwitchErrorResponse(response)) {
                        resolve({
                            success: false,
                            message: response.error?.message || 'Unknown error',
                            endpointDetails: response.endpointDetails,
                        });
                    }
                    else {
                        reject(new Error('Invalid response format from server'));
                    }
                }
                catch {
                    reject(new Error(`Invalid response from server: ${data}`));
                }
            });
        });
        req.on('error', (error) => {
            reject(error);
        });
        req.setTimeout(PROXY_SWITCH_TIMEOUT_MS, () => {
            req.destroy(new Error(`Proxy switch request timed out after ${PROXY_SWITCH_TIMEOUT_MS}ms`));
        });
        req.write(requestBody);
        req.end();
    });
}
export async function getProxyStatus(port = 2333) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port,
            path: '/__status',
            method: 'GET',
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (!isProxyRuntimeStatus(response)) {
                        reject(new Error('Invalid status response from proxy server'));
                        return;
                    }
                    resolve(response);
                }
                catch {
                    reject(new Error(`Invalid response from server: ${data}`));
                }
            });
        });
        req.on('error', (error) => {
            reject(error);
        });
        req.setTimeout(PROXY_STATUS_TIMEOUT_MS, () => {
            req.destroy(new Error(`Proxy status request timed out after ${PROXY_STATUS_TIMEOUT_MS}ms`));
        });
        req.end();
    });
}
function isProxyRuntimeStatus(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const status = value;
    return typeof status.total === 'number'
        && typeof status.healthy === 'number'
        && typeof status.unhealthy === 'number'
        && typeof status.loadBalance === 'boolean'
        && typeof status.transform === 'boolean';
}
function isProxySwitchResult(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const result = value;
    return result.success === true && typeof result.message === 'string';
}
function isProxySwitchErrorResponse(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const response = value;
    if (typeof response.error !== 'object' || response.error === null || Array.isArray(response.error)) {
        return false;
    }
    const error = response.error;
    return typeof error.message === 'string' || error.message === undefined;
}
