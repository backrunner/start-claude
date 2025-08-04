import type { ClaudeConfig } from './types'
import chalk from 'chalk'

// eslint-disable-next-line no-console
const log = console.log

export function displayWelcome(): void {
  log()
  log(chalk.cyan.bold('🚀 Start Claude CLI'))
  log(chalk.gray('Manage your Claude Code configurations with ease'))
  log()
}

export function displayConfig(config: ClaudeConfig): void {
  log(chalk.cyan(`📋 ${config.name}`) + (config.isDefault ? chalk.yellow(' (default)') : ''))
  if (config.description !== undefined) {
    log(chalk.gray(`   ${config.description}`))
  }
  if (config.baseUrl !== undefined) {
    log(chalk.gray(`   Base URL: ${config.baseUrl}`))
  }
  if (config.apiKey !== undefined) {
    const maskedKey = `${config.apiKey.slice(0, 8)}***`
    log(chalk.gray(`   API Key: ${maskedKey}`))
  }
  if (config.model !== undefined) {
    log(chalk.gray(`   Model: ${config.model}`))
  }
}

export function displayConfigList(configs: ClaudeConfig[]): void {
  if (configs.length === 0) {
    log(chalk.yellow('No configurations found. Use "start-claude add" to create one.'))
    return
  }

  log(chalk.bold('Available configurations:'))
  log()

  configs.forEach((config, index) => {
    displayConfig(config)
    if (index < configs.length - 1) {
      log()
    }
  })
}

export function displaySuccess(message: string): void {
  log(chalk.green(`✅ ${message}`))
}

export function displayError(message: string): void {
  log(chalk.red(`❌ ${message}`))
}

export function displayWarning(message: string): void {
  log(chalk.yellow(`⚠️  ${message}`))
}

export function displayInfo(message: string): void {
  log(chalk.blue(`ℹ️  ${message}`))
}
