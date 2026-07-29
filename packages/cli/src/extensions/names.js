const INVALID_SKILL_NAME_CHARACTERS = /[<>:"/\\|?*]/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const SAFE_SUBAGENT_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export function isSafeSkillName(name) {
    return name.length > 0
        && name.length <= 128
        && name === name.trim()
        && name !== '.'
        && name !== '..'
        && !name.endsWith('.')
        && !INVALID_SKILL_NAME_CHARACTERS.test(name)
        && !Array.from(name).some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
        && !WINDOWS_RESERVED_NAME.test(name);
}
export function isSafeSubagentName(name) {
    return SAFE_SUBAGENT_NAME.test(name);
}
