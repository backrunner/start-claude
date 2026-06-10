import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { UILogger } from '../utils/cli/ui';
export class ClaudeConfigSyncer {
    projectRoot;
    ui;
    constructor(projectRoot = process.cwd(), ui) {
        this.projectRoot = projectRoot;
        this.ui = ui || new UILogger(false);
    }
    async syncClaudeConfig(existingLibrary) {
        const result = {
            mcpServersAdded: 0,
            skillsAdded: 0,
            subagentsAdded: 0,
            totalAdded: 0,
        };
        const library = {
            mcpServers: { ...existingLibrary.mcpServers },
            skills: { ...existingLibrary.skills },
            subagents: { ...existingLibrary.subagents },
        };
        const defaultEnabled = {
            mcpServers: [],
            skills: [],
            subagents: [],
        };
        const mcpIds = await this.syncMcpServers(library);
        result.mcpServersAdded = mcpIds.length;
        defaultEnabled.mcpServers = mcpIds;
        const skillIds = await this.syncSkills(library);
        result.skillsAdded = skillIds.length;
        defaultEnabled.skills = skillIds;
        const subagentIds = await this.syncSubagents(library);
        result.subagentsAdded = subagentIds.length;
        defaultEnabled.subagents = subagentIds;
        result.totalAdded = result.mcpServersAdded + result.skillsAdded + result.subagentsAdded;
        return { library, result, defaultEnabled };
    }
    async syncMcpServers(library) {
        const mcpConfigPath = path.join(this.projectRoot, '.mcp.json');
        if (!fs.existsSync(mcpConfigPath)) {
            return [];
        }
        try {
            const content = fs.readFileSync(mcpConfigPath, 'utf-8');
            const mcpConfig = JSON.parse(content);
            if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== 'object') {
                return [];
            }
            const addedIds = [];
            for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
                const baseId = this.generateId(serverName);
                const id = this.getUniqueId(baseId, library.mcpServers);
                if (library.mcpServers[id]) {
                    continue;
                }
                const type = serverConfig.type === 'sse'
                    ? 'sse'
                    : serverConfig.type === 'http'
                        ? 'http'
                        : 'stdio';
                const server = {
                    id,
                    name: serverName,
                    description: `Imported from .mcp.json`,
                    type,
                };
                if (type === 'stdio') {
                    server.command = serverConfig.command || '';
                    server.args = serverConfig.args || [];
                    server.env = serverConfig.env || {};
                }
                else {
                    server.url = serverConfig.url || '';
                    server.headers = serverConfig.headers || {};
                }
                library.mcpServers[id] = server;
                addedIds.push(id);
            }
            return addedIds;
        }
        catch (error) {
            this.ui.error(`Error syncing MCP servers: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async syncSkills(library) {
        const skillsDir = path.join(this.projectRoot, '.claude', 'skills');
        if (!fs.existsSync(skillsDir)) {
            return [];
        }
        try {
            const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory());
            const addedIds = [];
            for (const dirent of skillDirs) {
                const skillDir = path.join(skillsDir, dirent.name);
                const skillFile = path.join(skillDir, 'SKILL.md');
                if (!fs.existsSync(skillFile)) {
                    continue;
                }
                const content = fs.readFileSync(skillFile, 'utf-8');
                const { frontmatter } = this.parseFrontmatter(content);
                const skillName = frontmatter.name || dirent.name;
                const baseId = this.generateId(skillName);
                const id = this.getUniqueId(baseId, library.skills);
                if (library.skills[id]) {
                    continue;
                }
                const skill = {
                    id,
                    name: skillName,
                    description: frontmatter.description || `Imported from .claude/skills/${dirent.name}`,
                    content,
                    allowedTools: frontmatter['allowed-tools']
                        ? frontmatter['allowed-tools'].split(',').map((t) => t.trim())
                        : undefined,
                };
                library.skills[id] = skill;
                addedIds.push(id);
            }
            return addedIds;
        }
        catch (error) {
            this.ui.error(`Error syncing skills: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async syncSubagents(library) {
        const agentsDir = path.join(this.projectRoot, '.claude', 'agents');
        if (!fs.existsSync(agentsDir)) {
            return [];
        }
        try {
            const agentFiles = fs.readdirSync(agentsDir, { withFileTypes: true })
                .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'));
            const addedIds = [];
            for (const dirent of agentFiles) {
                const agentFile = path.join(agentsDir, dirent.name);
                const content = fs.readFileSync(agentFile, 'utf-8');
                const { frontmatter, body } = this.parseFrontmatter(content);
                const agentNameFromFile = dirent.name.replace(/\.md$/, '');
                const agentName = frontmatter.name || agentNameFromFile;
                const baseId = this.generateId(agentName);
                const id = this.getUniqueId(baseId, library.subagents);
                if (library.subagents[id]) {
                    continue;
                }
                const subagent = {
                    id,
                    name: agentName,
                    description: frontmatter.description || `Imported from .claude/agents/${dirent.name}`,
                    systemPrompt: body,
                    tools: frontmatter.tools
                        ? frontmatter.tools.split(',').map((t) => t.trim())
                        : undefined,
                    model: frontmatter.model,
                };
                library.subagents[id] = subagent;
                addedIds.push(id);
            }
            return addedIds;
        }
        catch (error) {
            this.ui.error(`Error syncing subagents: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    parseFrontmatter(content) {
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
        const match = content.match(frontmatterRegex);
        if (!match) {
            return { frontmatter: {}, body: content };
        }
        const frontmatterText = match[1];
        const body = match[2];
        const frontmatter = {};
        const lines = frontmatterText.split('\n');
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) {
                continue;
            }
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            frontmatter[key] = value;
        }
        return { frontmatter, body };
    }
    generateId(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
    getUniqueId(baseId, existing) {
        if (!existing[baseId]) {
            return baseId;
        }
        let counter = 2;
        let id = `${baseId}-${counter}`;
        while (existing[id]) {
            counter++;
            id = `${baseId}-${counter}`;
        }
        return id;
    }
}
