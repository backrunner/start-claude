import type { ClaudeConfig } from '../../config/types'
import boxen from 'boxen'
import chalk from 'chalk'

// Force chalk to enable colors when bundled
chalk.level = 1 // Enable basic color support

const log = console.log

export function displayWelcome(): void {
  log()
  log(chalk.cyan.bold('🚀 Start Claude CLI'))
  log(chalk.gray('Manage your Claude Code configurations with ease'))
  log()
}

export function displayConfig(config: ClaudeConfig): void {
  const defaultIndicator = config.isDefault ? chalk.yellow('●') : chalk.gray('○')
  log(`${defaultIndicator} ${chalk.cyan.bold(config.name)}${config.isDefault ? chalk.yellow(' (default)') : ''}`)

  if (config.baseUrl) {
    log(`  ${chalk.gray('└─ Base URL:')} ${chalk.white(config.baseUrl)}`)
  }
  if (config.apiKey) {
    log(`  ${chalk.gray('└─ API Key:')} ${chalk.white(config.apiKey.slice(0, 8))}***`)
  }
  if (config.model) {
    log(`  ${chalk.gray('└─ Model:')} ${chalk.white(config.model)}`)
  }
}

export function displayConfigList(configs: ClaudeConfig[]): void {
  if (configs.length === 0) {
    log()
    log(chalk.yellow('No configurations found'))
    log(chalk.gray('Use "start-claude add" to create your first configuration'))
    log()
    return
  }

  log()
  log(chalk.bold('Available Configurations:'))
  log()

  configs.forEach((config) => {
    displayConfig(config)
    log()
  })
}

export function displaySuccess(message: string): void {
  log(chalk.green(message))
}

export function displayError(message: string): void {
  log(chalk.red(message))
}

export function displayWarning(message: string): void {
  log(chalk.yellow(message))
}

export function displayInfo(message: string): void {
  log(chalk.blue(message))
}

export function displayGrey(message: string): void {
  log(chalk.gray(message))
}

// Verbose logging - only shows when verbose mode is enabled
export function displayVerbose(message: string, verbose: boolean = false): void {
  if (verbose) {
    log(chalk.gray(`[Verbose] ${message}`))
  }
}

export function displayBoxedConfig(config: ClaudeConfig): void {
  const configDetails = []

  configDetails.push(`${chalk.bold('Name:')} ${chalk.cyan(config.name)}`)

  if (config.baseUrl) {
    configDetails.push(`${chalk.bold('Base URL:')} ${chalk.white(config.baseUrl)}`)
  }

  if (config.apiKey) {
    configDetails.push(`${chalk.bold('API Key:')} ${chalk.white(config.apiKey.slice(0, 8))}***`)
  }

  if (config.model) {
    configDetails.push(`${chalk.bold('Model:')} ${chalk.white(config.model)}`)
  }

  if (config.permissionMode) {
    configDetails.push(`${chalk.bold('Permission Mode:')} ${chalk.white(config.permissionMode)}`)
  }

  if (config.httpProxy) {
    configDetails.push(`${chalk.bold('HTTP Proxy:')} ${chalk.white(config.httpProxy)}`)
  }

  if (config.httpsProxy) {
    configDetails.push(`${chalk.bold('HTTPS Proxy:')} ${chalk.white(config.httpsProxy)}`)
  }

  const boxContent = configDetails.join('\n')

  log(boxen(boxContent, {
    title: 'Using Configuration',
    titleAlignment: 'center',
    padding: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
  }))
  log()
}
