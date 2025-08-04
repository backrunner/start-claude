import type { ClaudeConfig } from '../core/types'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { displayError, displayInfo, displaySuccess, displayWarning } from './ui'

const tempFiles = new Set<string>()

export function cleanupTempFiles(): void {
  tempFiles.forEach((file) => {
    try {
      if (existsSync(file)) {
        unlinkSync(file)
      }
    }
    catch {
      // Ignore cleanup errors
    }
  })
  tempFiles.clear()
}

// Setup cleanup on process exit
process.on('exit', cleanupTempFiles)
process.on('SIGINT', () => {
  cleanupTempFiles()
  process.exit(0)
})
process.on('SIGTERM', () => {
  cleanupTempFiles()
  process.exit(0)
})

function detectEditor(): string | null {
  // Check environment variables first
  const editors = [
    process.env.EDITOR,
    process.env.VISUAL,
  ].filter(Boolean)

  // Platform-specific editor detection
  const platformEditors = process.platform === 'win32'
    ? [
        'code', // VS Code
        'cursor', // Cursor
        'windsurf', // Windsurf
        'trae', // Trae
        'notepad', // Notepad
      ]
    : process.platform === 'darwin'
      ? [
          'code', // VS Code
          'cursor', // Cursor
          'windsurf', // Windsurf
          'trae', // Trae
          'open', // System default
        ]
      : [
          'code', // VS Code
          'cursor', // Cursor
          'windsurf', // Windsurf
          'trae', // Trae
          'nano', // Nano
          'vim', // Vim
          'vi', // Vi
        ]

  const allEditors = [...editors, ...platformEditors]

  // Test each editor to see if it's available
  for (const editor of allEditors) {
    if (editor && isCommandAvailable(editor)) {
      return editor
    }
  }

  return null
}

function isCommandAvailable(command: string): boolean {
  try {
    const result = spawn(process.platform === 'win32' ? 'where' : 'which', [command], {
      stdio: 'ignore',
    })
    return result.pid !== undefined
  }
  catch {
    return false
  }
}

function createTempConfigFile(config: Partial<ClaudeConfig>, prefix = 'start-claude-config'): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), prefix))
  const tempFile = path.join(tempDir, 'config.json')

  // Create the actual config object for editing (not a template)
  const editableConfig = {
    ...config,
    // Ensure required fields have defaults
    name: config.name || '',
    baseUrl: config.baseUrl || '',
    apiKey: config.apiKey || '',
    model: config.model || '',
    permissionMode: config.permissionMode || null,
    isDefault: config.isDefault || false,

    // Environment variables for Claude Code (keep existing values or set to null/empty)
    authToken: config.authToken || '',
    customHeaders: config.customHeaders || '',
    smallFastModel: config.smallFastModel || '',
    smallFastModelAwsRegion: config.smallFastModelAwsRegion || '',
    awsBearerTokenBedrock: config.awsBearerTokenBedrock || '',
    bashDefaultTimeoutMs: config.bashDefaultTimeoutMs ?? null,
    bashMaxTimeoutMs: config.bashMaxTimeoutMs ?? null,
    bashMaxOutputLength: config.bashMaxOutputLength ?? null,
    maintainProjectWorkingDir: config.maintainProjectWorkingDir ?? null,
    apiKeyHelperTtlMs: config.apiKeyHelperTtlMs ?? null,
    ideSkipAutoInstall: config.ideSkipAutoInstall ?? null,
    maxOutputTokens: config.maxOutputTokens ?? null,
    useBedrock: config.useBedrock ?? null,
    useVertex: config.useVertex ?? null,
    skipBedrockAuth: config.skipBedrockAuth ?? null,
    skipVertexAuth: config.skipVertexAuth ?? null,
    disableNonessentialTraffic: config.disableNonessentialTraffic ?? null,
    disableTerminalTitle: config.disableTerminalTitle ?? null,
    disableAutoupdater: config.disableAutoupdater ?? null,
    disableBugCommand: config.disableBugCommand ?? null,
    disableCostWarnings: config.disableCostWarnings ?? null,
    disableErrorReporting: config.disableErrorReporting ?? null,
    disableNonEssentialModelCalls: config.disableNonEssentialModelCalls ?? null,
    disableTelemetry: config.disableTelemetry ?? null,
    httpProxy: config.httpProxy || '',
    httpsProxy: config.httpsProxy || '',
    maxThinkingTokens: config.maxThinkingTokens ?? null,
    mcpTimeout: config.mcpTimeout ?? null,
    mcpToolTimeout: config.mcpToolTimeout ?? null,
    maxMcpOutputTokens: config.maxMcpOutputTokens ?? null,
    vertexRegionHaiku: config.vertexRegionHaiku || '',
    vertexRegionSonnet: config.vertexRegionSonnet || '',
    vertexRegion37Sonnet: config.vertexRegion37Sonnet || '',
    vertexRegion40Opus: config.vertexRegion40Opus || '',
    vertexRegion40Sonnet: config.vertexRegion40Sonnet || '',
  }

  writeFileSync(tempFile, JSON.stringify(editableConfig, null, 2), 'utf8')
  tempFiles.add(tempFile)

  return tempFile
}

