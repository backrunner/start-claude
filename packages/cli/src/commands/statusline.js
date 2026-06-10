import { ConfigManager } from '../config/manager';
import { UILogger } from '../utils/cli/ui';
import { StatusLineManager } from '../utils/statusline/manager';
export async function handleStatusLineSetupCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const configManager = ConfigManager.getInstance();
    const statusLineManager = StatusLineManager.getInstance();
    try {
        ui.displayInfo('🛠️ Setting up ccstatusline integration...');
        const setupSuccess = await statusLineManager.runStatusLineSetup(options);
        if (!setupSuccess) {
            ui.displayError('❌ ccstatusline setup failed');
            return;
        }
        ui.displayVerbose('Checking for ccstatusline configuration...');
        const ccstatuslineConfig = statusLineManager.readStatusLineConfig(options);
        if (!ccstatuslineConfig) {
            ui.displayError('❌ ccstatusline configuration not found after setup');
            return;
        }
        ui.displaySuccess('✅ ccstatusline configuration detected!');
        ui.displayVerbose(`ccstatusline config: ${JSON.stringify(ccstatuslineConfig, null, 2)}`);
        ui.displayInfo('💾 Saving statusline configuration to start-claude...');
        await configManager.updateSettings({
            statusLine: {
                enabled: true,
                config: ccstatuslineConfig,
            },
        });
        await statusLineManager.enableStatusLineInClaude(options);
        ui.displaySuccess('🎉 Statusline setup completed successfully!');
        ui.displayInfo('💡 The statusline will now be available in Claude Code');
        ui.displayInfo('💡 To disable: start-claude statusline disable');
    }
    catch (error) {
        ui.displayError(`❌ Failed to setup statusline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export async function handleStatusLineDisableCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const configManager = ConfigManager.getInstance();
    const statusLineManager = StatusLineManager.getInstance();
    try {
        ui.displayInfo('🔧 Disabling statusline integration...');
        await configManager.updateSettings({
            statusLine: {
                enabled: false,
            },
        });
        await statusLineManager.disableStatusLineInClaude(options);
        ui.displaySuccess('✅ Statusline integration disabled successfully!');
        ui.displayInfo('💡 To re-enable: start-claude setup statusline');
    }
    catch (error) {
        ui.displayError(`❌ Failed to disable statusline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export async function handleStatusLineStatusCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const configManager = ConfigManager.getInstance();
    const statusLineManager = StatusLineManager.getInstance();
    try {
        const settings = await configManager.getSettings();
        const statusLine = settings.statusLine;
        ui.displayInfo('📊 Statusline Integration Status:');
        if (!statusLine || !statusLine.enabled) {
            ui.displayInfo('   Status: ❌ Disabled');
            ui.displayInfo('   To enable: start-claude setup statusline');
            return;
        }
        ui.displayInfo('   Status: ✅ Enabled');
        const hasLocalConfig = statusLineManager.hasStatusLineConfig();
        ui.displayInfo(`   Local ccstatusline config: ${hasLocalConfig ? '✅ Found' : '❌ Missing'}`);
        const claudeSettings = await statusLineManager.loadClaudeSettings(options);
        const hasClaudeConfig = !!claudeSettings.statusLine;
        ui.displayInfo(`   Claude Code integration: ${hasClaudeConfig ? '✅ Configured' : '❌ Missing'}`);
        if (statusLine.config && options.verbose) {
            ui.displayVerbose('Stored statusline config:');
            ui.displayVerbose(JSON.stringify(statusLine.config, null, 2));
        }
    }
    catch (error) {
        ui.displayError(`❌ Failed to check statusline status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
