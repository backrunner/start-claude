import { copyFileSync, existsSync, mkdirSync, readlinkSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import inquirer from 'inquirer';
import { UILogger } from '../cli/ui';
export class CloudConfigSyncer {
    static isSymlinkCompatible(filePath) {
        try {
            if (process.platform === 'win32') {
                try {
                    readlinkSync(filePath);
                    return true;
                }
                catch {
                    return false;
                }
            }
            else {
                const stats = statSync(filePath);
                return stats.isSymbolicLink();
            }
        }
        catch {
            return false;
        }
    }
    static createSymlink(sourcePath, targetPath) {
        if (process.platform === 'win32') {
            symlinkSync(sourcePath, targetPath, 'file');
        }
        else {
            symlinkSync(sourcePath, targetPath);
        }
    }
    static async syncConfigFileToCloud(configInfo, options) {
        if (!existsSync(configInfo.localPath)) {
            if (options.verbose) {
                new UILogger().displayInfo(`ℹ️  No ${configInfo.description} found to sync`);
            }
            return;
        }
        const cloudConfigDir = join(options.cloudPath, '.start-claude');
        const cloudConfigPath = join(cloudConfigDir, configInfo.cloudFileName);
        try {
            if (!existsSync(cloudConfigDir)) {
                mkdirSync(cloudConfigDir, { recursive: true });
            }
            if (existsSync(cloudConfigPath)) {
                const promptMessage = options.overwritePromptMessage
                    || `${configInfo.description} already exists in cloud folder. Overwrite with local version?`;
                const { overwrite } = await inquirer.prompt([{
                        type: 'confirm',
                        name: 'overwrite',
                        message: promptMessage,
                        default: false,
                    }]);
                if (overwrite) {
                    copyFileSync(configInfo.localPath, cloudConfigPath);
                    new UILogger().displayInfo(`📤 Copied local ${configInfo.description} to cloud folder`);
                }
                else {
                    new UILogger().displayInfo(`📥 Using existing ${configInfo.description} from cloud folder`);
                }
            }
            else {
                copyFileSync(configInfo.localPath, cloudConfigPath);
                new UILogger().displayInfo(`📤 Copied ${configInfo.description} to cloud folder`);
            }
            if (!this.isSymlinkCompatible(configInfo.localPath)) {
                let backupPath;
                if (options.backupOnReplace) {
                    backupPath = `${configInfo.localPath}.backup.${Date.now()}`;
                    copyFileSync(configInfo.localPath, backupPath);
                    new UILogger().displayInfo(`💾 Backed up ${configInfo.description} to: ${backupPath}`);
                }
                unlinkSync(configInfo.localPath);
                try {
                    this.createSymlink(cloudConfigPath, configInfo.localPath);
                    new UILogger().displayInfo(`🔗 Created symlink for ${configInfo.description} to cloud storage`);
                }
                catch (linkErr) {
                    if (backupPath) {
                        try {
                            copyFileSync(backupPath, configInfo.localPath);
                            new UILogger().displayWarning(`⚠️  Failed to create symlink; restored ${configInfo.description} from backup`);
                        }
                        catch { }
                    }
                    throw linkErr;
                }
            }
        }
        catch (error) {
            new UILogger().displayWarning(`⚠️  Failed to sync ${configInfo.description} to cloud: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static async syncConfigFilesToCloud(configFiles, options) {
        for (const configFile of configFiles) {
            await this.syncConfigFileToCloud(configFile, options);
        }
    }
    static getStandardConfigFiles() {
        const configDir = join(homedir(), '.start-claude');
        return [
            {
                name: 'main-config',
                localPath: join(configDir, 'config.json'),
                cloudFileName: 'config.json',
                description: 'main configuration',
            },
            {
                name: 's3-config',
                localPath: join(configDir, 's3-config.json'),
                cloudFileName: 's3-config.json',
                description: 'S3 configuration',
            },
        ];
    }
}
