import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const SHELL_SCRIPTS = {
  bash: path.join(os.homedir(), '.bashrc'),
  zsh: path.join(os.homedir(), '.zshrc'),
  fish: path.join(os.homedir(), '.config/fish/config.fish'),
}

const ALIAS_COMMENT = '# start-claude override'
const ALIAS_LINE = 'alias claude="start-claude"'

export class OverrideManager {
  private getShellConfigFile(): string | null {
    const shell = process.env.SHELL?.split('/').pop()

    if (shell === 'zsh' && fs.existsSync(SHELL_SCRIPTS.zsh)) {
      return SHELL_SCRIPTS.zsh
    }
    if (shell === 'bash' && fs.existsSync(SHELL_SCRIPTS.bash)) {
      return SHELL_SCRIPTS.bash
    }
    if (shell === 'fish' && fs.existsSync(SHELL_SCRIPTS.fish)) {
      return SHELL_SCRIPTS.fish
    }

    return null
  }

  private getAliasLines(): string[] {
    return [ALIAS_COMMENT, ALIAS_LINE]
  }

  isOverrideActive(): boolean {
    const configFile = this.getShellConfigFile()
    if (configFile === null)
      return false

    try {
      const content = fs.readFileSync(configFile, 'utf-8')
      return content.includes(ALIAS_LINE)
    }
    catch {
      return false
    }
  }

  enableOverride(): boolean {
    const configFile = this.getShellConfigFile()
    if (configFile === null)
      return false

    try {
      let content = ''
      if (fs.existsSync(configFile)) {
        content = fs.readFileSync(configFile, 'utf-8')
      }

      if (content.includes(ALIAS_LINE)) {
        return true
      }

      const aliasLines = this.getAliasLines()
      const newContent = `${content.trim()}\n\n${aliasLines.join('\n')}\n`

      fs.writeFileSync(configFile, newContent)
      return true
    }
    catch {
      return false
    }
  }

  disableOverride(): boolean {
    const configFile = this.getShellConfigFile()
    if (configFile === null)
      return false

    try {
      if (!fs.existsSync(configFile)) {
        return true
      }

      const content = fs.readFileSync(configFile, 'utf-8')
      const lines = content.split('\n')

      const filteredLines = lines.filter(line =>
        !line.includes(ALIAS_COMMENT) && !line.includes(ALIAS_LINE),
      )

      const newContent = filteredLines.join('\n')
      fs.writeFileSync(configFile, newContent)
      return true
    }
    catch {
      return false
    }
  }

  getShellInfo(): { shell: string | null, configFile: string | null } {
    const shell = process.env.SHELL?.split('/').pop() ?? null
    const configFile = this.getShellConfigFile()
    return { shell, configFile }
  }
}
