import type { ClaudeConfig } from '../../config/types'
import { exec, execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync, unlinkSync, unwatchFile, watchFile, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { UILogger } from './ui'

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
        'notepad.exe', // Notepad with .exe extension
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

  // Final fallback - these should always work on their respective platforms
  if (process.platform === 'win32') {
    // On Windows, notepad should always be available
    return 'notepad'
  }
  else if (process.platform === 'darwin') {
    return 'open'
  }

  return null
}

function getWindowsEditorPath(editorName: string): string | null {
  if (process.platform !== 'win32') {
    return editorName
  }

  // Try to get the full path using 'where' command
  try {
    const result = execSync(`where "${editorName}"`, { encoding: 'utf8', stdio: 'pipe' })
    const paths = result.trim().split('\n').filter(Boolean)
    if (paths.length > 0) {
      return paths[0].trim() // Return the first found path
    }
  }
  catch {
    // If 'where' fails, try common installation paths
    const commonPaths: Record<string, string[]> = {
      code: [
        `${process.env.LOCALAPPDATA}\\Programs\\Microsoft VS Code\\Code.exe`,
        `${process.env.PROGRAMFILES}\\Microsoft VS Code\\Code.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Microsoft VS Code\\Code.exe`,
      ],
      cursor: [
        `${process.env.LOCALAPPDATA}\\Programs\\cursor\\Cursor.exe`,
        `${process.env.PROGRAMFILES}\\Cursor\\Cursor.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Cursor\\Cursor.exe`,
      ],
      windsurf: [
        `${process.env.LOCALAPPDATA}\\Programs\\Windsurf\\Windsurf.exe`,
        `${process.env.PROGRAMFILES}\\Windsurf\\Windsurf.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Windsurf\\Windsurf.exe`,
      ],
    }

    const paths = commonPaths[editorName.toLowerCase()]
    if (paths) {
      for (const path of paths) {
        if (path && existsSync(path)) {
          return path
        }
      }
    }
  }

  return null
}

function isCommandAvailable(command: string): boolean {
  try {
    if (process.platform === 'win32') {
      // On Windows, try to get the full path first
      const fullPath = getWindowsEditorPath(command)
      if (fullPath && fullPath !== command && existsSync(fullPath)) {
        return true
      }

      // Fallback to 'where' command
      try {
        execSync(`where "${command}"`, { stdio: 'ignore' })
        return true
      }
      catch {
        return false
      }
    }
    else {
      // On Unix-like systems, use execSync with 'which' command
      try {
        execSync(`which "${command}"`, { stdio: 'ignore' })
        return true
      }
      catch {
        return false
      }
    }
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
    order: config.order ?? null, // Lower numbers are prioritized first (0 = highest priority)

    // Environment variables for Claude Code (keep existing values or set to null/empty)
    authToken: config.authToken || '',
    authorization: config.authorization || '',
    claudeCodeDisableNonessentialTraffic: config.claudeCodeDisableNonessentialTraffic ?? true,
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
    disableTelemetry: config.disableTelemetry ?? true,
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
    const editorArgs: string[] = []

    // Special handling for certain editors
    if (editor === 'code' || editor === 'cursor' || editor === 'windsurf') {
      editorArgs.push('--wait')
    }
    else if (editor === 'open' && process.platform === 'darwin') {
      editorArgs.push('-W', '-t')
    }

    // On Windows, try to get the full path to the executable
    let editorCommand = editor
    if (process.platform === 'win32') {
      const fullPath = getWindowsEditorPath(editor)
      if (fullPath) {
        editorCommand = fullPath
      }
    }

    // Build the command string - quote the editor path if it contains spaces
    const quotedEditor = editorCommand.includes(' ') ? `"${editorCommand}"` : editorCommand
    const commandArgs = [...editorArgs, `"${filePath}"`].join(' ')
    const fullCommand = `${quotedEditor} ${commandArgs}`

    // Use exec instead of spawn for better Windows compatibility
    // exec uses the shell to resolve paths and handles Windows executables better
    const child = exec(fullCommand, (error) => {
      if (error) {
        reject(error)
      }
      else {
        resolve()
      }
    })

    // Handle the case where the process exits before exec callback
    if (child) {
      child.on('error', (error) => {
        reject(error)
      })
    }
  })
}

