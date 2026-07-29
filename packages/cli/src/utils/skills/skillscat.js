import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import process from 'node:process';
export function buildSkillsCatAddArgs(source, options = {}) {
    const normalizedSource = source.trim();
    if (!normalizedSource) {
        throw new Error('Skill source is required');
    }
    if (normalizedSource.startsWith('-')) {
        throw new Error('Skill source cannot start with a hyphen');
    }
    const skills = options.skill?.map(skill => skill.trim());
    if (skills?.some(skill => !skill || skill.startsWith('-'))) {
        throw new Error('Skill names must be non-empty and cannot start with a hyphen');
    }
    const args = [
        ...(options.verbose ? ['--verbose'] : []),
        'add',
        normalizedSource,
        '--agent',
        'claude-code',
    ];
    if (options.repo) {
        args.push('--repo');
    }
    if (skills?.length) {
        args.push('--skill', ...skills);
    }
    if (options.yes) {
        args.push('--yes');
    }
    if (options.force) {
        args.push('--force');
    }
    return args;
}
export function resolveSkillsCatEntrypoint(runtimeEntry = process.argv[1] || join(process.cwd(), 'package.json')) {
    const runtimePath = resolve(runtimeEntry);
    const resolutionBase = existsSync(runtimePath) ? realpathSync(runtimePath) : runtimePath;
    const runtimeRequire = createRequire(resolutionBase);
    return runtimeRequire.resolve('skillscat/dist/index.js');
}
export async function runSkillsCatAdd(source, options = {}, runOptions = {}) {
    const entrypoint = runOptions.entrypoint || resolveSkillsCatEntrypoint();
    const args = buildSkillsCatAddArgs(source, options);
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [entrypoint, ...args], {
            cwd: runOptions.cwd || process.cwd(),
            env: runOptions.env || process.env,
            shell: false,
            stdio: runOptions.stdio || 'inherit',
        });
        child.once('error', (error) => {
            reject(new Error(`Failed to start SkillsCat: ${error.message}`));
        });
        child.once('close', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            const exitReason = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
            reject(new Error(`SkillsCat exited with ${exitReason}`));
        });
    });
}
