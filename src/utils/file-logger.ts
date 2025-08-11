import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface LogEntry {
  timestamp: string
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  category: string
  message: string
  data?: any
}

export class FileLogger {
  private logDir: string
  private logFile: string
  private enabled: boolean = false
  private maxContentLength: number = 2000 // Maximum characters for content truncation

  constructor(logFileName?: string) {
    this.logDir = join(homedir(), '.start-claude', 'logs')
    // Generate unique log file name with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const fileName = logFileName || `start-claude-${timestamp}.log`
    this.logFile = join(this.logDir, fileName)
  }

  enable(): void {
    this.enabled = true
    this.ensureLogDirectory()
    this.initializeLogFile()
    this.log('INFO', 'SYSTEM', '🚀 Start Claude Debug Session Started')
  }

  disable(): void {
    if (this.enabled) {
      this.log('INFO', 'SYSTEM', '🛑 Debug logging disabled')
    }
    this.enabled = false
  }

  isEnabled(): boolean {
    return this.enabled
  }

  private ensureLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
  }

  private initializeLogFile(): void {
    const header = `
=== Start Claude Debug Log ===
Session started: ${new Date().toLocaleString()}
Log file: ${this.logFile}
=============================

`
    try {
      writeFileSync(this.logFile, header, 'utf-8')
    }
    catch (error) {
      console.error('Failed to initialize log file:', error)
    }
  }

  private truncateContent(content: any): string {
    if (!content)
      return ''

    const str = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

    if (str.length > this.maxContentLength) {
      return `${str.substring(0, this.maxContentLength)}\n... [TRUNCATED - content too long]`
    }

    return str
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers }
    // Hide sensitive headers
    const sensitiveKeys = ['authorization', 'x-api-key', 'x-goog-api-key', 'cookie']
    sensitiveKeys.forEach((key) => {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]'
      }
    })
    return sanitized
  }

  private log(level: LogEntry['level'], category: string, message: string, data?: any): void {
    if (!this.enabled) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toLocaleString(),
      level,
      category,
      message,
      data: data ? this.truncateContent(data) : undefined,
    }

    const logLine = this.formatLogEntry(entry)

    try {
      appendFileSync(this.logFile, `${logLine}\n`, 'utf-8')
    }
    catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelEmoji = {
      DEBUG: '🔍',
      INFO: 'ℹ️',
      WARN: '⚠️',
      ERROR: '❌',
    }

    let formatted = `${levelEmoji[entry.level]} [${entry.timestamp}] ${entry.category}: ${entry.message}`

    if (entry.data) {
      // Add indentation for better readability
      const indentedData = entry.data.split('\n').map((line: string) => `    ${line}`).join('\n')
      formatted += `\n${indentedData}`
    }

    formatted += `\n${'-'.repeat(80)}` // Add separator line

    return formatted
  }

  debug(category: string, message: string, data?: any): void {
    this.log('DEBUG', category, message, data)
  }

  info(category: string, message: string, data?: any): void {
    this.log('INFO', category, message, data)
  }

  warn(category: string, message: string, data?: any): void {
    this.log('WARN', category, message, data)
  }

  error(category: string, message: string, data?: any): void {
    this.log('ERROR', category, message, data)
  }

  // Proxy-specific logging methods with improved formatting
  logRequest(method: string, url: string, headers: Record<string, any>, body?: any): void {
    const sanitizedHeaders = this.sanitizeHeaders(headers)
    this.info('REQUEST', `${method} ${url}`, {
      headers: sanitizedHeaders,
      bodySize: body ? (typeof body === 'string' ? body.length : JSON.stringify(body).length) : 0,
      body: body ? this.truncateContent(body) : undefined,
    })
  }

  logResponse(statusCode: number, statusMessage: string, headers: Record<string, any>, body?: any): void {
    const sanitizedHeaders = this.sanitizeHeaders(headers)
    const level = statusCode >= 400 ? 'WARN' : 'INFO'

    this.log(level, 'RESPONSE', `${statusCode} ${statusMessage}`, {
      headers: sanitizedHeaders,
      bodySize: body ? (typeof body === 'string' ? body.length : JSON.stringify(body).length) : 0,
      body: body ? this.truncateContent(body) : undefined,
    })
  }

  logTransform(direction: 'REQUEST' | 'RESPONSE' | 'FORMAT_REQUEST' | 'NORMALIZE_REQUEST', transformer: string, input: any, output: any): void {
    this.info('TRANSFORM', `${direction} via ${transformer}`, {
      inputSize: typeof input === 'string' ? input.length : JSON.stringify(input).length,
      outputSize: typeof output === 'string' ? output.length : JSON.stringify(output).length,
      input: this.truncateContent(input),
      output: this.truncateContent(output),
    })
  }

  logError(category: string, error: Error | string, context?: any): void {
    const errorMessage = error instanceof Error ? error.message : error
    const errorStack = error instanceof Error ? error.stack : undefined

    this.error(category, errorMessage, {
      stack: errorStack ? this.truncateContent(errorStack) : undefined,
      context: context ? this.truncateContent(context) : undefined,
    })
  }

  getLogFilePath(): string {
    return this.logFile
  }
}

// Global instance
export const fileLogger = new FileLogger()
