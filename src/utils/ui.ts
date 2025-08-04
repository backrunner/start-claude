import type { ClaudeConfig } from '../core/types'
import boxen from 'boxen'
import chalk from 'chalk'

const log = console.log

export function displayWelcome(): void {
  const welcomeBox = boxen(
    `${chalk.cyan.bold('🚀 Start Claude CLI')}\n${
      chalk.gray('Manage your Claude Code configurations with ease')}`,
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    },
  )
  log(welcomeBox)
}

export function displayConfig(config: ClaudeConfig): void {
  const configInfo = [
    chalk.cyan.bold(`📋 ${config.name}`) + (config.isDefault ? chalk.yellow.bold(' (default)') : ''),
    config.baseUrl ? chalk.gray(`   Base URL: ${config.baseUrl}`) : null,
    config.apiKey ? chalk.gray(`   API Key: ${config.apiKey.slice(0, 8)}***`) : null,
    config.model ? chalk.gray(`   Model: ${config.model}`) : null,
  ].filter(Boolean)

  const configBox = boxen(
    configInfo.join('\n'),
    {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'single',
      borderColor: config.isDefault ? 'yellow' : 'gray',
    },
  )

  log(configBox)
}

export function displayConfigList(configs: ClaudeConfig[]): void {
  if (configs.length === 0) {
    const emptyBox = boxen(
      `${chalk.yellow('⚠️  No configurations found')}\n${
        chalk.gray('Use "start-claude add" to create your first configuration')}`,
      {
        padding: 1,
        borderStyle: 'single',
        borderColor: 'yellow',
      },
    )
    log(emptyBox)
    return
  }

  log(chalk.bold.underline('\n📚 Available Configurations:'))
  log()

  configs.forEach((config, index) => {
    displayConfig(config)
    if (index < configs.length - 1) {
      log()
    }
  })
  log()
}

export function displaySuccess(message: string): void {
  const successBox = boxen(
    chalk.green.bold('✅ ') + chalk.white(message),
    {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'single',
      borderColor: 'green',
    },
  )
  log(successBox)
}

export function displayError(message: string): void {
  const errorBox = boxen(
    chalk.red.bold('❌ ') + chalk.white(message),
    {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'single',
      borderColor: 'red',
    },
  )
  log(errorBox)
}

export function displayWarning(message: string): void {
  const warningBox = boxen(
    chalk.yellow.bold('⚠️  ') + chalk.white(message),
    {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'single',
      borderColor: 'yellow',
    },
  )
  log(warningBox)
}

export function displayInfo(message: string): void {
  const infoBox = boxen(
    chalk.blue.bold('ℹ️  ') + chalk.white(message),
    {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'single',
      borderColor: 'blue',
    },
  )
  log(infoBox)
}
