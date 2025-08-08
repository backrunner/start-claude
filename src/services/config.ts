export class ConfigService {
  private config: Record<string, any> = {}

  constructor(initialConfig: Record<string, any> = {}) {
    this.config = { ...initialConfig }
  }

  get<T = any>(key: string, defaultValue?: T): T {
    const keys = key.split('.')
    let value = this.config

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      }
      else {
        return defaultValue as T
      }
    }

    return value as T
  }

  set(key: string, value: any): void {
    const keys = key.split('.')
    let current = this.config

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {}
      }
      current = current[k]
    }

    current[keys[keys.length - 1]] = value
  }

  has(key: string): boolean {
    const keys = key.split('.')
    let value = this.config

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      }
      else {
        return false
      }
    }

    return true
  }

  getAll(): Record<string, any> {
    return { ...this.config }
  }

  merge(config: Record<string, any>): void {
    this.config = { ...this.config, ...config }
  }
}
