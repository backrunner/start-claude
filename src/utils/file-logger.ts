import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
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

  constructor(logFileName = 'start-claude-debug.log') {
    this.logDir = join(homedir(), '.start-claude', 'logs')
    this.logFile = join(this.logDir, logFileName)
  }

  enable(): void {
    this.enabled = true
    this.ensureLogDirectory()
    this.log('INFO', 'SYSTEM', 'Debug logging enabled')
  }

  disable(): void {
    if (this.enabled) {
      this.log('INFO', 'SYSTEM', 'Debug logging disabled')
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

  private log(level: LogEntry['level'], category: string, message: string, data?: any): void {
    if (!this.enabled) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined,
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
    let formatted = `[${entry.timestamp}] ${entry.level} [${entry.category}] ${entry.message}`

    if (entry.data) {
      formatted += `\n${entry.data}`
    }

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

  // Proxy-specific logging methods
  logRequest(method: string, url: string, headers: Record<string, any>, body?: any): void {
    this.debug('PROXY_REQUEST', `${method} ${url}`, {
      headers,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    })
  }

  logResponse(statusCode: number, statusMessage: string, headers: Record<string, any>, body?: any): void {
    this.debug('PROXY_RESPONSE', `${statusCode} ${statusMessage}`, {
      headers,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    })
  }

  logTransform(direction: 'REQUEST' | 'RESPONSE', transformer: string, input: any, output: any): void {
    this.debug('PROXY_TRANSFORM', `${direction} - ${transformer}`, {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      output: typeof output === 'string' ? output : JSON.stringify(output),
    })
  }

  logError(category: string, error: Error | string, context?: any): void {
    const errorMessage = error instanceof Error ? error.message : error
    const errorStack = error instanceof Error ? error.stack : undefined

    this.error(category, errorMessage, {
      stack: errorStack,
      context,
    })
  }

  getLogFilePath(): string {
    return this.logFile
  }
}

// Global instance
export const fileLogger = new FileLogger()
