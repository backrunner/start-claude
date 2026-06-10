import boxen from 'boxen';
import chalk from 'chalk';
chalk.level = 1;
const log = console.log;
export class UILogger {
    isVerbose;
    constructor(isVerbose = false) {
        this.isVerbose = isVerbose;
    }
    displayWelcome() {
        log();
        log(chalk.cyan.bold('🚀 Start Claude CLI'));
        log(chalk.gray('Manage your Claude Code configurations with ease'));
        log();
    }
    displayConfig(config) {
        const defaultIndicator = config.isDefault ? chalk.yellow('●') : chalk.gray('○');
        log(`${defaultIndicator} ${chalk.cyan.bold(config.name)}${config.isDefault ? chalk.yellow(' (default)') : ''}`);
        if (config.baseUrl) {
            log(`  ${chalk.gray('└─ Base URL:')} ${chalk.white(config.baseUrl)}`);
        }
        if (config.apiKey) {
            log(`  ${chalk.gray('└─ API Key:')} ${chalk.white(config.apiKey.slice(0, 8))}***`);
        }
        if (config.model) {
            log(`  ${chalk.gray('└─ Model:')} ${chalk.white(config.model)}`);
        }
    }
    displayConfigList(configs) {
        if (configs.length === 0) {
            log();
            log(chalk.yellow('No configurations found'));
            log(chalk.gray('Use "start-claude add" to create your first configuration'));
            log();
            return;
        }
        log();
        log(chalk.bold('Available Configurations:'));
        log();
        configs.forEach((config) => {
            this.displayConfig(config);
            log();
        });
    }
    displaySuccess(message) {
        log(chalk.green(message));
    }
    displayError(message) {
        log(chalk.red(message));
    }
    displayWarning(message) {
        log(chalk.yellow(message));
    }
    displayInfo(message) {
        log(chalk.blue(message));
    }
    displayGrey(message) {
        log(chalk.gray(message));
    }
    displayVerbose(message) {
        if (this.isVerbose) {
            log(chalk.gray(`[Verbose] ${message}`));
        }
    }
    success = this.displaySuccess.bind(this);
    error = this.displayError.bind(this);
    warning = this.displayWarning.bind(this);
    info = this.displayInfo.bind(this);
    verbose = this.displayVerbose.bind(this);
    displayBoxedConfig(config) {
        const configDetails = [];
        configDetails.push(`${chalk.bold('Name:')} ${chalk.cyan(config.name)}`);
        if (config.baseUrl) {
            configDetails.push(`${chalk.bold('Base URL:')} ${chalk.white(config.baseUrl)}`);
        }
        if (config.apiKey) {
            configDetails.push(`${chalk.bold('API Key:')} ${chalk.white(config.apiKey.slice(0, 8))}***`);
        }
        if (config.model) {
            configDetails.push(`${chalk.bold('Model:')} ${chalk.white(config.model)}`);
        }
        if (config.permissionMode) {
            configDetails.push(`${chalk.bold('Permission Mode:')} ${chalk.white(config.permissionMode)}`);
        }
        if (config.httpProxy) {
            configDetails.push(`${chalk.bold('HTTP Proxy:')} ${chalk.white(config.httpProxy)}`);
        }
        if (config.httpsProxy) {
            configDetails.push(`${chalk.bold('HTTPS Proxy:')} ${chalk.white(config.httpsProxy)}`);
        }
        const boxContent = configDetails.join('\n');
        log(boxen(boxContent, {
            title: 'Using Configuration',
            titleAlignment: 'center',
            padding: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
        }));
        log();
    }
}
