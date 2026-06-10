import { spawn } from 'node:child_process';
import process from 'node:process';
import { UILogger } from '../cli/ui';
import { findExecutable } from '../system/path-utils';
export function isMcpCommand(args) {
    return args.length > 0 && args[0] === 'mcp';
}
export async function handleMcpPassthrough(args) {
    const claudePath = findExecutable('claude', { env: process.env, skipDirs: ['.start-claude'] });
    if (claudePath) {
        const claude = spawn(claudePath, args, {
            stdio: 'inherit',
            env: process.env,
            shell: process.platform === 'win32',
        });
        claude.on('close', (code) => {
            process.exit(code ?? 0);
        });
        claude.on('error', (error) => {
            const ui = new UILogger();
            ui.error(`Failed to start Claude: ${error.message}`);
            process.exit(1);
        });
    }
    else {
        const ui = new UILogger();
        ui.error('❌ Claude CLI not found. Please install Claude Code first.');
        process.exit(1);
    }
}
export function initializeMcpPassthrough() {
    const args = process.argv.slice(2);
    if (isMcpCommand(args)) {
        process.argv = [process.argv[0], process.argv[1]];
        handleMcpPassthrough(args).catch((error) => {
            const ui = new UILogger();
            ui.error(`MCP passthrough failed: ${error.message}`);
            process.exit(1);
        });
        return true;
    }
    return false;
}