async function openEditor(filePath: string, editor: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const editorArgs = []

    // Special handling for certain editors
    if (editor === 'code' || editor === 'cursor' || editor === 'windsurf') {
      editorArgs.push('--wait')
    }
    else if (editor === 'open' && process.platform === 'darwin') {
      editorArgs.push('-W', '-t')
    }

    editorArgs.push(filePath)

    const child = spawn(editor, editorArgs, {
      stdio: 'inherit',
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      }
      else {
        reject(new Error(`Editor exited with code ${code}`))
      }
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

function parseConfigFromFile(filePath: string): ClaudeConfig | null {
  try {
    const content = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(content)

    // Validate required fields
    if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
      displayError('Configuration name is required')
      return null
    }

    // Clean and validate the config
    const config: ClaudeConfig = {
      name: parsed.name.trim(),
      baseUrl: parsed.baseUrl?.trim() || undefined,
      apiKey: parsed.apiKey?.trim() || undefined,
      model: parsed.model?.trim() || undefined,
      permissionMode: parsed.permissionMode && ['default', 'acceptEdits', 'plan', 'bypassPermissions'].includes(parsed.permissionMode)
        ? parsed.permissionMode
        : undefined,
      isDefault: Boolean(parsed.isDefault),

      // Environment variables for Claude Code
      authToken: parsed.authToken?.trim() || undefined,
      customHeaders: parsed.customHeaders?.trim() || undefined,
      smallFastModel: parsed.smallFastModel?.trim() || undefined,
      smallFastModelAwsRegion: parsed.smallFastModelAwsRegion?.trim() || undefined,
      awsBearerTokenBedrock: parsed.awsBearerTokenBedrock?.trim() || undefined,
      bashDefaultTimeoutMs: typeof parsed.bashDefaultTimeoutMs === 'number' ? parsed.bashDefaultTimeoutMs : undefined,
      bashMaxTimeoutMs: typeof parsed.bashMaxTimeoutMs === 'number' ? parsed.bashMaxTimeoutMs : undefined,
      bashMaxOutputLength: typeof parsed.bashMaxOutputLength === 'number' ? parsed.bashMaxOutputLength : undefined,
      maintainProjectWorkingDir: typeof parsed.maintainProjectWorkingDir === 'boolean' ? parsed.maintainProjectWorkingDir : undefined,
      apiKeyHelperTtlMs: typeof parsed.apiKeyHelperTtlMs === 'number' ? parsed.apiKeyHelperTtlMs : undefined,
      ideSkipAutoInstall: typeof parsed.ideSkipAutoInstall === 'boolean' ? parsed.ideSkipAutoInstall : undefined,
      maxOutputTokens: typeof parsed.maxOutputTokens === 'number' ? parsed.maxOutputTokens : undefined,
      useBedrock: typeof parsed.useBedrock === 'boolean' ? parsed.useBedrock : undefined,
      useVertex: typeof parsed.useVertex === 'boolean' ? parsed.useVertex : undefined,
      skipBedrockAuth: typeof parsed.skipBedrockAuth === 'boolean' ? parsed.skipBedrockAuth : undefined,
      skipVertexAuth: typeof parsed.skipVertexAuth === 'boolean' ? parsed.skipVertexAuth : undefined,
      disableNonessentialTraffic: typeof parsed.disableNonessentialTraffic === 'boolean' ? parsed.disableNonessentialTraffic : undefined,
      disableTerminalTitle: typeof parsed.disableTerminalTitle === 'boolean' ? parsed.disableTerminalTitle : undefined,
      disableAutoupdater: typeof parsed.disableAutoupdater === 'boolean' ? parsed.disableAutoupdater : undefined,
      disableBugCommand: typeof parsed.disableBugCommand === 'boolean' ? parsed.disableBugCommand : undefined,
      disableCostWarnings: typeof parsed.disableCostWarnings === 'boolean' ? parsed.disableCostWarnings : undefined,
      disableErrorReporting: typeof parsed.disableErrorReporting === 'boolean' ? parsed.disableErrorReporting : undefined,
      disableNonEssentialModelCalls: typeof parsed.disableNonEssentialModelCalls === 'boolean' ? parsed.disableNonEssentialModelCalls : undefined,
      disableTelemetry: typeof parsed.disableTelemetry === 'boolean' ? parsed.disableTelemetry : undefined,
      httpProxy: parsed.httpProxy?.trim() || undefined,
      httpsProxy: parsed.httpsProxy?.trim() || undefined,
      maxThinkingTokens: typeof parsed.maxThinkingTokens === 'number' ? parsed.maxThinkingTokens : undefined,
      mcpTimeout: typeof parsed.mcpTimeout === 'number' ? parsed.mcpTimeout : undefined,
      mcpToolTimeout: typeof parsed.mcpToolTimeout === 'number' ? parsed.mcpToolTimeout : undefined,
      maxMcpOutputTokens: typeof parsed.maxMcpOutputTokens === 'number' ? parsed.maxMcpOutputTokens : undefined,
      vertexRegionHaiku: parsed.vertexRegionHaiku?.trim() || undefined,
      vertexRegionSonnet: parsed.vertexRegionSonnet?.trim() || undefined,
      vertexRegion37Sonnet: parsed.vertexRegion37Sonnet?.trim() || undefined,
      vertexRegion40Opus: parsed.vertexRegion40Opus?.trim() || undefined,
      vertexRegion40Sonnet: parsed.vertexRegion40Sonnet?.trim() || undefined,
    }

    return config
  }
  catch (error) {
    displayError(`Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return null
  }
}

export async function editConfigInEditor(config: ClaudeConfig): Promise<ClaudeConfig | null> {
  const editor = detectEditor()
  if (!editor) {
    displayError('No suitable editor found. Please set EDITOR environment variable or install VS Code, Cursor, Windsurf, or another supported editor.')
    return null
  }

  displayInfo(`Opening configuration in ${editor}...`)

  const tempFile = createTempConfigFile(config)

  try {
    await openEditor(tempFile, editor)

    const updatedConfig = parseConfigFromFile(tempFile)
    if (updatedConfig) {
      displaySuccess('Configuration updated successfully!')
      return updatedConfig
    }

    return null
  }
  catch (error) {
    displayError(`Failed to open editor: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return null
  }
  finally {
    // Clean up temp file
    if (tempFiles.has(tempFile)) {
      tempFiles.delete(tempFile)
      try {
        unlinkSync(tempFile)
      }
      catch {
        // Ignore cleanup errors
      }
    }
  }
}

export async function createConfigInEditor(): Promise<ClaudeConfig | null> {
  const editor = detectEditor()
  if (!editor) {
    displayError('No suitable editor found. Please set EDITOR environment variable or install VS Code, Cursor, Windsurf, or another supported editor.')
    return null
  }

  displayInfo(`Creating new configuration in ${editor}...`)
  displayWarning('Please fill in the configuration details and save the file.')

  const tempFile = createTempConfigFile({})

  try {
    await openEditor(tempFile, editor)

    const newConfig = parseConfigFromFile(tempFile)
    if (newConfig) {
      displaySuccess('Configuration created successfully!')
      return newConfig
    }

    return null
  }
  catch (error) {
    displayError(`Failed to open editor: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return null
  }
  finally {
    // Clean up temp file
    if (tempFiles.has(tempFile)) {
      tempFiles.delete(tempFile)
      try {
        unlinkSync(tempFile)
      }
      catch {
        // Ignore cleanup errors
      }
    }
  }
}
