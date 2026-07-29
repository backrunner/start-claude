import process from 'node:process';
import { ConfigManager } from '../config/manager';
import { UILogger } from '../utils/cli/ui';
import { runSkillsCatAdd } from '../utils/skills/skillscat';
import { ClaudeConfigSyncer } from './claude-config-syncer';
export async function installSkillFromSkillsCat(source, options = {}, projectRoot = process.cwd(), ui = new UILogger(options.verbose)) {
    await runSkillsCatAdd(source, options, { cwd: projectRoot });
    const configManager = ConfigManager.getInstance();
    const configFile = await configManager.load();
    const library = configFile.settings.extensionsLibrary || {
        mcpServers: {},
        skills: {},
        subagents: {},
    };
    const syncResult = await new ClaudeConfigSyncer(projectRoot, ui).syncClaudeConfig(library);
    if (syncResult.result.totalChanged > 0) {
        const defaultEnabled = configFile.settings.defaultEnabledExtensions || {
            mcpServers: [],
            skills: [],
            subagents: [],
        };
        configFile.settings.extensionsLibrary = syncResult.library;
        configFile.settings.defaultEnabledExtensions = {
            mcpServers: [...new Set([...defaultEnabled.mcpServers, ...syncResult.defaultEnabled.mcpServers])],
            skills: [...new Set([...defaultEnabled.skills, ...syncResult.defaultEnabled.skills])],
            subagents: [...new Set([...defaultEnabled.subagents, ...syncResult.defaultEnabled.subagents])],
        };
        await configManager.save(configFile);
    }
    return {
        library: syncResult.library,
        sync: syncResult.result,
    };
}
