import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { UILogger } from '../utils/cli/ui';
import { getFrontmatterString, getFrontmatterStringList, parseMarkdownFrontmatter, renderMarkdownFrontmatter } from './frontmatter';
import { isSafeSkillName, isSafeSubagentName } from './names';
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
        const enabled = resolveEnabledExtensions(profile, settings, isProxyMode);
        this.ui.verbose(`Resolved enabled extensions: ${enabled.mcpServers.length} MCP servers, ${enabled.skills.length} skills, ${enabled.subagents.length} subagents`);
        const mcpConfig = this.prepareMcpConfig(enabled.mcpServers, library, profile);
        const skills = this.prepareSkills(enabled.skills, library);
        const subagents = this.prepareSubagents(enabled.subagents, library);
        this.writePreparedMcpConfig(mcpConfig);
        this.writePreparedSkills(skills, library);
        this.writePreparedSubagents(subagents, library);
        this.ui.verbose('All extensions written successfully');
    }
    async writeMcpConfig(enabledIds, library, profile) {
        const config = this.prepareMcpConfig(enabledIds, library, profile);
        this.writePreparedMcpConfig(config);
    }
    async writeSkills(enabledIds, library) {
        const skills = this.prepareSkills(enabledIds, library);
        this.writePreparedSkills(skills, library);
    }
    async writeSubagents(enabledIds, library) {
        const subagents = this.prepareSubagents(enabledIds, library);
        this.writePreparedSubagents(subagents, library);
    }
    async cleanupExtensionFiles() {
        this.writePreparedMcpConfig({ mcpServers: {} });
        const skillsDir = path.join(this.projectRoot, '.claude', 'skills');
        fs.mkdirSync(skillsDir, { recursive: true });
        for (const dirent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
            if (dirent.isDirectory()) {
                this.removeFileIfExists(path.join(skillsDir, dirent.name, 'SKILL.md'));
            }
        }
        const agentsDir = path.join(this.projectRoot, '.claude', 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        for (const dirent of fs.readdirSync(agentsDir, { withFileTypes: true })) {
            if (dirent.isFile() && dirent.name.endsWith('.md')) {
                this.removeFileIfExists(path.join(agentsDir, dirent.name));
            }
        }
    }
    reconcileLibraryChanges(previousLibrary, nextLibrary) {
        this.reconcileMcpChanges(previousLibrary, nextLibrary);
        this.reconcileSkillChanges(previousLibrary, nextLibrary);
        this.reconcileSubagentChanges(previousLibrary, nextLibrary);
    }
    reconcileMcpChanges(previousLibrary, nextLibrary) {
        const mcpConfigPath = path.join(this.projectRoot, '.mcp.json');
        if (!fs.existsSync(mcpConfigPath)) {
            return;
        }
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
            return;
        }
        const mcpServers = { ...parsed.mcpServers };
        let changed = false;
        for (const [id, previousServer] of Object.entries(previousLibrary.mcpServers)) {
            const nextServer = nextLibrary.mcpServers[id];
            if (nextServer && isDeepStrictEqual(previousServer, nextServer)) {
                continue;
            }
            const nativeServer = mcpServers[previousServer.name];
            if (!this.matchesManagedMcpServer(nativeServer, previousServer)) {
                continue;
            }
            delete mcpServers[previousServer.name];
            if (nextServer) {
                if (nextServer.name !== previousServer.name && hasOwn(mcpServers, nextServer.name)) {
                    throw new Error(`Cannot rename MCP server to "${nextServer.name}" because that name already exists in .mcp.json`);
                }
                mcpServers[nextServer.name] = this.prepareMcpServer(nextServer);
            }
            changed = true;
        }
        if (changed) {
            fs.writeFileSync(mcpConfigPath, JSON.stringify({ ...parsed, mcpServers }, null, 2), 'utf-8');
        }
    }
    reconcileSkillChanges(previousLibrary, nextLibrary) {
        const skillsDir = path.join(this.projectRoot, '.claude', 'skills');
        if (!fs.existsSync(skillsDir)) {
            return;
        }
        for (const [id, previousSkill] of Object.entries(previousLibrary.skills)) {
            const nextSkill = nextLibrary.skills[id];
            if (nextSkill && isDeepStrictEqual(previousSkill, nextSkill)) {
                continue;
            }
            const skillFile = this.findManagedSkillFile(skillsDir, id, previousSkill);
            if (!skillFile) {
                continue;
            }
            if (!nextSkill) {
                fs.unlinkSync(skillFile);
                continue;
            }
            this.assertSafeSkillName(nextSkill.name);
            const previousDir = path.dirname(skillFile);
            const nextDir = path.join(skillsDir, nextSkill.name);
            if (previousDir !== nextDir) {
                if (fs.existsSync(nextDir)) {
                    throw new Error(`Cannot rename skill to "${nextSkill.name}" because that directory already exists`);
                }
                fs.renameSync(previousDir, nextDir);
            }
            fs.writeFileSync(path.join(nextDir, 'SKILL.md'), this.renderSkillContent(nextSkill), 'utf-8');
        }
    }
    findManagedSkillFile(skillsDir, id, skill) {
        for (const name of new Set([skill.name, id])) {
            if (!isSafeSkillName(name)) {
                continue;
            }
            const skillFile = path.join(skillsDir, name, 'SKILL.md');
            if (fs.existsSync(skillFile) && this.isManagedSkillFile(skillFile, skill)) {
                return skillFile;
            }
        }
        return undefined;
    }
    reconcileSubagentChanges(previousLibrary, nextLibrary) {
        const agentsDir = path.join(this.projectRoot, '.claude', 'agents');
        if (!fs.existsSync(agentsDir)) {
            return;
        }
        for (const [id, previousSubagent] of Object.entries(previousLibrary.subagents)) {
            const nextSubagent = nextLibrary.subagents[id];
            if (nextSubagent && isDeepStrictEqual(previousSubagent, nextSubagent)) {
                continue;
            }
            const agentFile = this.findManagedSubagentFile(agentsDir, id, previousSubagent);
            if (!agentFile) {
                continue;
            }
            if (!nextSubagent) {
                fs.unlinkSync(agentFile);
                continue;
            }
            this.assertSafeExtensionName(nextSubagent.name, 'Subagent');
            const nextFile = path.join(agentsDir, `${nextSubagent.name}.md`);
            if (agentFile !== nextFile) {
                if (fs.existsSync(nextFile)) {
                    throw new Error(`Cannot rename subagent to "${nextSubagent.name}" because that file already exists`);
                }
                fs.renameSync(agentFile, nextFile);
            }
            fs.writeFileSync(nextFile, this.renderSubagentContent(nextSubagent), 'utf-8');
        }
    }
    findManagedSubagentFile(agentsDir, id, subagent) {
        for (const name of new Set([subagent.name, id])) {
            if (!isSafeSubagentName(name)) {
                continue;
            }
            const agentFile = path.join(agentsDir, `${name}.md`);
            if (fs.existsSync(agentFile) && this.isManagedSubagentFile(agentFile, subagent)) {
                return agentFile;
            }
        }
        return undefined;
    }
    prepareMcpConfig(enabledIds, library, profile) {
        const mcpConfig = { mcpServers: {} };
        for (const id of enabledIds) {
            const server = library.mcpServers[id];
            if (!server) {
                this.ui.warning(`MCP server "${id}" not found in library, skipping`);
                continue;
            }
            if (hasOwn(mcpConfig.mcpServers, server.name)) {
                throw new Error(`Multiple enabled MCP servers use the name "${server.name}"`);
            }
            mcpConfig.mcpServers[server.name] = this.prepareMcpServer(server, profile);
            this.ui.verbose(`Added MCP server: ${server.name} (${server.type})`);
        }
        return mcpConfig;
    }
    prepareMcpServer(server, profile) {
        if (server.type === 'stdio') {
            if (!server.command?.trim()) {
                throw new Error(`MCP server "${server.name}" is missing a command`);
            }
            const config = {
                command: this.expandMcpValue(server.command, profile),
            };
            if (server.args?.length) {
                config.args = server.args.map(arg => this.expandMcpValue(arg, profile));
            }
            if (server.env && Object.keys(server.env).length > 0) {
                config.env = Object.fromEntries(Object.entries(server.env).map(([key, value]) => [key, this.expandMcpValue(value, profile)]));
            }
            return config;
        }
        if (!server.url?.trim()) {
            throw new Error(`MCP server "${server.name}" is missing a URL`);
        }
        const config = {
            type: server.type,
            url: this.expandMcpValue(server.url, profile),
        };
        if (server.headers && Object.keys(server.headers).length > 0) {
            config.headers = Object.fromEntries(Object.entries(server.headers).map(([key, value]) => [key, this.expandMcpValue(value, profile)]));
        }
        return config;
    }
    writePreparedMcpConfig(config) {
        const mcpConfigPath = path.join(this.projectRoot, '.mcp.json');
        fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2), 'utf-8');
        this.ui.verbose(`MCP config written to: ${mcpConfigPath}`);
    }
    prepareSkills(enabledIds, library) {
        const skills = [];
        const names = new Set();
        for (const id of enabledIds) {
            const skill = library.skills[id];
            if (!skill) {
                this.ui.warning(`Skill "${id}" not found in library, skipping`);
                continue;
            }
            this.assertSafeSkillName(skill.name);
            const normalizedName = skill.name.toLowerCase();
            if (names.has(normalizedName)) {
                throw new Error(`Multiple enabled skills use the name "${skill.name}"`);
            }
            names.add(normalizedName);
            skills.push({
                id,
                name: skill.name,
                content: this.renderSkillContent(skill),
                definition: skill,
            });
        }
        return skills;
    }
    writePreparedSkills(skills, library) {
        const skillsDir = path.join(this.projectRoot, '.claude', 'skills');
        fs.mkdirSync(skillsDir, { recursive: true });
        const enabledIds = new Set(skills.map(skill => skill.id));
        for (const [id, skill] of Object.entries(library.skills)) {
            if (!enabledIds.has(id)) {
                this.disableManagedSkill(skillsDir, id, skill);
            }
        }
        for (const skill of skills) {
            const skillDir = this.prepareSkillDirectory(skillsDir, skill);
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.content, 'utf-8');
            this.ui.verbose(`Written skill: ${skill.name}`);
        }
        this.ui.verbose(`Skills written to: ${skillsDir}`);
    }
    prepareSkillDirectory(skillsDir, skill) {
        const targetDir = path.join(skillsDir, skill.name);
        if (skill.id === skill.name || !this.isSafeExtensionName(skill.id)) {
            return targetDir;
        }
        const previousDir = path.join(skillsDir, skill.id);
        const previousFile = path.join(previousDir, 'SKILL.md');
        if (!fs.existsSync(previousFile) || !this.isManagedSkillFile(previousFile, skill.definition)) {
            return targetDir;
        }
        if (!fs.existsSync(targetDir)) {
            fs.renameSync(previousDir, targetDir);
        }
        else {
            fs.unlinkSync(previousFile);
        }
        return targetDir;
    }
    disableManagedSkill(skillsDir, id, skill) {
        const names = new Set([skill.name, id]);
        for (const name of names) {
            if (!isSafeSkillName(name)) {
                continue;
            }
            const skillFile = path.join(skillsDir, name, 'SKILL.md');
            if (fs.existsSync(skillFile) && this.isManagedSkillFile(skillFile, skill)) {
                fs.unlinkSync(skillFile);
                this.ui.verbose(`Disabled skill: ${skill.name}`);
            }
        }
    }
    isManagedSkillFile(filePath, skill) {
        const existingContent = fs.readFileSync(filePath, 'utf-8');
        if (existingContent === skill.content) {
            return true;
        }
        try {
            return existingContent === this.renderSkillContent(skill);
        }
        catch {
            return false;
        }
    }
    prepareSubagents(enabledIds, library) {
        const subagents = [];
        const names = new Set();
        for (const id of enabledIds) {
            const subagent = library.subagents[id];
            if (!subagent) {
                this.ui.warning(`Subagent "${id}" not found in library, skipping`);
                continue;
            }
            this.assertSafeExtensionName(subagent.name, 'Subagent');
            const normalizedName = subagent.name.toLowerCase();
            if (names.has(normalizedName)) {
                throw new Error(`Multiple enabled subagents use the name "${subagent.name}"`);
            }
            names.add(normalizedName);
            subagents.push({
                id,
                name: subagent.name,
                content: this.renderSubagentContent(subagent),
            });
        }
        return subagents;
    }
    writePreparedSubagents(subagents, library) {
        const agentsDir = path.join(this.projectRoot, '.claude', 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        const enabledIds = new Set(subagents.map(subagent => subagent.id));
        for (const [id, subagent] of Object.entries(library.subagents)) {
            if (!enabledIds.has(id)) {
                this.removeSubagentFiles(agentsDir, id, subagent);
            }
        }
        for (const subagent of subagents) {
            fs.writeFileSync(path.join(agentsDir, `${subagent.name}.md`), subagent.content, 'utf-8');
            this.ui.verbose(`Written subagent: ${subagent.name}`);
        }
        this.ui.verbose(`Subagents written to: ${agentsDir}`);
    }
    renderSubagentContent(subagent) {
        return renderMarkdownFrontmatter(`\n${subagent.systemPrompt}`, {
            name: subagent.name,
            description: subagent.description,
            tools: subagent.tools?.length ? subagent.tools.join(', ') : undefined,
            model: subagent.model,
        });
    }
    removeSubagentFiles(agentsDir, id, subagent) {
        const names = new Set([subagent.name, id]);
        for (const name of names) {
            if (!isSafeSubagentName(name)) {
                continue;
            }
            const agentFile = path.join(agentsDir, `${name}.md`);
            if (fs.existsSync(agentFile) && this.isManagedSubagentFile(agentFile, subagent)) {
                fs.unlinkSync(agentFile);
            }
        }
    }
    isManagedSubagentFile(filePath, subagent) {
        try {
            const { attributes, body } = parseMarkdownFrontmatter(fs.readFileSync(filePath, 'utf-8'));
            const fileName = path.basename(filePath);
            const name = getFrontmatterString(attributes, 'name') || fileName.replace(/\.md$/, '');
            const description = getFrontmatterString(attributes, 'description')
                || `Imported from .claude/agents/${fileName}`;
            const model = attributes.model === 'sonnet'
                || attributes.model === 'opus'
                || attributes.model === 'haiku'
                || attributes.model === 'inherit'
                ? attributes.model
                : undefined;
            return name === subagent.name
                && description === subagent.description
                && body === subagent.systemPrompt
                && isDeepStrictEqual(getFrontmatterStringList(attributes, 'tools'), subagent.tools)
                && model === subagent.model;
        }
        catch {
            return false;
        }
    }
    removeFileIfExists(filePath) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    expandEnvVars(value, profile) {
        if (!value) {
            return value;
        }
        let expanded = value.replace(/\$\{([^}:]+):-([^}]*)\}/g, (match, varName, defaultValue) => {
            const envValue = profile.env?.[varName] ?? process.env[varName];
            return envValue !== undefined ? envValue : defaultValue;
        });
        expanded = expanded.replace(/\$\{([^}:]+)\}/g, (match, varName) => {
            const envValue = profile.env?.[varName] ?? process.env[varName];
            return envValue !== undefined ? envValue : match;
        });
        return expanded.replace(/^~(?=$|[\\/])/, os.homedir());
    }
    expandMcpValue(value, profile) {
        return profile ? this.expandEnvVars(value, profile) : value;
    }
    matchesManagedMcpServer(value, server) {
        if (!isRecord(value)) {
            return false;
        }
        const normalizedValue = { ...value };
        if (normalizedValue.type === 'stdio') {
            delete normalizedValue.type;
        }
        for (const key of ['args', 'env', 'headers']) {
            const field = normalizedValue[key];
            if ((Array.isArray(field) && field.length === 0) || (isRecord(field) && Object.keys(field).length === 0)) {
                delete normalizedValue[key];
            }
        }
        try {
            return isDeepStrictEqual(normalizedValue, this.prepareMcpServer(server));
        }
        catch {
            return false;
        }
    }
    renderSkillContent(skill) {
        const attributes = {
            name: skill.name,
            description: skill.description,
        };
        attributes['allowed-tools'] = skill.allowedTools?.length ? skill.allowedTools.join(', ') : undefined;
        return renderMarkdownFrontmatter(skill.content, attributes);
    }
    assertSafeExtensionName(name, type) {
        if (!this.isSafeExtensionName(name)) {
            throw new Error(`${type} name "${name}" must contain only lowercase letters, numbers, and hyphens`);
        }
    }
    assertSafeSkillName(name) {
        if (!isSafeSkillName(name)) {
            throw new Error(`Skill name "${name}" is not a safe cross-platform directory name`);
        }
    }
    isSafeExtensionName(name) {
        return isSafeSubagentName(name);
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
