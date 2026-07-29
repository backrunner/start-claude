import { ConfigManager } from '../config/manager';
import { pruneMissingExtensionReferences } from '../extensions/references';
import { ExtensionsWriter } from '../extensions/writer';
import { UILogger } from '../utils/cli/ui';
const configManager = ConfigManager.getInstance();
function isUnknownRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isStringRecord(value) {
    return isUnknownRecord(value)
        && Object.values(value).every(item => typeof item === 'string');
}
export function parseMcpServerConfig(value) {
    if (!isUnknownRecord(value)) {
        throw new Error('Configuration must be a JSON object.');
    }
    if (value.type !== 'stdio' && value.type !== 'http' && value.type !== 'sse') {
        throw new Error('Invalid or missing "type" field. Must be stdio, http, or sse.');
    }
    if (value.args !== undefined
        && (!Array.isArray(value.args) || !value.args.every(item => typeof item === 'string'))) {
        throw new Error('The "args" field must be an array of strings.');
    }
    if (value.env !== undefined && !isStringRecord(value.env)) {
        throw new Error('The "env" field must be an object with string values.');
    }
    if (value.headers !== undefined && !isStringRecord(value.headers)) {
        throw new Error('The "headers" field must be an object with string values.');
    }
    if (value.description !== undefined && typeof value.description !== 'string') {
        throw new Error('The "description" field must be a string.');
    }
    if (value.command !== undefined && typeof value.command !== 'string') {
        throw new Error('The "command" field must be a string.');
    }
    if (value.url !== undefined && typeof value.url !== 'string') {
        throw new Error('The "url" field must be a string.');
    }
    if (value.type === 'stdio' && !value.command?.trim()) {
        throw new Error('Missing "command" field for stdio transport.');
    }
    if ((value.type === 'http' || value.type === 'sse') && !value.url?.trim()) {
        throw new Error(`Missing "url" field for ${value.type} transport.`);
    }
    return {
        type: value.type,
        command: value.command,
        args: value.args,
        env: value.env,
        url: value.url,
        headers: value.headers,
        description: value.description,
    };
}
function generateId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'mcp-server';
}
function hasServerName(library, name) {
    const normalizedName = name.trim().toLowerCase();
    return Object.values(library.mcpServers)
        .some(server => server.name.trim().toLowerCase() === normalizedName);
}
function getUniqueId(baseId, existing) {
    if (!existing[baseId])
        return baseId;
    let counter = 2;
    let id = `${baseId}-${counter}`;
    while (existing[id]) {
        counter++;
        id = `${baseId}-${counter}`;
    }
    return id;
}
function parseEnvVars(envOptions) {
    const env = {};
    for (const envStr of envOptions) {
        const match = envStr.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1]] = match[2];
        }
    }
    return env;
}
function parseHeaders(headerOptions) {
    const headers = {};
    for (const headerStr of headerOptions) {
        const colonIndex = headerStr.indexOf(':');
        if (colonIndex !== -1) {
            const key = headerStr.slice(0, colonIndex).trim();
            const value = headerStr.slice(colonIndex + 1).trim();
            headers[key] = value;
        }
    }
    return headers;
}
function findSeparator(args) {
    return args.indexOf('--');
}
export async function handleMcpAddCommand(name, args, options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const transport = options.transport || 'stdio';
    const scope = options.scope || 'user';
    if (!['stdio', 'http', 'sse'].includes(transport)) {
        ui.displayError(`Invalid transport type: ${transport}. Must be stdio, http, or sse.`);
        return;
    }
    if (!['local', 'user'].includes(scope)) {
        ui.displayError(`Invalid scope: ${scope}. Must be local or user.`);
        return;
    }
    const configFile = await configManager.load();
    const library = configFile.settings.extensionsLibrary || {
        mcpServers: {},
        skills: {},
        subagents: {},
    };
    const serverName = name.trim();
    if (!serverName) {
        ui.displayError('MCP server name is required.');
        return;
    }
    if (hasServerName(library, serverName)) {
        ui.displayError(`An MCP server named "${serverName}" already exists.`);
        return;
    }
    const baseId = generateId(serverName);
    const id = getUniqueId(baseId, library.mcpServers);
    const server = {
        id,
        name: serverName,
        type: transport,
        scope: scope,
    };
    if (transport === 'stdio') {
        const separatorIndex = findSeparator(args);
        if (separatorIndex !== -1) {
            const commandArgs = args.slice(separatorIndex + 1);
            if (commandArgs.length === 0) {
                ui.displayError('No command specified after -- separator');
                return;
            }
            server.command = commandArgs[0];
            server.args = commandArgs.slice(1);
        }
        else {
            if (args.length === 0) {
                ui.displayError('No command specified for stdio transport');
                return;
            }
            server.command = args[0];
            server.args = args.slice(1);
        }
        if (options.env && options.env.length > 0) {
            server.env = parseEnvVars(options.env);
        }
    }
    else if (transport === 'http' || transport === 'sse') {
        if (args.length === 0) {
            ui.displayError(`No URL specified for ${transport} transport`);
            return;
        }
        server.url = args[0];
        if (options.header && options.header.length > 0) {
            server.headers = parseHeaders(options.header);
        }
    }
    library.mcpServers[id] = server;
    if (scope === 'user') {
        const defaultEnabled = configFile.settings.defaultEnabledExtensions || {
            mcpServers: [],
            skills: [],
            subagents: [],
        };
        if (!defaultEnabled.mcpServers.includes(id)) {
            defaultEnabled.mcpServers.push(id);
        }
        configFile.settings.defaultEnabledExtensions = defaultEnabled;
    }
    else if (scope === 'local') {
        ui.displayInfo(`Server added to library with scope: ${scope}`);
        ui.displayInfo('To enable for a specific profile, use the manager UI or modify the profile config.');
    }
    configFile.settings.extensionsLibrary = library;
    await configManager.save(configFile);
    ui.displaySuccess(`✅ MCP server "${name}" added successfully!`);
    ui.displayInfo(`   ID: ${id}`);
    ui.displayInfo(`   Type: ${transport}`);
    ui.displayInfo(`   Scope: ${scope}`);
    if (server.type === 'stdio') {
        ui.displayInfo(`   Command: ${server.command}`);
        if (server.args && server.args.length > 0) {
            ui.displayInfo(`   Args: ${server.args.join(' ')}`);
        }
    }
    else {
        ui.displayInfo(`   URL: ${server.url}`);
    }
}
export async function handleMcpRemoveCommand(name, options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const configFile = await configManager.load();
    const library = configFile.settings.extensionsLibrary || {
        mcpServers: {},
        skills: {},
        subagents: {},
    };
    const previousLibrary = structuredClone(library);
    let serverId = null;
    let server = null;
    if (library.mcpServers[name]) {
        serverId = name;
        server = library.mcpServers[name];
    }
    else {
        for (const [id, srv] of Object.entries(library.mcpServers)) {
            if (srv.name === name || srv.name.toLowerCase() === name.toLowerCase()) {
                serverId = id;
                server = srv;
                break;
            }
        }
    }
    if (!serverId || !server) {
        ui.displayError(`MCP server "${name}" not found.`);
        ui.displayInfo('Use "start-claude mcp list" to see available servers.');
        return;
    }
    delete library.mcpServers[serverId];
    const defaultEnabled = configFile.settings.defaultEnabledExtensions;
    if (defaultEnabled?.mcpServers) {
        const index = defaultEnabled.mcpServers.indexOf(serverId);
        if (index !== -1) {
            defaultEnabled.mcpServers.splice(index, 1);
        }
    }
    configFile.settings.extensionsLibrary = library;
    pruneMissingExtensionReferences(configFile);
    new ExtensionsWriter().reconcileLibraryChanges(previousLibrary, library);
    await configManager.save(configFile);
    ui.displaySuccess(`✅ MCP server "${server.name}" removed successfully!`);
}
export async function handleMcpListCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const configFile = await configManager.load();
    const library = configFile.settings.extensionsLibrary || {
        mcpServers: {},
        skills: {},
        subagents: {},
    };
    const mcpServers = library.mcpServers;
    if (Object.keys(mcpServers).length === 0) {
        ui.displayInfo('No MCP servers found.');
        ui.displayInfo('Use "start-claude mcp add" to add a new MCP server.');
        return;
    }
    ui.displayInfo(`\n📦 MCP Servers (${Object.keys(mcpServers).length}):\n`);
    for (const [id, server] of Object.entries(mcpServers)) {
        ui.displayInfo(`  • ${server.name} (${id})`);
        if (server.description) {
            ui.displayInfo(`    ${server.description}`);
        }
        ui.displayInfo(`    Type: ${server.type}`);
        if (server.scope) {
            ui.displayInfo(`    Scope: ${server.scope}`);
        }
        if (options.verbose) {
            if (server.type === 'stdio') {
                ui.displayVerbose(`    Command: ${server.command}`);
                if (server.args && server.args.length > 0) {
                    ui.displayVerbose(`    Args: ${server.args.join(' ')}`);
                }
                if (server.env && Object.keys(server.env).length > 0) {
                    ui.displayVerbose(`    Env vars: ${Object.keys(server.env).join(', ')}`);
                }
            }
            else if (server.type === 'http' || server.type === 'sse') {
                ui.displayVerbose(`    URL: ${server.url}`);
                if (server.headers && Object.keys(server.headers).length > 0) {
                    ui.displayVerbose(`    Headers: ${Object.keys(server.headers).join(', ')}`);
                }
            }
        }
        ui.displayInfo('');
    }
}
export async function handleMcpGetCommand(name, options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const configFile = await configManager.load();
    const library = configFile.settings.extensionsLibrary || {
        mcpServers: {},
        skills: {},
        subagents: {},
    };
    let server = null;
    if (library.mcpServers[name]) {
        server = library.mcpServers[name];
    }
    else {
        for (const srv of Object.values(library.mcpServers)) {
            if (srv.name === name || srv.name.toLowerCase() === name.toLowerCase()) {
                server = srv;
                break;
            }
        }
    }
    if (!server) {
        ui.displayError(`MCP server "${name}" not found.`);
        ui.displayInfo('Use "start-claude mcp list" to see available servers.');
        return;
    }
    ui.displayInfo(`\n📦 MCP Server: ${server.name}\n`);
    ui.displayInfo(`ID: ${server.id}`);
    ui.displayInfo(`Type: ${server.type}`);
    if (server.scope) {
        ui.displayInfo(`Scope: ${server.scope}`);
    }
    if (server.description) {
        ui.displayInfo(`Description: ${server.description}`);
    }
    if (server.type === 'stdio') {
        ui.displayInfo(`\nCommand Configuration:`);
        ui.displayInfo(`  Command: ${server.command}`);
        if (server.args && server.args.length > 0) {
            ui.displayInfo(`  Args: ${server.args.join(' ')}`);
        }
        if (server.env && Object.keys(server.env).length > 0) {
            ui.displayInfo(`  Environment Variables:`);
            for (const [key, value] of Object.entries(server.env)) {
                ui.displayInfo(`    ${key}=${value}`);
            }
        }
    }
    else if (server.type === 'http' || server.type === 'sse') {
        ui.displayInfo(`\n${server.type.toUpperCase()} Configuration:`);
        ui.displayInfo(`  URL: ${server.url}`);
        if (server.headers && Object.keys(server.headers).length > 0) {
            ui.displayInfo(`  Headers:`);
            for (const [key, value] of Object.entries(server.headers)) {
                ui.displayInfo(`    ${key}: ${value}`);
            }
        }
    }
}
export async function handleMcpAddJsonCommand(name, jsonStr, options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const scope = options.scope || 'user';
    if (!['local', 'user'].includes(scope)) {
        ui.displayError(`Invalid scope: ${scope}. Must be local or user.`);
        return;
    }
    let parsedConfig;
    try {
        parsedConfig = JSON.parse(jsonStr);
    }
    catch (error) {
        ui.displayError(`Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`);
        return;
    }
    let serverConfig;
    try {
        serverConfig = parseMcpServerConfig(parsedConfig);
    }
    catch (error) {
        ui.displayError(`Invalid MCP server config: ${error instanceof Error ? error.message : 'Validation error'}`);
        return;
    }
    const configFile = await configManager.load();
    const library = configFile.settings.extensionsLibrary || {
        mcpServers: {},
        skills: {},
        subagents: {},
    };
    const serverName = name.trim();
    if (!serverName) {
        ui.displayError('MCP server name is required.');
        return;
    }
    if (hasServerName(library, serverName)) {
        ui.displayError(`An MCP server named "${serverName}" already exists.`);
        return;
    }
    const baseId = generateId(serverName);
    const id = getUniqueId(baseId, library.mcpServers);
    const server = {
        id,
        name: serverName,
        type: serverConfig.type,
        scope: scope,
    };
    if (serverConfig.type === 'stdio') {
        server.command = serverConfig.command;
        if (serverConfig.args) {
            server.args = serverConfig.args;
        }
        if (serverConfig.env) {
            server.env = serverConfig.env;
        }
    }
    else if (serverConfig.type === 'http' || serverConfig.type === 'sse') {
        server.url = serverConfig.url;
        if (serverConfig.headers) {
            server.headers = serverConfig.headers;
        }
    }
    if (serverConfig.description) {
        server.description = serverConfig.description;
    }
    library.mcpServers[id] = server;
    if (scope === 'user') {
        const defaultEnabled = configFile.settings.defaultEnabledExtensions || {
            mcpServers: [],
            skills: [],
            subagents: [],
        };
        if (!defaultEnabled.mcpServers.includes(id)) {
            defaultEnabled.mcpServers.push(id);
        }
        configFile.settings.defaultEnabledExtensions = defaultEnabled;
    }
    configFile.settings.extensionsLibrary = library;
    await configManager.save(configFile);
    ui.displaySuccess(`✅ MCP server "${name}" added successfully!`);
    ui.displayInfo(`   ID: ${id}`);
    ui.displayInfo(`   Type: ${server.type}`);
    ui.displayInfo(`   Scope: ${scope}`);
}
