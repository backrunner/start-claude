import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import dayjs from 'dayjs';
export class FileLogger {
    logDir;
    logFile;
    enabled = false;
    constructor(logFileName) {
        this.logDir = join(homedir(), '.start-claude', 'logs');
        const timestamp = dayjs().format('YYYY-MM-DD_HH-mm-ss');
        const fileName = logFileName || `start-claude-${timestamp}.log`;
        this.logFile = join(this.logDir, fileName);
    }
    enable() {
        this.enabled = true;
        this.ensureLogDirectory();
        this.initializeLogFile();
        this.log('INFO', 'SYSTEM', '🚀 Start Claude Debug Session Started');
    }
    disable() {
        if (this.enabled) {
            this.log('INFO', 'SYSTEM', '🛑 Debug logging disabled');
        }
        this.enabled = false;
    }
    isEnabled() {
        return this.enabled;
    }
    ensureLogDirectory() {
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
        }
    }
    initializeLogFile() {
        const header = `
=== Start Claude Debug Log ===
Session started: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}
Log file: ${this.logFile}
=============================

`;
        try {
            writeFileSync(this.logFile, header, 'utf-8');
        }
        catch (error) {
            console.error('Failed to initialize log file:', error);
        }
    }
    formatContent(content) {
        if (!content)
            return '';
        return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    }
    sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        const sensitiveKeys = ['authorization', 'x-api-key', 'x-goog-api-key', 'cookie'];
        sensitiveKeys.forEach((key) => {
            if (sanitized[key]) {
                sanitized[key] = '[REDACTED]';
            }
        });
        return sanitized;
    }
    log(level, category, message, data) {
        if (!this.enabled) {
            return;
        }
        const entry = {
            timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            level,
            category,
            message,
            data: data ? this.formatContent(data) : undefined,
        };
        const logLine = this.formatLogEntry(entry);
        try {
            appendFileSync(this.logFile, `${logLine}\n`, 'utf-8');
        }
        catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
    formatLogEntry(entry) {
        const levelEmoji = {
            DEBUG: '🔍',
            INFO: 'ℹ️',
            WARN: '⚠️',
            ERROR: '❌',
        };
        let formatted = `${levelEmoji[entry.level]} [${entry.timestamp}] ${entry.category}: ${entry.message}`;
        if (entry.data) {
            const indentedData = entry.data.split('\n').map((line) => `    ${line}`).join('\n');
            formatted += `\n${indentedData}`;
        }
        formatted += `\n${'-'.repeat(80)}`;
        return formatted;
    }
    debug(category, message, data) {
        this.log('DEBUG', category, message, data);
    }
    info(category, message, data) {
        this.log('INFO', category, message, data);
    }
    warn(category, message, data) {
        this.log('WARN', category, message, data);
    }
    error(category, message, data) {
        this.log('ERROR', category, message, data);
    }
    logRequest(method, url, headers, body) {
        const sanitizedHeaders = this.sanitizeHeaders(headers);
        this.info('REQUEST', `${method} ${url}`, {
            headers: sanitizedHeaders,
            bodySize: body ? (typeof body === 'string' ? body.length : JSON.stringify(body).length) : 0,
            body: body ? this.formatContent(body) : undefined,
        });
    }
    logResponse(statusCode, statusMessage, headers, body) {
        const sanitizedHeaders = this.sanitizeHeaders(headers);
        const level = statusCode >= 400 ? 'WARN' : 'INFO';
        this.log(level, 'RESPONSE', `${statusCode} ${statusMessage}`, {
            headers: sanitizedHeaders,
            bodySize: body ? (typeof body === 'string' ? body.length : JSON.stringify(body).length) : 0,
            body: body ? this.formatContent(body) : undefined,
        });
    }
    logTransform(direction, transformer, input, output) {
        this.info('TRANSFORM', `${direction} via ${transformer}`, {
            inputSize: typeof input === 'string' ? input.length : JSON.stringify(input).length,
            outputSize: typeof output === 'string' ? output.length : JSON.stringify(output).length,
            input: this.formatContent(input),
            output: this.formatContent(output),
        });
    }
    logError(category, error, context) {
        const errorMessage = error instanceof Error ? error.message : error;
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.error(category, errorMessage, {
            stack: errorStack ? this.formatContent(errorStack) : undefined,
            context: context ? this.formatContent(context) : undefined,
        });
    }
    getLogFilePath() {
        return this.logFile;
    }
}
export const fileLogger = new FileLogger();