async function openEditorWithFallback(filePath: string, primaryEditor: string): Promise<void> {
  try {
    await openEditor(filePath, primaryEditor)
  }
  catch (error) {
    const logger = new UILogger()
    logger.displayWarning(`Failed to open ${primaryEditor}: ${error instanceof Error ? error.message : 'Unknown error'}`)

    // Try fallback editors based on platform
    const fallbackEditors = process.platform === 'win32'
      ? ['notepad.exe', 'notepad']
      : process.platform === 'darwin'
        ? ['open']
        : ['nano', 'vim', 'vi']

    for (const fallbackEditor of fallbackEditors) {
      try {
        logger.displayInfo(`Trying fallback editor: ${fallbackEditor}`)
        await openEditor(filePath, fallbackEditor)
        return // Success, exit the function
      }
      catch (fallbackError) {
        logger.displayWarning(`Fallback editor ${fallbackEditor} also failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`)
      }
    }

    // If all fallbacks fail, throw the original error
    throw new Error(`All editors failed. Last error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function parseConfigFromFile(filePath: string): ClaudeConfig | null {
  try {
    const content = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(content)

    // Validate required fields
    if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
      const logger = new UILogger()
      logger.displayError('Configuration name is required')
      return null
    }

    // Clean and validate the config
    const config: ClaudeConfig = {
      name: parsed.name.trim(),
      profileType: parsed.profileType && ['default', 'official'].includes(parsed.profileType)
        ? parsed.profileType
        : undefined,
      baseUrl: parsed.baseUrl?.trim() || undefined,
      apiKey: parsed.apiKey?.trim() || undefined,
      model: parsed.model?.trim() || undefined,
      permissionMode: parsed.permissionMode && ['default', 'acceptEdits', 'plan', 'bypassPermissions'].includes(parsed.permissionMode)
        ? parsed.permissionMode
        : undefined,
      isDefault: Boolean(parsed.isDefault),
      order: typeof parsed.order === 'number' ? parsed.order : undefined,

      // Environment variables for Claude Code
      authToken: parsed.authToken?.trim() || undefined,
      authorization: parsed.authorization?.trim() || undefined,
      claudeCodeDisableNonessentialTraffic: typeof parsed.claudeCodeDisableNonessentialTraffic === 'boolean' ? parsed.claudeCodeDisableNonessentialTraffic : true,
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
      vertexRegion45Sonnet: parsed.vertexRegion45Sonnet?.trim() || undefined,
    }

    return config
  }
  catch (error) {
    const logger = new UILogger()
    logger.displayError(`Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return null
  }
}

export async function editConfigInEditor(config: ClaudeConfig): Promise<ClaudeConfig | null> {
  const editor = detectEditor()
  if (!editor) {
    const logger = new UILogger()
    logger.displayError('No suitable editor found. Please set EDITOR environment variable or install VS Code, Cursor, Windsurf, or another supported editor.')
    return null
  }

  const logger = new UILogger()
  logger.displayInfo(`Opening configuration in ${editor}...`)

  const tempFile = createTempConfigFile(config)

  try {
    await openEditorWithFallback(tempFile, editor)

    const updatedConfig = parseConfigFromFile(tempFile)
    if (updatedConfig) {
      logger.displaySuccess('Configuration updated successfully!')
      return updatedConfig
    }

    return null
  }
  catch (error) {
    const logger = new UILogger()
    logger.displayError(`Failed to open editor: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
    const logger = new UILogger()
    logger.displayError('No suitable editor found. Please set EDITOR environment variable or install VS Code, Cursor, Windsurf, or another supported editor.')
    return null
  }

  const logger = new UILogger()
  logger.displayInfo(`Creating new configuration in ${editor}...`)
  logger.displayWarning('Please fill in the configuration details and save the file.')

  const tempFile = createTempConfigFile({})

  try {
    await openEditorWithFallback(tempFile, editor)

    const newConfig = parseConfigFromFile(tempFile)
    if (newConfig) {
      logger.displaySuccess('Configuration created successfully!')
      return newConfig
    }

    return null
  }
  catch (error) {
    const logger = new UILogger()
    logger.displayError(`Failed to open editor: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

export async function editConfigFileInEditor(configFilePath: string, onConfigReload: (config: any) => void): Promise<void> {
  const editor = detectEditor()
  if (!editor) {
    const logger = new UILogger()
    logger.displayError('No suitable editor found. Please set EDITOR environment variable or install VS Code, Cursor, Windsurf, or another supported editor.')
    return
  }

  const logger = new UILogger()
  logger.displayInfo(`Opening configuration file in ${editor}...`)
  logger.displayInfo(`Config file: ${configFilePath}`)
  logger.displayInfo('💡 Save the file to reload the configuration automatically. Press Ctrl+C to stop watching.')

  // Start watching the file for changes
  let isWatching = true
  let lastModified = 0

  const watchCallback = (): void => {
    try {
      const stats = existsSync(configFilePath) ? statSync(configFilePath) : null
      if (stats && stats.mtime.getTime() !== lastModified) {
        lastModified = stats.mtime.getTime()

        logger.displayInfo('🔄 Configuration file changed, reloading...')

        try {
          const content = readFileSync(configFilePath, 'utf8')
          const config = JSON.parse(content)
          onConfigReload(config)
          logger.displaySuccess('✅ Configuration reloaded successfully!')
        }
        catch (error) {
          logger.displayError(`❌ Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
    }
    catch (error) {
      logger.displayError(`❌ Error watching config file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Initial modification time
  if (existsSync(configFilePath)) {
    const stats = statSync(configFilePath)
    lastModified = stats.mtime.getTime()
  }

  // Start watching
  watchFile(configFilePath, { interval: 1000 }, watchCallback)

  // Handle process interruption
  const cleanup = (): void => {
    if (isWatching) {
      unwatchFile(configFilePath, watchCallback)
      isWatching = false
      logger.displayInfo('🛑 Stopped watching configuration file.')
    }
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  try {
    await openEditorWithFallback(configFilePath, editor)
  }
  catch (error) {
    logger.displayError(`Failed to open editor: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
  finally {
    cleanup()
  }
}
