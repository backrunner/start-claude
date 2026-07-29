import process from 'node:process';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/manager';
import { UILogger } from '../utils/cli/ui';
function generateNewName(baseName, existingConfigs) {
    const match = baseName.match(/^(.*?)(?:-(\d+))?$/);
    const base = match?.[1] || baseName;
    const existingNum = match?.[2] ? Number.parseInt(match[2], 10) : 1;
    let num = existingNum + 1;
    let newName = `${base}-${num}`;
    while (existingConfigs.some(c => c.name === newName)) {
        num++;
        newName = `${base}-${num}`;
    }
    return newName;
}
export async function handleDuplicateCommand(originalName, newName) {
    const ui = new UILogger();
    const configManager = ConfigManager.getInstance();
    const originalConfig = await configManager.getConfig(originalName);
    if (!originalConfig) {
        ui.displayError(`Configuration "${originalName}" not found`);
        process.exit(1);
    }
    const allConfigs = await configManager.listConfigs();
    let finalNewName;
    if (!newName) {
        const generatedName = generateNewName(originalConfig.name, allConfigs);
        ui.displayInfo(`Auto-generated new name: ${generatedName}`);
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'newName',
                message: 'Enter new configuration name (press Enter to use the generated name):',
                default: generatedName,
                validate: (input) => {
                    if (!input || input.trim().length === 0) {
                        return 'Configuration name cannot be empty';
                    }
                    if (allConfigs.some(c => c.name === input.trim())) {
                        return `Configuration "${input.trim()}" already exists`;
                    }
                    return true;
                },
            },
        ]);
        finalNewName = answers.newName.trim();
    }
    else {
        if (allConfigs.some(c => c.name === newName)) {
            ui.displayError(`Configuration "${newName}" already exists`);
            process.exit(1);
        }
        finalNewName = newName;
    }
    const { id, isDefault, order, ...configWithoutId } = originalConfig;
    const duplicatedConfig = {
        ...configWithoutId,
        name: finalNewName,
        isDefault: false,
    };
    try {
        await configManager.addConfig(duplicatedConfig);
        ui.displaySuccess(`Configuration "${originalName}" duplicated as "${finalNewName}" successfully!`);
    }
    catch (error) {
        ui.displayError(`Failed to duplicate configuration: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
