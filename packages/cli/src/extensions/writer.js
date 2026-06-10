import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { UILogger } from '../utils/cli/ui';
import { resolveEnabledExtensions } from './resolver';
export class ExtensionsWriter {
    projectRoot;
    ui;
    constructor(projectRoot = process.cwd(), ui) {
        this.projectRoot = projectRoot;
        this.ui = ui || new UILogger(false);
    }
    async writeExtensions(profile, library, settings, isProxyMode = false) {
        this.ui.verbose(`Writing extensions for profile: ${profile.name}`);
        this.ui.verbose(`Proxy mode: ${isProxyMode}`);
        await this.cleanupExtensionFiles();
        const enabled = resolveEnabledExtensions(profile, settings, isProxyMode);
        this.ui.verbose(`Resolved enabled extensions: ${enabled.mcpServers.length} MCP servers, ${enabled.skills.length} skills, ${enabled.subagents.length} subagents`);
        await this.writeMcpConfig(enabled.mcpServers, library, profile);
        await this.writeSkills(enabled.skills, library);
        await this.writeSubagents(enabled.subagents, library);
        this.ui.verbose('All extensions written successfully');
    }
    async writeMcpConfig(enabledIds, library, profile) {
        if (enabledIds.length === 0) {
            this.ui.verbose('No MCP servers enabled');
            return;
        }
        const mcpConfig = {
            mcpServers: {},
        };
        for (const id of enabledIds) {
            const server = library.mcpServers[id];
            if (!server) {
                this.ui.warning(`MCP server "${id}" not found in library, skipping`);
                continue;
            }
            const serverConfig = {};
            if (server.type === 'stdio') {
                serverConfig.command = this.expandEnvVars(server.command || '', profile);
                if (server.args && server.args.length > 0) {
                    serverConfig.args = server.args.map(arg => this.expandEnvVars(arg, profile));
                }
                if (server.env && Object.keys(server.env).length > 0) {
                    serverConfig.env = {};
                    for (const [key, value] of Object.entries(server.env)) {
                        serverConfig.env[key] = this.expandEnvVars(value, profile);
                    }
                }
            }
            else if (server.type === 'http' || server.type === 'sse') {
                serverConfig.type = server.type;
                serverConfig.url = this.expandEnvVars(server.url || '', profile);
                if (server.headers && Object.keys(server.headers).length > 0) {
                    serverConfig.headers = {};
                    for (const [key, value] of Object.entries(server.headers)) {
                        serverConfig.headers[key] = this.expandEnvVars(value, profile);
                    }
                }
            }
            mcpConfig.mcpServers[server.name] = serverConfig;
            this.ui.verbose(`Added MCP server: ${server.name} (${server.type})`);
        }
        const mcpConfigPath = path.join(this.projectRoot, '.mcp.json');
        fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
        this.ui.verbose(`MCP config written to: ${mcpConfigPath}`);
    }
    async writeSkills(enabledIds, library) {
        if (enabledIds.length === 0) {
            this.ui.verbose('No skills enabled');
            return;
        }
        const skillsDir = path.join(this.projectRoot, '.claude', 'skills');
        if (!fs.existsSync(skillsDir)) {
            fs.mkdirSync(skillsDir, { recursive: true });
        }
        for (const id of enabledIds) {
            const skill = library.skills[id];
            if (!skill) {
                this.ui.warning(`Skill "${id}" not found in library, skipping`);
                continue;
            }
            const skillDir = path.join(skillsDir, skill.name);
            if (!fs.existsSync(skillDir)) {
                fs.mkdirSync(skillDir, { recursive: true });
            }
            let skillContent;
            if (this.hasFrontmatter(skill.content)) {
                skillContent = skill.content;
                this.ui.verbose(`Skill "${skill.name}" already has frontmatter, using content as-is`);
            }
            else {
                skillContent = '---\n';
                skillContent += `name: ${skill.name}\n`;
                skillContent += `description: ${skill.description}\n`;
                if (skill.allowedTools && skill.allowedTools.length > 0) {
                    skillContent += `allowed-tools: ${skill.allowedTools.join(', ')}\n`;
                }
                skillContent += '---\n\n';
                skillContent += skill.content;
            }
            const skillFilePath = path.join(skillDir, 'SKILL.md');
            fs.writeFileSync(skillFilePath, skillContent, 'utf-8');
            this.ui.verbose(`Written skill: ${skill.name}`);
        }
        this.ui.verbose(`Skills written to: ${skillsDir}`);
    }
    async writeSubagents(enabledIds, library) {
        if (enabledIds.length === 0) {
            this.ui.verbose('No subagents enabled');
            return;
        }
        const agentsDir = path.join(this.projectRoot, '.claude', 'agents');
        if (!fs.existsSync(agentsDir)) {
            fs.mkdirSync(agentsDir, { recursive: true });
        }
        for (const id of enabledIds) {
            const subagent = library.subagents[id];
            if (!subagent) {
                this.ui.warning(`Subagent "${id}" not found in library, skipping`);
                continue;
            }
            let agentContent = '---\n';
            agentContent += `name: ${subagent.name}\n`;
            agentContent += `description: ${subagent.description}\n`;
            if (subagent.tools && subagent.tools.length > 0) {
                agentContent += `tools: ${subagent.tools.join(', ')}\n`;
            }
            if (subagent.model) {
                agentContent += `model: ${subagent.model}\n`;
            }
            agentContent += '---\n\n';
            agentContent += subagent.systemPrompt;
            const agentFilePath = path.join(agentsDir, `${subagent.name}.md`);
            fs.writeFileSync(agentFilePath, agentContent, 'utf-8');
            this.ui.verbose(`Written subagent: ${subagent.name}`);
        }
        this.ui.verbose(`Subagents written to: ${agentsDir}`);
    }
    async cleanupExtensionFiles() {
        this.ui.verbose('Cleaning up old extension files...');
        const mcpConfigPath = path.join(this.projectRoot, '.mcp.json');
        if (fs.existsSync(mcpConfigPath)) {
            fs.unlinkSync(mcpConfigPath);
            this.ui.verbose('Removed old .mcp.json');
        }
        const skillsDir = path.join(this.projectRoot, '.claude', 'skills');
        if (fs.existsSync(skillsDir)) {
            fs.rmSync(skillsDir, { recursive: true, force: true });
            this.ui.verbose('Removed old skills directory');
        }
        const agentsDir = path.join(this.projectRoot, '.claude', 'agents');
        if (fs.existsSync(agentsDir)) {
            fs.rmSync(agentsDir, { recursive: true, force: true });
            this.ui.verbose('Removed old agents directory');
        }
    }
    expandEnvVars(value, profile) {
        if (!value) {
            return value;
        }
        let expanded = value.replace(/\$\{([^}:]+):-([^}]+)\}/g, (match, varName, defaultValue) => {
            const envValue = profile.env?.[varName] || process.env[varName];
            return envValue !== undefined ? envValue : defaultValue;
        });
        expanded = expanded.replace(/\$\{([^}:]+)\}/g, (match, varName) => {
            const envValue = profile.env?.[varName] || process.env[varName];
            return envValue !== undefined ? envValue : match;
        });
        expanded = expanded.replace(/\$\{HOME\}/g, os.homedir());
        expanded = expanded.replace(/~/g, os.homedir());
        return expanded;
    }
    hasFrontmatter(content) {
        if (!content) {
            return false;
        }
        return content.trimStart().startsWith('---');
    }
}
